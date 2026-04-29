import express from 'express';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3001);
const API_KEY = process.env.API_KEY;
const SYNC_INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS || 5000);

if (!API_KEY) throw new Error('Missing API_KEY in environment variables.');

function buildDbConfig(prefix) {
  return {
    host: process.env[`${prefix}_HOST`],
    port: Number(process.env[`${prefix}_PORT`] || 3306),
    user: process.env[`${prefix}_USER`],
    password: process.env[`${prefix}_PASS`],
    database: process.env[`${prefix}_NAME`],
    timezone: process.env.DB_TIMEZONE || 'Z',
    ssl: process.env[`${prefix}_SSL`] === 'true' ? {} : undefined,
  };
}

const cpanelPool = mysql.createPool(buildDbConfig('CPANEL_DB'));
const appPool = mysql.createPool(buildDbConfig('APP_DB'));

const syncState = { running: false, lastSyncAt: null, lastError: null };

function authMiddleware(req, res, next) {
  if (req.header('x-api-key') !== API_KEY) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  return next();
}

async function fetchUsers(pool) {
  const [rows] = await pool.query('SELECT id, email, nombre, telefono, role, password_hash, is_admin, active, created_at, updated_at FROM abogapp_users');
  return rows;
}

async function upsertUser(pool, user) {
  await pool.query(
    `INSERT INTO abogapp_users (email, nombre, telefono, role, password_hash, is_admin, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       nombre = VALUES(nombre), telefono = VALUES(telefono), role = VALUES(role),
       password_hash = VALUES(password_hash), is_admin = VALUES(is_admin), active = VALUES(active),
       updated_at = VALUES(updated_at)`,
    [user.email, user.nombre, user.telefono, user.role, user.password_hash, user.is_admin, user.active, user.created_at, user.updated_at]
  );
}

async function deleteMissingUsers(targetPool, sourceEmails) {
  if (!sourceEmails.length) return targetPool.query('DELETE FROM abogapp_users');
  const placeholders = sourceEmails.map(() => '?').join(',');
  await targetPool.query(`DELETE FROM abogapp_users WHERE email NOT IN (${placeholders})`, sourceEmails);
}

async function syncFromCpanelToApp() {
  if (syncState.running) return;
  syncState.running = true;
  try {
    const sourceUsers = await fetchUsers(cpanelPool);
    for (const user of sourceUsers) await upsertUser(appPool, user);
    await deleteMissingUsers(appPool, sourceUsers.map((u) => u.email));
    syncState.lastSyncAt = new Date().toISOString();
    syncState.lastError = null;
  } catch (error) {
    syncState.lastError = error.message;
    console.error('Sync error:', error);
  } finally {
    syncState.running = false;
  }
}

app.get('/health', (_req, res) => res.json({ ok: true, service: 'abogapp sync backend' }));
app.get('/sync/status', authMiddleware, (_req, res) => res.json({ ok: true, sync: syncState }));
app.post('/sync/run', authMiddleware, async (_req, res) => {
  await syncFromCpanelToApp();
  res.json({ ok: true, sync: syncState });
});

app.get('/users', authMiddleware, async (_req, res) => {
  try {
    const users = await fetchUsers(appPool);
    res.json({ ok: true, users });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/users/upsert', authMiddleware, async (req, res) => {
  try {
    await upsertUser(appPool, req.body);
    await upsertUser(cpanelPool, req.body);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.delete('/users/:email', authMiddleware, async (req, res) => {
  try {
    await appPool.query('DELETE FROM abogapp_users WHERE email = ?', [req.params.email]);
    await cpanelPool.query('DELETE FROM abogapp_users WHERE email = ?', [req.params.email]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

setInterval(syncFromCpanelToApp, SYNC_INTERVAL_MS);
syncFromCpanelToApp();

app.listen(PORT, () => console.log(`Sync backend running on port ${PORT}`));
