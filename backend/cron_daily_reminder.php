<?php
/**
 * Ejecutar por cron una vez al día.
 * Envía recordatorios de tareas pendientes por correo a usuarios activos.
 */

$configFile = __DIR__ . '/config.php';
if (!file_exists($configFile)) {
    fwrite(STDERR, "Falta backend/config.php\n");
    exit(1);
}
$config = require $configFile;
$required = ['host', 'dbname', 'user', 'pass', 'charset', 'table_prefix'];
foreach ($required as $key) {
    if (!array_key_exists($key, $config)) {
        fwrite(STDERR, "Configuración incompleta: {$key}\n");
        exit(1);
    }
}
$from = (string)($config['mail_from'] ?? 'no-reply@localhost');
$prefix = preg_replace('/[^a-zA-Z0-9_]/', '', (string)$config['table_prefix']);
$tasksTable = $prefix . '_tareas';

$dsn = sprintf('mysql:host=%s;dbname=%s;charset=%s', $config['host'], $config['dbname'], $config['charset']);
$pdo = new PDO($dsn, $config['user'], $config['pass'], [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);

$users = $pdo->query("SELECT id, email, nombre, active FROM abogapp2_users WHERE active = 1 AND email <> ''")->fetchAll();
$taskRows = $pdo->query("SELECT payload FROM `{$tasksTable}`")->fetchAll();
$tasks = [];
foreach ($taskRows as $row) {
    $t = json_decode((string)($row['payload'] ?? ''), true);
    if (!is_array($t)) continue;
    $archivada = (bool)($t['archivada'] ?? false);
    $estado = (string)($t['estado'] ?? '');
    if ($archivada || $estado === 'Terminada') continue;
    $resp = $t['responsableIds'] ?? $t['responsableId'] ?? [];
    $respIds = is_array($resp) ? array_values(array_filter($resp)) : (strlen((string)$resp) ? [(string)$resp] : []);
    if (!$respIds) continue;
    $tasks[] = [
      'titulo' => (string)($t['titulo'] ?? 'Tarea'),
      'vencimiento' => (string)($t['vencimiento'] ?? 'Sin fecha'),
      'responsableIds' => $respIds,
    ];
}

$sent = 0;
foreach ($users as $u) {
    $uid = (string)$u['id'];
    $userTasks = array_values(array_filter($tasks, static fn($t) => in_array($uid, $t['responsableIds'], true)));
    if (!$userTasks) continue;
    $lines = array_map(static fn($t) => '- '.$t['titulo'].' (Vence: '.$t['vencimiento'].')', $userTasks);
    $body = "Hola {$u['nombre']},\n\nEstas son tus tareas pendientes:\n".implode("\n", $lines)."\n\nMensaje automático de AbogApp.";
    $subject = 'Recordatorio diario de tareas asignadas';
    $headers = "MIME-Version: 1.0\r\nContent-type: text/plain; charset=UTF-8\r\nFrom: {$from}";
    $ok = @mail((string)$u['email'], '=?UTF-8?B?'.base64_encode($subject).'?=', $body, $headers);
    if ($ok) $sent++;
}

echo "Recordatorios enviados: {$sent}\n";
