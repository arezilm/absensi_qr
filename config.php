<?php

define('DB_HOST', '');
define('DB_PORT', 3306);
define('DB_USER', '');
define('DB_PASS', '');
define('DB_NAME', '');

function getPDO(): PDO {
  static $pdo = null;
  if ($pdo === null) {
    $dsn = sprintf(
      'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
      DB_HOST, DB_PORT, DB_NAME
    );
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
      PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
      PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
  }
  return $pdo;
}
