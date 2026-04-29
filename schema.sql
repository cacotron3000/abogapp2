-- Schema base para sincronización de usuarios AbogApp
-- Compatible con MySQL 5.7+ / MariaDB 10+

CREATE TABLE IF NOT EXISTS `abogapp_users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(191) NOT NULL,
  `nombre` VARCHAR(150) NOT NULL,
  `telefono` VARCHAR(40) NULL,
  `role` VARCHAR(50) NOT NULL DEFAULT 'user',
  `password_hash` VARCHAR(255) NOT NULL,
  `is_admin` TINYINT(1) NOT NULL DEFAULT 0,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_abogapp_users_email` (`email`),
  KEY `idx_abogapp_users_active` (`active`),
  KEY `idx_abogapp_users_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
