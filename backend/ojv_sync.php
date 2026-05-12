<?php
header('Content-Type: application/json; charset=utf-8');
$configFile = __DIR__ . '/config.php';
if (!file_exists($configFile)) { http_response_code(500); echo json_encode(['ok'=>false,'error'=>'Falta backend/config.php']); exit; }
$config = require $configFile;
$input = json_decode(file_get_contents('php://input'), true) ?: [];
$action = $input['action'] ?? '';
if (!in_array($action, ['auth_test','sync_causa'], true)) { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'Acción inválida']); exit; }

$node = $config['ojv_node_bin'] ?? 'node';
$worker = realpath(__DIR__ . '/../scripts/ojv_worker.mjs');
if (!$worker) { http_response_code(500); echo json_encode(['ok'=>false,'error'=>'No existe scripts/ojv_worker.mjs']); exit; }

$payload = [
  'action' => $action,
  'credentials' => [
    'username' => (string)($input['username'] ?? $config['ojv_username'] ?? ''),
    'password' => (string)($input['password'] ?? $config['ojv_password'] ?? ''),
  ],
  'rit' => (string)($input['rit'] ?? ''),
  'rol' => (string)($input['rol'] ?? ''),
];

$cmd = escapeshellcmd($node) . ' ' . escapeshellarg($worker) . ' ' . escapeshellarg(json_encode($payload, JSON_UNESCAPED_UNICODE));

// Usar proc_open para capturar stdout/stderr y códigos de salida.
$descriptorspec = [
    1 => ['pipe', 'w'], // stdout
    2 => ['pipe', 'w'], // stderr
];
$process = proc_open($cmd, $descriptorspec, $pipes, dirname($worker));
if (!is_resource($process)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'No se pudo iniciar el proceso worker OJV (proc_open).']);
    exit;
}
$stdout = stream_get_contents($pipes[1]);
$stderr = stream_get_contents($pipes[2]);
fclose($pipes[1]);
fclose($pipes[2]);
$exitCode = proc_close($process);

if ($exitCode !== 0 && trim((string)$stdout) === '') {
    http_response_code(500);
    $err = trim((string)$stderr);
    echo json_encode(['ok' => false, 'error' => 'No se pudo ejecutar worker OJV', 'detail' => $err ?: "exit_code={$exitCode}"]);
    exit;
}

$data = json_decode((string)$stdout, true);
if (!is_array($data)) { http_response_code(500); echo json_encode(['ok'=>false,'error'=>'Respuesta inválida del worker']); exit; }
if (empty($data['ok'])) { http_response_code(500); echo json_encode($data); exit; }
echo json_encode($data);
