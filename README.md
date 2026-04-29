# AbogApp 2.0

Versión actualizada con generador de cotizaciones sin dependencia de plantilla física DOCX.

Cambios de esta versión:
- La cotización generada inserta solo el logo del estudio jurídico en el encabezado, centrado.
- Los campos “Resumen requerimiento” y “Servicio propuesto” conservan saltos de línea en el DOCX.
- El formulario permite agregar conceptos dinámicamente.
- El monto fijo se formatea como `$xxx.xxx.-`.
- Fuente Tahoma 11 y texto negro.

---

## Backend de sincronización DB (Node.js)

Este proyecto ahora incluye un backend para sincronizar usuarios de forma bidireccional entre:
- **Base cPanel (origen principal)**
- **Base de datos de la app (destino local/remoto de tu aplicación)**

La sincronización usa la tabla `abogapp_users` y la clave de negocio es **`email`**.

## 1) Requisitos

- Node.js 18+ recomendado.
- MySQL/MariaDB accesible para ambas bases.
- SSL habilitado si el servidor lo exige.

## 2) Crear tabla `abogapp_users` (schema.sql)

Se incluye el archivo `schema.sql` para crear la tabla base.

Ejecuta en **ambas bases** (cPanel y app):

```bash
mysql -h TU_HOST -u TU_USUARIO -p TU_BD < schema.sql
```

> Si la tabla ya existe, valida que tenga al menos estas columnas:  
> `id, email, nombre, telefono, role, password_hash, is_admin, active, created_at, updated_at`.

## 3) Instalación del backend

```bash
npm install
```

## 4) Configuración de entorno (.env)

1. Copia el ejemplo:

```bash
cp .env.example .env
```

2. Edita `.env` con tus datos reales.

### Ejemplo de configuración

```env
PORT=3001
API_KEY=tu_api_key_privada
SYNC_INTERVAL_MS=5000
DB_TIMEZONE=America/Santiago

# cPanel source DB
CPANEL_DB_HOST=localhost
CPANEL_DB_PORT=3306
CPANEL_DB_NAME=gjabogad_abogapp
CPANEL_DB_USER=gjabogad_abogapp
CPANEL_DB_PASS=********
CPANEL_DB_SSL=true

# App target DB
APP_DB_HOST=localhost
APP_DB_PORT=3306
APP_DB_NAME=abogapp_local
APP_DB_USER=abogapp_local_user
APP_DB_PASS=********
APP_DB_SSL=true
```

### Notas importantes

- `CPANEL_DB_*`: base origen desde cPanel.
- `APP_DB_*`: base destino de tu app.
- `*_SSL=true` activa conexión SSL en `mysql2`.
- Nunca subas `.env` al repositorio.

## 5) Levantar el servicio

```bash
npm run start
```

Modo desarrollo (auto-reload):

```bash
npm run dev
```

Backend por defecto: `http://localhost:3001`.

## 6) Flujo de sincronización (cómo funciona)

### 6.1 Sync automático (tiempo real por intervalos)

- Cada `SYNC_INTERVAL_MS` milisegundos (default 5000):
  1. Lee usuarios desde cPanel (`abogapp_users`).
  2. Hace **upsert** en la DB de app por `email`.
  3. Elimina en app los emails que ya no existen en cPanel.

### 6.2 Sync manual

Puedes forzar sincronización con:

```bash
curl -X POST http://localhost:3001/sync/run \
  -H "x-api-key: TU_API_KEY"
```

## 7) Endpoints disponibles

### Salud
- `GET /health`

```bash
curl http://localhost:3001/health
```

### Estado de sync
- `GET /sync/status` (requiere `x-api-key`)

```bash
curl http://localhost:3001/sync/status \
  -H "x-api-key: TU_API_KEY"
```

### Ejecutar sync
- `POST /sync/run` (requiere `x-api-key`)

### Listar usuarios desde DB app
- `GET /users` (requiere `x-api-key`)

```bash
curl http://localhost:3001/users \
  -H "x-api-key: TU_API_KEY"
```

### Crear/actualizar usuario en ambas bases
- `POST /users/upsert` (requiere `x-api-key`)

```bash
curl -X POST http://localhost:3001/users/upsert \
  -H "Content-Type: application/json" \
  -H "x-api-key: TU_API_KEY" \
  -d '{
    "email": "demo@abogapp.cl",
    "nombre": "Usuario Demo",
    "telefono": "+56911111111",
    "role": "user",
    "password_hash": "$2b$10$hash_ejemplo",
    "is_admin": 0,
    "active": 1,
    "created_at": "2026-04-29 10:00:00",
    "updated_at": "2026-04-29 10:00:00"
  }'
```

### Eliminar usuario en ambas bases
- `DELETE /users/:email` (requiere `x-api-key`)

```bash
curl -X DELETE "http://localhost:3001/users/demo@abogapp.cl" \
  -H "x-api-key: TU_API_KEY"
```

## 8) Paso a paso recomendado para producción

1. Crear usuario MySQL dedicado para sync (permisos mínimos `SELECT, INSERT, UPDATE, DELETE` sobre `abogapp_users`).
2. Ejecutar `schema.sql` en cPanel y app (o validar estructura existente).
3. Configurar `.env` con credenciales reales y SSL activo.
4. Probar conexión y health endpoint.
5. Ejecutar primer sync manual (`POST /sync/run`).
6. Verificar conteo de usuarios en ambas bases.
7. Dejar servicio en ejecución con PM2/systemd/docker.
8. Monitorear `GET /sync/status` para revisar `lastSyncAt` y `lastError`.

## 9) Seguridad mínima recomendada

- Rotar `API_KEY` periódicamente.
- Restringir IPs que pueden consumir el backend.
- Forzar HTTPS en el servidor donde expongas este API.
- No reutilizar usuario root de MySQL.
