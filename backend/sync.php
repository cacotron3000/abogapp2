<?php
header('Content-Type: application/json; charset=utf-8');

$configFile = __DIR__ . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Falta backend/config.php. Copie config.sample.php y complete credenciales.']);
    exit;
}

$config = require $configFile;
$required = ['host', 'dbname', 'user', 'pass', 'charset', 'table', 'state_key'];
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

try {
    $dsn = sprintf('mysql:host=%s;dbname=%s;charset=%s', $config['host'], $config['dbname'], $config['charset']);
    $pdo = new PDO($dsn, $config['user'], $config['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    $table = preg_replace('/[^a-zA-Z0-9_]/', '', $config['table']);
    $stateKey = (string) $config['state_key'];

    $pdo->exec("CREATE TABLE IF NOT EXISTS `{$table}` (
      `state_key` VARCHAR(80) PRIMARY KEY,
      `payload` LONGTEXT NOT NULL,
      `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    if ($action === 'pull') {
        $stmt = $pdo->prepare("SELECT payload, updated_at FROM `{$table}` WHERE state_key = :state_key LIMIT 1");
        $stmt->execute(['state_key' => $stateKey]);
        $row = $stmt->fetch();

        if (!$row) {
            echo json_encode(['ok' => true, 'state' => null, 'updated_at' => null]);
            exit;
        }

        $decoded = json_decode($row['payload'], true);
        if (!is_array($decoded)) {
            throw new RuntimeException('El JSON almacenado en base de datos está corrupto.');
        }

        echo json_encode(['ok' => true, 'state' => $decoded, 'updated_at' => $row['updated_at']]);
        exit;
    }

    $state = $input['state'] ?? null;
    if (!is_array($state)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Debe enviar state en formato objeto JSON.']);
        exit;
    }

    $payload = json_encode($state, JSON_UNESCAPED_UNICODE);
    if ($payload === false) {
        throw new RuntimeException('No fue posible serializar state a JSON.');
    }

    $stmt = $pdo->prepare("INSERT INTO `{$table}` (state_key, payload)
      VALUES (:state_key, :payload)
      ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = CURRENT_TIMESTAMP");
    $stmt->execute(['state_key' => $stateKey, 'payload' => $payload]);

    echo json_encode(['ok' => true]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
}
