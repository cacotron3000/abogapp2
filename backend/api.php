<?php
header('Content-Type: application/json; charset=utf-8');

$cfg = [
  'db_host' => getenv('DB_HOST') ?: 'localhost',
  'db_name' => getenv('DB_NAME') ?: 'gjabogad_abogapp',
  'db_user' => getenv('DB_USER') ?: 'gjabogad_abogapp',
  'db_pass' => getenv('DB_PASS') ?: '',
  'db_port' => getenv('DB_PORT') ?: '3306',
  'api_key' => getenv('API_KEY') ?: 'dYNcXEgHBE7InHUJUknl6CF28zIlQJt8',
];

function out($data, $code=200){ http_response_code($code); echo json_encode($data, JSON_UNESCAPED_UNICODE); exit; }

$headers = getallheaders();
$apiKey = $headers['x-api-key'] ?? $headers['X-API-KEY'] ?? ($_GET['api_key'] ?? '');
if ($apiKey !== $cfg['api_key']) out(['ok'=>false,'error'=>'Unauthorized'], 401);

$action = $_GET['action'] ?? '';
$table = $_GET['table'] ?? '';
$allowed = ['abogapp_users','abogapp_clientes','abogapp_asuntos','abogapp_causas','abogapp_tareas','abogapp_plazos','abogapp_cotizaciones','abogapp_logs'];

try {
  $pdo = new PDO("mysql:host={$cfg['db_host']};port={$cfg['db_port']};dbname={$cfg['db_name']};charset=utf8mb4", $cfg['db_user'], $cfg['db_pass'], [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);

  if ($action === 'pull_table') {
    if (!in_array($table, $allowed, true)) out(['ok'=>false,'error'=>'Tabla no permitida'], 400);
    $st = $pdo->query("SELECT * FROM `$table`");
    out(['ok'=>true,'table'=>$table,'rows'=>$st->fetchAll(PDO::FETCH_ASSOC)]);
  }

  if ($action === 'pull_all') {
    $data = [];
    foreach($allowed as $t){ $data[$t] = $pdo->query("SELECT * FROM `$t`")->fetchAll(PDO::FETCH_ASSOC); }
    out(['ok'=>true,'tables'=>$data]);
  }

  $input = json_decode(file_get_contents('php://input'), true) ?: [];

  if ($action === 'push_table') {
    if (!in_array($table, $allowed, true)) out(['ok'=>false,'error'=>'Tabla no permitida'], 400);
    $rows = $input['rows'] ?? [];
    $count = 0;
    foreach ($rows as $row) {
      if (!isset($row['id'])) continue;
      $cols = array_keys($row);
      $updates = array_filter($cols, fn($c) => $c !== 'id');
      $sql = "INSERT INTO `$table` (`".implode('`,`',$cols)."`) VALUES (:".implode(',:',$cols).")";
      if ($updates) $sql .= " ON DUPLICATE KEY UPDATE ".implode(',', array_map(fn($c)=>"`$c`=VALUES(`$c`)",$updates));
      $stmt = $pdo->prepare($sql);
      foreach ($row as $k=>$v) $stmt->bindValue(':'.$k, is_array($v) ? json_encode($v) : $v);
      $stmt->execute(); $count++;
    }
    out(['ok'=>true,'table'=>$table,'upserts'=>$count]);
  }

  if ($action === 'push_record') {
    if (!in_array($table, $allowed, true)) out(['ok'=>false,'error'=>'Tabla no permitida'], 400);
    $row = $input['row'] ?? [];
    if (!isset($row['id'])) out(['ok'=>false,'error'=>'row.id es obligatorio'], 400);
    $cols = array_keys($row);
    $updates = array_filter($cols, fn($c) => $c !== 'id');
    $sql = "INSERT INTO `$table` (`".implode('`,`',$cols)."`) VALUES (:".implode(',:',$cols).") ON DUPLICATE KEY UPDATE ".implode(',', array_map(fn($c)=>"`$c`=VALUES(`$c`)",$updates));
    $stmt = $pdo->prepare($sql);
    foreach ($row as $k=>$v) $stmt->bindValue(':'.$k, is_array($v) ? json_encode($v) : $v);
    $stmt->execute();
    out(['ok'=>true]);
  }

  if ($action === 'delete_record') {
    if (!in_array($table, $allowed, true)) out(['ok'=>false,'error'=>'Tabla no permitida'], 400);
    $id = $input['id'] ?? null;
    if (!$id) out(['ok'=>false,'error'=>'id es obligatorio'], 400);
    $stmt = $pdo->prepare("DELETE FROM `$table` WHERE id = ?");
    $stmt->execute([$id]);
    out(['ok'=>true,'deleted'=>$stmt->rowCount()]);
  }

  out(['ok'=>false,'error'=>'Acción inválida'], 400);
} catch(Throwable $e){ out(['ok'=>false,'error'=>$e->getMessage()], 500); }
