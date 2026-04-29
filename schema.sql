-- Schema relacional para sincronización por secciones de AbogApp
-- Base de datos esperada: gjabogad_abogapp
-- Motor: MySQL 8+ / MariaDB 10+

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `abogapp_users` (
  `id` CHAR(36) NOT NULL,
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
  KEY `idx_abogapp_users_active` (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `abogapp_clientes` (
  `id` CHAR(36) NOT NULL,
  `tipo` VARCHAR(40) NULL,
  `nombre` VARCHAR(200) NOT NULL,
  `rut` VARCHAR(20) NULL,
  `correo` VARCHAR(191) NULL,
  `telefono` VARCHAR(40) NULL,
  `comuna` VARCHAR(120) NULL,
  `region` VARCHAR(120) NULL,
  `estado` VARCHAR(50) NULL,
  `observaciones` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_abogapp_clientes_nombre` (`nombre`),
  KEY `idx_abogapp_clientes_rut` (`rut`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `abogapp_asuntos` (
  `id` CHAR(36) NOT NULL,
  `cliente_id` CHAR(36) NOT NULL,
  `nombre` VARCHAR(200) NOT NULL,
  `tipo` VARCHAR(40) NULL,
  `area` VARCHAR(80) NULL,
  `materia` VARCHAR(150) NULL,
  `prioridad` VARCHAR(30) NULL,
  `estado` VARCHAR(40) NULL,
  `responsable_id` CHAR(36) NULL,
  `responsable_ids_json` JSON NULL,
  `observaciones` TEXT NULL,
  `fecha_ingreso` DATE NULL,
  `archivado` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_abogapp_asuntos_cliente` (`cliente_id`),
  KEY `idx_abogapp_asuntos_estado` (`estado`),
  CONSTRAINT `fk_abogapp_asuntos_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `abogapp_clientes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_abogapp_asuntos_responsable` FOREIGN KEY (`responsable_id`) REFERENCES `abogapp_users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `abogapp_causas` (
  `id` CHAR(36) NOT NULL,
  `asunto_id` CHAR(36) NOT NULL,
  `tribunal` VARCHAR(220) NULL,
  `rit` VARCHAR(60) NULL,
  `rol` VARCHAR(60) NULL,
  `caratula` VARCHAR(255) NULL,
  `estado_procesal` VARCHAR(80) NULL,
  `etapa` VARCHAR(80) NULL,
  `proxima_audiencia` DATE NULL,
  `link` TEXT NULL,
  `ultima_actuacion` DATE NULL,
  `archivada` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_abogapp_causas_asunto` (`asunto_id`),
  KEY `idx_abogapp_causas_rit` (`rit`),
  CONSTRAINT `fk_abogapp_causas_asunto` FOREIGN KEY (`asunto_id`) REFERENCES `abogapp_asuntos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `abogapp_tareas` (
  `id` CHAR(36) NOT NULL,
  `asunto_id` CHAR(36) NOT NULL,
  `titulo` VARCHAR(220) NOT NULL,
  `responsable_id` CHAR(36) NULL,
  `responsable_ids_json` JSON NULL,
  `vencimiento` DATE NULL,
  `prioridad` VARCHAR(30) NULL,
  `estado` VARCHAR(40) NULL,
  `descripcion` TEXT NULL,
  `archivada` TINYINT(1) NOT NULL DEFAULT 0,
  `completada` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_abogapp_tareas_asunto` (`asunto_id`),
  KEY `idx_abogapp_tareas_vencimiento` (`vencimiento`),
  CONSTRAINT `fk_abogapp_tareas_asunto` FOREIGN KEY (`asunto_id`) REFERENCES `abogapp_asuntos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_abogapp_tareas_responsable` FOREIGN KEY (`responsable_id`) REFERENCES `abogapp_users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `abogapp_plazos` (
  `id` CHAR(36) NOT NULL,
  `asunto_id` CHAR(36) NOT NULL,
  `nombre` VARCHAR(220) NOT NULL,
  `inicio` DATE NULL,
  `vencimiento` DATE NULL,
  `tipo_dias` VARCHAR(30) NULL,
  `responsable_id` CHAR(36) NULL,
  `responsable_ids_json` JSON NULL,
  `estado` VARCHAR(40) NULL,
  `observaciones` TEXT NULL,
  `archivado` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_abogapp_plazos_asunto` (`asunto_id`),
  KEY `idx_abogapp_plazos_vencimiento` (`vencimiento`),
  CONSTRAINT `fk_abogapp_plazos_asunto` FOREIGN KEY (`asunto_id`) REFERENCES `abogapp_asuntos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_abogapp_plazos_responsable` FOREIGN KEY (`responsable_id`) REFERENCES `abogapp_users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `abogapp_cotizaciones` (
  `id` CHAR(36) NOT NULL,
  `numero` INT NOT NULL,
  `nombre_cliente` VARCHAR(200) NULL,
  `materia` VARCHAR(180) NULL,
  `resumen_requerimiento` TEXT NULL,
  `servicio_propuesto` TEXT NULL,
  `conceptos_json` JSON NULL,
  `monto_fijo` DECIMAL(14,2) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_abogapp_cotizaciones_numero` (`numero`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `abogapp_logs` (
  `id` CHAR(36) NOT NULL,
  `action` VARCHAR(255) NOT NULL,
  `at` DATETIME NOT NULL,
  `user_email` VARCHAR(191) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_abogapp_logs_at` (`at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
