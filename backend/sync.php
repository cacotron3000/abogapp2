<?php
header('Content-Type: application/json; charset=utf-8');

$configFile = __DIR__ . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Falta backend/config.php. Copie config.sample.php y complete credenciales.']);
    exit;
}

$config = require $configFile;
$required = ['host', 'dbname', 'user', 'pass', 'charset', 'table_prefix'];
foreach ($required as $key) {
    if (!array_key_exists($key, $config)) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => "Configuración incompleta: {$key}"]);
        exit;
    }
}

$input = json_decode(file_get_contents('php://input'), true);
$action = $input['action'] ?? '';
if (!in_array($action, ['pull', 'push', 'verify_login'], true)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Acción inválida. Use pull o push.']);
    exit;
}

function tableName(string $prefix, string $entity): string {
    return preg_replace('/[^a-zA-Z0-9_]/', '', $prefix . '_' . $entity);
}

function ensureTables(PDO $pdo, string $prefix): array {
    $entities = ['clientes', 'asuntos', 'causas', 'tareas', 'plazos', 'cotizaciones', 'logs'];
    $tables = [];
    $tables['users'] = 'abogapp2_users';
    $pdo->exec("CREATE TABLE IF NOT EXISTS `abogapp2_users` (
      `id` VARCHAR(80) PRIMARY KEY,
      `email` VARCHAR(190) NOT NULL,
      `nombre` VARCHAR(190) NOT NULL,
      `telefono` VARCHAR(50) DEFAULT '',
      `role` VARCHAR(80) DEFAULT 'Abogado',
      `password_hash` VARCHAR(255) NOT NULL,
      `is_admin` TINYINT(1) NOT NULL DEFAULT 0,
      `active` TINYINT(1) NOT NULL DEFAULT 1,
      `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    foreach ($entities as $entity) {
        $table = tableName($prefix, $entity);
        $tables[$entity] = $table;
        $pdo->exec("CREATE TABLE IF NOT EXISTS `{$table}` (
          `id` VARCHAR(80) PRIMARY KEY,
          `payload` LONGTEXT NOT NULL,
          `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    }

    $meta = tableName($prefix, 'meta');
    $tables['meta'] = $meta;
    $pdo->exec("CREATE TABLE IF NOT EXISTS `{$meta}` (
      `meta_key` VARCHAR(80) PRIMARY KEY,
      `meta_value` LONGTEXT NOT NULL,
      `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    return $tables;
}

function fetchCollection(PDO $pdo, string $table): array {
    $rows = $pdo->query("SELECT payload FROM `{$table}`")->fetchAll(PDO::FETCH_ASSOC);
    $items = [];
    foreach ($rows as $row) {
        $decoded = json_decode($row['payload'], true);
        if (is_array($decoded)) {
            $items[] = $decoded;
        }
    }
    return $items;
}

function fetchUsers(PDO $pdo): array {
    try {
        $rows = $pdo->query("SELECT id, email, nombre, telefono, role, password_hash, is_admin, active, created_at, updated_at FROM `abogapp2_users`")->fetchAll(PDO::FETCH_ASSOC);
        return array_map(static function (array $row): array {
            return [
                'id' => (string)($row['id'] ?? ''),
                'correo' => (string)($row['email'] ?? ''),
                'nombre' => (string)($row['nombre'] ?? ''),
                'telefono' => (string)($row['telefono'] ?? ''),
                'rol' => (string)($row['role'] ?? 'Abogado'),
                'password' => '',
                'isAdmin' => (bool)($row['is_admin'] ?? 0),
                'activo' => (bool)($row['active'] ?? 1),
                'createdAt' => $row['created_at'] ?? null,
                'updatedAt' => $row['updated_at'] ?? null,
            ];
        }, $rows);
    } catch (Throwable $e) {
        // Compatibilidad con versión previa (id + payload JSON)
        $legacyRows = $pdo->query("SELECT id, payload, updated_at FROM `abogapp2_users`")->fetchAll(PDO::FETCH_ASSOC);
        $users = [];
        foreach ($legacyRows as $row) {
            $p = json_decode((string)($row['payload'] ?? ''), true);
            if (!is_array($p)) continue;
            $users[] = [
                'id' => (string)($p['id'] ?? $row['id'] ?? ''),
                'correo' => (string)($p['correo'] ?? ''),
                'nombre' => (string)($p['nombre'] ?? ''),
                'telefono' => (string)($p['telefono'] ?? ''),
                'rol' => (string)($p['rol'] ?? 'Abogado'),
                'password' => '',
                'isAdmin' => (bool)($p['isAdmin'] ?? false),
                'activo' => (bool)($p['activo'] ?? true),
                'createdAt' => $p['createdAt'] ?? null,
                'updatedAt' => $row['updated_at'] ?? null,
            ];
        }
        return $users;
    }
}

function replaceUsers(PDO $pdo, array $users): void {
    // Compatibilidad con servidores MySQL/MariaDB que tengan tabla legacy.
    $existing = $pdo->query("SHOW COLUMNS FROM `abogapp2_users`")->fetchAll(PDO::FETCH_ASSOC);
    $existingNames = array_map(static fn($c) => (string)$c['Field'], $existing);
    $requiredCols = [
        'email' => "ALTER TABLE `abogapp2_users` ADD COLUMN `email` VARCHAR(190) NOT NULL DEFAULT ''",
        'nombre' => "ALTER TABLE `abogapp2_users` ADD COLUMN `nombre` VARCHAR(190) NOT NULL DEFAULT ''",
        'telefono' => "ALTER TABLE `abogapp2_users` ADD COLUMN `telefono` VARCHAR(50) DEFAULT ''",
        'role' => "ALTER TABLE `abogapp2_users` ADD COLUMN `role` VARCHAR(80) DEFAULT 'Abogado'",
        'password_hash' => "ALTER TABLE `abogapp2_users` ADD COLUMN `password_hash` VARCHAR(255) NOT NULL DEFAULT ''",
        'is_admin' => "ALTER TABLE `abogapp2_users` ADD COLUMN `is_admin` TINYINT(1) NOT NULL DEFAULT 0",
        'active' => "ALTER TABLE `abogapp2_users` ADD COLUMN `active` TINYINT(1) NOT NULL DEFAULT 1",
        'created_at' => "ALTER TABLE `abogapp2_users` ADD COLUMN `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP",
    ];
    foreach ($requiredCols as $col => $ddl) {
        if (!in_array($col, $existingNames, true)) $pdo->exec($ddl);
    }

    $existingHashes = [];
    try {
        $rows = $pdo->query("SELECT id, password_hash FROM `abogapp2_users`")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as $r) $existingHashes[(string)$r['id']] = (string)($r['password_hash'] ?? '');
    } catch (Throwable $e) { $existingHashes = []; }

    $pdo->exec("DELETE FROM `abogapp2_users`");
    $stmt = $pdo->prepare("INSERT INTO `abogapp2_users`
      (id, email, nombre, telefono, role, password_hash, is_admin, active, created_at, updated_at)
      VALUES
      (:id, :email, :nombre, :telefono, :role, :password_hash, :is_admin, :active, :created_at, :updated_at)");

    foreach ($users as $user) {
        if (!is_array($user) || empty($user['id'])) continue;
        $rol = (string)($user['rol'] ?? 'Abogado');
        $plainPassword = (string)($user['password'] ?? '');
        $passwordHash = $existingHashes[(string)$user['id']] ?? '';
        if ($plainPassword !== '') {
            $passwordHash = preg_match('/^\$2y\$/', $plainPassword) ? $plainPassword : password_hash($plainPassword, PASSWORD_DEFAULT);
        }
        $stmt->execute([
            'id' => (string)$user['id'],
            'email' => (string)($user['correo'] ?? ''),
            'nombre' => (string)($user['nombre'] ?? ''),
            'telefono' => (string)($user['telefono'] ?? ''),
            'role' => $rol,
            'password_hash' => $passwordHash,
            'is_admin' => (int)(($user['isAdmin'] ?? null) ? 1 : ($rol === 'Administrador' ? 1 : 0)),
            'active' => (int)(($user['activo'] ?? true) ? 1 : 0),
            'created_at' => $user['createdAt'] ?? null,
            'updated_at' => $user['updatedAt'] ?? null,
        ]);
    }
}

function replaceCollection(PDO $pdo, string $table, array $items): void {
    // Usar DELETE en vez de TRUNCATE para evitar commit implícito en MySQL
    // mientras estamos dentro de una transacción activa.
    $pdo->exec("DELETE FROM `{$table}`");
    $stmt = $pdo->prepare("INSERT INTO `{$table}` (id, payload) VALUES (:id, :payload)");
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }
        $id = (string)($item['id'] ?? '');
        if ($id === '') {
            continue;
        }
        $payload = json_encode($item, JSON_UNESCAPED_UNICODE);
        if ($payload === false) {
            continue;
        }
        $stmt->execute(['id' => $id, 'payload' => $payload]);
    }
}

try {
    $dsn = sprintf('mysql:host=%s;dbname=%s;charset=%s', $config['host'], $config['dbname'], $config['charset']);
    $pdo = new PDO($dsn, $config['user'], $config['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    $prefix = preg_replace('/[^a-zA-Z0-9_]/', '', $config['table_prefix']);
    $tables = ensureTables($pdo, $prefix);

    if ($action === 'pull') {
        $sessionStmt = $pdo->prepare("SELECT meta_value FROM `{$tables['meta']}` WHERE meta_key = 'session' LIMIT 1");
        $sessionStmt->execute();
        $sessionRow = $sessionStmt->fetch();
        $session = $sessionRow ? json_decode($sessionRow['meta_value'], true) : null;

        $state = [
            'session' => is_array($session) ? $session : null,
            'users' => fetchUsers($pdo),
            'clientes' => fetchCollection($pdo, $tables['clientes']),
            'asuntos' => fetchCollection($pdo, $tables['asuntos']),
            'causas' => fetchCollection($pdo, $tables['causas']),
            'tareas' => fetchCollection($pdo, $tables['tareas']),
            'plazos' => fetchCollection($pdo, $tables['plazos']),
            'cotizaciones' => fetchCollection($pdo, $tables['cotizaciones']),
            'logs' => fetchCollection($pdo, $tables['logs']),
        ];

        echo json_encode(['ok' => true, 'state' => $state]);
        exit;
    }

    if ($action === 'verify_login') {
        $email = strtolower(trim((string)($input['email'] ?? '')));
        $password = (string)($input['password'] ?? '');
        if ($email === '' || $password === '') {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'Debe enviar email y password.']);
            exit;
        }
        try {
            $stmt = $pdo->prepare("SELECT id, email, nombre, telefono, role, is_admin, active, created_at, updated_at, password_hash FROM `abogapp2_users` WHERE LOWER(email) = :email LIMIT 1");
            $stmt->execute(['email' => $email]);
            $user = $stmt->fetch();
        } catch (Throwable $e) {
            http_response_code(409);
            echo json_encode(['ok' => false, 'error' => 'La tabla de usuarios está en formato legado. Ejecute una escritura (push) para migrarla.']);
            exit;
        }
        $hash = (string)($user['password_hash'] ?? '');
        $validPassword = password_verify($password, $hash) || hash_equals($hash, $password);
        if (!$user || !(int)$user['active'] || !$validPassword) {
            http_response_code(401);
            echo json_encode(['ok' => false, 'error' => 'Credenciales inválidas.']);
            exit;
        }
        echo json_encode(['ok' => true, 'user' => [
            'id' => (string)$user['id'],
            'correo' => (string)$user['email'],
            'nombre' => (string)$user['nombre'],
            'telefono' => (string)($user['telefono'] ?? ''),
            'rol' => (string)$user['role'],
            'isAdmin' => (bool)$user['is_admin'],
            'activo' => (bool)$user['active'],
            'createdAt' => $user['created_at'] ?? null,
            'updatedAt' => $user['updated_at'] ?? null
        ]]);
        exit;
    }

    $state = $input['state'] ?? null;
    if (!is_array($state)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Debe enviar state en formato objeto JSON.']);
        exit;
    }

    $pdo->beginTransaction();

    replaceUsers($pdo, $state['users'] ?? []);
    replaceCollection($pdo, $tables['clientes'], $state['clientes'] ?? []);
    replaceCollection($pdo, $tables['asuntos'], $state['asuntos'] ?? []);
    replaceCollection($pdo, $tables['causas'], $state['causas'] ?? []);
    replaceCollection($pdo, $tables['tareas'], $state['tareas'] ?? []);
    replaceCollection($pdo, $tables['plazos'], $state['plazos'] ?? []);
    replaceCollection($pdo, $tables['cotizaciones'], $state['cotizaciones'] ?? []);
    replaceCollection($pdo, $tables['logs'], $state['logs'] ?? []);

    $sessionPayload = json_encode($state['session'] ?? null, JSON_UNESCAPED_UNICODE);
    $metaStmt = $pdo->prepare("INSERT INTO `{$tables['meta']}` (meta_key, meta_value)
      VALUES ('session', :meta_value)
      ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value), updated_at = CURRENT_TIMESTAMP");
    $metaStmt->execute(['meta_value' => $sessionPayload ?: 'null']);

    $pdo->commit();

    echo json_encode(['ok' => true]);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
}
