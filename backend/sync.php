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
if (!in_array($action, ['pull', 'push'], true)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Acción inválida. Use pull o push.']);
    exit;
}

function tableName(string $prefix, string $entity): string {
    return preg_replace('/[^a-zA-Z0-9_]/', '', $prefix . '_' . $entity);
}

function ensureTables(PDO $pdo, string $prefix): array {
    $entities = ['users', 'clientes', 'asuntos', 'causas', 'tareas', 'plazos', 'cotizaciones', 'logs'];
    $tables = [];
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
            'users' => fetchCollection($pdo, $tables['users']),
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

    $state = $input['state'] ?? null;
    if (!is_array($state)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Debe enviar state en formato objeto JSON.']);
        exit;
    }

    $pdo->beginTransaction();

    replaceCollection($pdo, $tables['users'], $state['users'] ?? []);
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
