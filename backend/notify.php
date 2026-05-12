<?php
header('Content-Type: application/json; charset=utf-8');
$configFile = __DIR__ . '/config.php';
if (!file_exists($configFile)) { http_response_code(500); echo json_encode(['ok'=>false,'error'=>'Falta config.php']); exit; }
$config = require $configFile;
$from = (string)($config['mail_from'] ?? 'no-reply@localhost');
$input = json_decode(file_get_contents('php://input'), true) ?: [];
$action = $input['action'] ?? '';
if (!in_array($action, ['assignment_notice','daily_reminder'], true)) { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'Acción inválida']); exit; }

function sendMailSimple(string $to, string $subject, string $body, string $from): bool {
    if (!$to) return false;
    $headers = [
      'MIME-Version: 1.0',
      'Content-type: text/plain; charset=UTF-8',
      'From: '.$from
    ];
    return @mail($to, '=?UTF-8?B?'.base64_encode($subject).'?=', $body, implode("\r\n", $headers));
}

$sent = 0; $errors = [];
if ($action === 'assignment_notice') {
    $to = (string)($input['to'] ?? '');
    $member = (string)($input['member'] ?? 'Equipo');
    $itemType = (string)($input['itemType'] ?? 'registro');
    $itemName = (string)($input['itemName'] ?? '');
    $assignedBy = (string)($input['assignedBy'] ?? 'sistema');
    $subject = "Nueva responsabilidad asignada: {$itemType}";
    $body = "Hola {$member},\n\nSe te asignó una nueva responsabilidad.\n\nTipo: {$itemType}\nDetalle: {$itemName}\nAsignado por: {$assignedBy}\n\nRevisa AbogApp para más detalles.";
    if (sendMailSimple($to, $subject, $body, $from)) $sent++; else $errors[] = "No se pudo enviar a {$to}";
}

if ($action === 'daily_reminder') {
    $users = is_array($input['users'] ?? null) ? $input['users'] : [];
    foreach ($users as $u) {
      $to = (string)($u['correo'] ?? '');
      $nombre = (string)($u['nombre'] ?? 'Equipo');
      $tasks = is_array($u['tasks'] ?? null) ? $u['tasks'] : [];
      if (!$to || !count($tasks)) continue;
      $lines = array_map(static fn($t) => '- '.(string)($t['titulo'] ?? 'Tarea').' (Vence: '.(string)($t['vencimiento'] ?? 'Sin fecha').')', $tasks);
      $subject = 'Recordatorio diario de tareas asignadas';
      $body = "Hola {$nombre},\n\nEstas son tus tareas asignadas para hoy:\n".implode("\n", $lines)."\n\nEste mensaje fue generado automáticamente por AbogApp.";
      if (sendMailSimple($to, $subject, $body, $from)) $sent++; else $errors[] = "No se pudo enviar a {$to}";
    }
}

echo json_encode(['ok'=>count($errors)===0, 'sent'=>$sent, 'errors'=>$errors]);
