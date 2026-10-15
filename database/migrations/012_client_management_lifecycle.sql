-- Migration 012: D-Grow OS Phase 2 - Client Management & Lifecycle Backbone
USE agency_manager;

-- Procedure to safely add column if not exists
DROP PROCEDURE IF EXISTS AddColumnIfNotExists;
DELIMITER $$
CREATE PROCEDURE AddColumnIfNotExists(
  IN tableName VARCHAR(64),
  IN colName VARCHAR(64),
  IN colDef TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tableName AND COLUMN_NAME = colName
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', tableName, '` ADD COLUMN `', colName, '` ', colDef);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

-- 1. Extend clients table with complete business and operational fields
CALL AddColumnIfNotExists('clients', 'client_code', "VARCHAR(50) NULL AFTER name");
CALL AddColumnIfNotExists('clients', 'industry', "VARCHAR(100) NULL AFTER company_name");
CALL AddColumnIfNotExists('clients', 'website', "VARCHAR(255) NULL AFTER industry");
CALL AddColumnIfNotExists('clients', 'city', "VARCHAR(100) NULL AFTER address");
CALL AddColumnIfNotExists('clients', 'country', "VARCHAR(100) NOT NULL DEFAULT 'India' AFTER city");
CALL AddColumnIfNotExists('clients', 'onboarding_owner_id', "BIGINT UNSIGNED NULL AFTER account_manager_id");
CALL AddColumnIfNotExists('clients', 'requirements_notes', "TEXT NULL AFTER notes");
CALL AddColumnIfNotExists('clients', 'communication_preferences', "JSON NULL AFTER requirements_notes");
CALL AddColumnIfNotExists('clients', 'offboarding_reason', "TEXT NULL AFTER communication_preferences");
CALL AddColumnIfNotExists('clients', 'offboarded_at', "DATETIME NULL AFTER offboarding_reason");
CALL AddColumnIfNotExists('clients', 'offboarded_by', "BIGINT UNSIGNED NULL AFTER offboarded_at");

-- Ensure unique client_code index
SET @code_idx_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND INDEX_NAME = 'uq_clients_code'
);
SET @code_idx_stmt = IF(@code_idx_exists = 0, 'ALTER TABLE clients ADD UNIQUE KEY uq_clients_code (client_code)', 'SELECT 1');
PREPARE s_code_idx FROM @code_idx_stmt;
EXECUTE s_code_idx;
DEALLOCATE PREPARE s_code_idx;

-- 2. Client Contacts Table (Multiple contacts per client)
CREATE TABLE IF NOT EXISTS client_contacts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  designation VARCHAR(150) NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  portal_access_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cc_client (client_id),
  INDEX idx_cc_email (email),
  INDEX idx_cc_primary (client_id, is_primary),
  CONSTRAINT fk_cc_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_cc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Account Manager Assignment History Table
CREATE TABLE IF NOT EXISTS account_manager_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id BIGINT UNSIGNED NOT NULL,
  previous_manager_id BIGINT UNSIGNED NULL,
  new_manager_id BIGINT UNSIGNED NOT NULL,
  assigned_by BIGINT UNSIGNED NOT NULL,
  reason VARCHAR(500) NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_amh_client (client_id),
  INDEX idx_amh_assigned_at (assigned_at),
  CONSTRAINT fk_amh_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_amh_prev FOREIGN KEY (previous_manager_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_amh_new FOREIGN KEY (new_manager_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_amh_by FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Client Onboarding Checklist Items Table
CREATE TABLE IF NOT EXISTS client_onboarding_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id BIGINT UNSIGNED NOT NULL,
  item_key VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  owner_user_id BIGINT UNSIGNED NULL,
  due_date DATE NULL,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMP NULL,
  completed_by BIGINT UNSIGNED NULL,
  notes TEXT NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_coi_client (client_id),
  INDEX idx_coi_completed (client_id, is_completed),
  CONSTRAINT fk_coi_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_coi_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_coi_completer FOREIGN KEY (completed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Extend service_instances Table for Department & Workflow Preset linkage
CALL AddColumnIfNotExists('service_instances', 'department_id', 'BIGINT UNSIGNED NULL AFTER client_id');
CALL AddColumnIfNotExists('service_instances', 'workflow_preset_id', 'BIGINT UNSIGNED NULL AFTER department_id');
CALL AddColumnIfNotExists('service_instances', 'workflow_preset_version_id', 'BIGINT UNSIGNED NULL AFTER workflow_preset_id');
CALL AddColumnIfNotExists('service_instances', 'scope_description', 'TEXT NULL AFTER label');
CALL AddColumnIfNotExists('service_instances', 'expected_deliverables', 'TEXT NULL AFTER scope_description');
CALL AddColumnIfNotExists('service_instances', 'service_frequency', "VARCHAR(60) NOT NULL DEFAULT 'Monthly' AFTER cycle");
CALL AddColumnIfNotExists('service_instances', 'start_date', 'DATE NULL AFTER status');
CALL AddColumnIfNotExists('service_instances', 'end_date', 'DATE NULL AFTER start_date');
CALL AddColumnIfNotExists('service_instances', 'operational_notes', 'TEXT NULL AFTER end_date');

-- Update service_instances status ENUM to support all Phase 2 states
ALTER TABLE service_instances MODIFY COLUMN status ENUM('draft', 'pending_activation', 'active', 'paused', 'completed', 'cancelled') NOT NULL DEFAULT 'active';

-- Add foreign key constraints to service_instances if not exists
SET @fk_si_dept_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_instances' AND CONSTRAINT_NAME = 'fk_si_dept'
);
SET @fk_si_dept_stmt = IF(@fk_si_dept_exists = 0, 'ALTER TABLE service_instances ADD CONSTRAINT fk_si_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE s_si_dept FROM @fk_si_dept_stmt;
EXECUTE s_si_dept;
DEALLOCATE PREPARE s_si_dept;

SET @fk_si_preset_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_instances' AND CONSTRAINT_NAME = 'fk_si_preset'
);
SET @fk_si_preset_stmt = IF(@fk_si_preset_exists = 0, 'ALTER TABLE service_instances ADD CONSTRAINT fk_si_preset FOREIGN KEY (workflow_preset_id) REFERENCES workflow_presets(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE s_si_preset FROM @fk_si_preset_stmt;
EXECUTE s_si_preset;
DEALLOCATE PREPARE s_si_preset;

SET @fk_si_ver_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_instances' AND CONSTRAINT_NAME = 'fk_si_preset_version'
);
SET @fk_si_ver_stmt = IF(@fk_si_ver_exists = 0, 'ALTER TABLE service_instances ADD CONSTRAINT fk_si_preset_version FOREIGN KEY (workflow_preset_version_id) REFERENCES workflow_preset_versions(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE s_si_ver FROM @fk_si_ver_stmt;
EXECUTE s_si_ver;
DEALLOCATE PREPARE s_si_ver;

-- 6. Client Activity Timeline Table
CREATE TABLE IF NOT EXISTS client_activity_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id BIGINT UNSIGNED NOT NULL,
  actor_id BIGINT UNSIGNED NULL,
  activity_type VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cal_client (client_id),
  INDEX idx_cal_type (activity_type),
  INDEX idx_cal_created (created_at),
  CONSTRAINT fk_cal_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_cal_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS AddColumnIfNotExists;
