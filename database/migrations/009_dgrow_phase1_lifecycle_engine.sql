-- Migration 009: D-Grow OS Phase 1 - Lifecycle Backbone, Auto-Trigger Engine, Service Instances, Leads & BD Pipelines
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

-- 1. Users Extensions
CALL AddColumnIfNotExists('users', 'department', "ENUM('SEO', 'PerformanceMarketing', 'Content', 'Design', 'Video', 'Dev', 'BD', 'HR', 'Leadership') NULL AFTER role");
CALL AddColumnIfNotExists('users', 'phone', "VARCHAR(20) NOT NULL DEFAULT '' AFTER email");
CALL AddColumnIfNotExists('users', 'client_id', "BIGINT UNSIGNED NULL AFTER phone");

-- 2. Clients Extensions
CALL AddColumnIfNotExists('clients', 'entity', "ENUM('D-Grow', 'MedGrowDigi') NOT NULL DEFAULT 'D-Grow' AFTER name");
CALL AddColumnIfNotExists('clients', 'vertical', "ENUM('Healthcare', 'General') NOT NULL DEFAULT 'General' AFTER entity");
CALL AddColumnIfNotExists('clients', 'lifecycle_stage', "ENUM('L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6') NOT NULL DEFAULT 'L1' AFTER vertical");
CALL AddColumnIfNotExists('clients', 'account_manager_id', "BIGINT UNSIGNED NULL AFTER lifecycle_stage");
CALL AddColumnIfNotExists('clients', 'gstin', "VARCHAR(15) NULL AFTER phone");
CALL AddColumnIfNotExists('clients', 'billing_address', "TEXT NULL AFTER address");
CALL AddColumnIfNotExists('clients', 'contract_start_date', "DATE NULL AFTER billing_address");
CALL AddColumnIfNotExists('clients', 'contract_end_date', "DATE NULL AFTER contract_start_date");
CALL AddColumnIfNotExists('clients', 'portal_account_created', "BOOLEAN NOT NULL DEFAULT FALSE AFTER contract_end_date");
CALL AddColumnIfNotExists('clients', 'mediqora_subscriber_id', "VARCHAR(64) NULL AFTER portal_account_created");

-- 3. Service Instances Table
CREATE TABLE IF NOT EXISTS service_instances (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id BIGINT UNSIGNED NOT NULL,
  service_type VARCHAR(60) NOT NULL,
  label VARCHAR(160) NOT NULL,
  current_stage VARCHAR(60) NOT NULL,
  owner_user_id BIGINT UNSIGNED NULL,
  cycle VARCHAR(60) NOT NULL DEFAULT 'Monthly',
  status ENUM('active', 'paused', 'completed', 'cancelled') NOT NULL DEFAULT 'active',
  stage_index INT NOT NULL DEFAULT 0,
  bundled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_si_client (client_id),
  INDEX idx_si_owner (owner_user_id),
  INDEX idx_si_status (status),
  INDEX idx_si_service_type (service_type),
  CONSTRAINT fk_si_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_si_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_si_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Leads Table (3 Separate BD Pipelines: D-Grow, MedGrowDigi, Mediqora)
CREATE TABLE IF NOT EXISTS leads (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pipeline_entity ENUM('D-Grow', 'MedGrowDigi', 'Mediqora') NOT NULL,
  stage VARCHAR(60) NOT NULL DEFAULT 'New',
  title VARCHAR(255) NOT NULL,
  company_name VARCHAR(255) NULL,
  contact_name VARCHAR(255) NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(50) NULL,
  source VARCHAR(100) NULL,
  estimated_value INT UNSIGNED NULL,
  owner_user_id BIGINT UNSIGNED NULL,
  converted_client_id BIGINT UNSIGNED NULL,
  converted_mediqora_subscriber_id VARCHAR(64) NULL,
  notes TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_leads_pipeline (pipeline_entity, stage),
  INDEX idx_leads_owner (owner_user_id),
  INDEX idx_leads_client (converted_client_id),
  CONSTRAINT fk_leads_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_leads_client FOREIGN KEY (converted_client_id) REFERENCES clients(id) ON DELETE SET NULL,
  CONSTRAINT fk_leads_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Tasks Extensions
ALTER TABLE tasks MODIFY COLUMN project_id BIGINT UNSIGNED NULL;
CALL AddColumnIfNotExists('tasks', 'client_id', 'BIGINT UNSIGNED NULL AFTER project_id');
CALL AddColumnIfNotExists('tasks', 'service_instance_id', 'BIGINT UNSIGNED NULL AFTER client_id');
CALL AddColumnIfNotExists('tasks', 'source', "ENUM('Workflow', 'Manual') NOT NULL DEFAULT 'Manual' AFTER service_instance_id");
CALL AddColumnIfNotExists('tasks', 'column_status', "ENUM('todo', 'in_progress', 'client_review', 'revision', 'done') NOT NULL DEFAULT 'todo' AFTER status");
CALL AddColumnIfNotExists('tasks', 'is_client_deliverable', 'BOOLEAN NOT NULL DEFAULT FALSE AFTER column_status');
CALL AddColumnIfNotExists('tasks', 'revision_count', 'INT UNSIGNED NOT NULL DEFAULT 0 AFTER is_client_deliverable');
CALL AddColumnIfNotExists('tasks', 'deliverable_url', 'VARCHAR(1000) NULL AFTER revision_count');
CALL AddColumnIfNotExists('tasks', 'deliverable_notes', 'TEXT NULL AFTER deliverable_url');
CALL AddColumnIfNotExists('tasks', 'assignee_id', 'BIGINT UNSIGNED NULL AFTER deliverable_notes');

DROP PROCEDURE IF EXISTS AddColumnIfNotExists;

