-- Migration 014: Internal Review, Client Approval & Deliverable Revision Workflow
-- D-Grow OS Phase 5

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

-- 1. Extend task_templates with deliverable specifications and review configurations
CALL AddColumnIfNotExists('task_templates', 'requires_deliverable', 'BOOLEAN NOT NULL DEFAULT FALSE AFTER requires_client_approval');
CALL AddColumnIfNotExists('task_templates', 'expected_deliverable_type', "VARCHAR(50) NOT NULL DEFAULT 'document' AFTER requires_deliverable");
CALL AddColumnIfNotExists('task_templates', 'reviewer_role', 'VARCHAR(100) NULL AFTER expected_deliverable_type');
CALL AddColumnIfNotExists('task_templates', 'revision_policy', 'JSON NULL AFTER reviewer_role');

-- 2. Extend tasks with review flags and deliverable linkage
CALL AddColumnIfNotExists('tasks', 'requires_internal_review', 'BOOLEAN NOT NULL DEFAULT TRUE AFTER is_client_deliverable');
CALL AddColumnIfNotExists('tasks', 'requires_client_approval', 'BOOLEAN NOT NULL DEFAULT FALSE AFTER requires_internal_review');
CALL AddColumnIfNotExists('tasks', 'requires_deliverable', 'BOOLEAN NOT NULL DEFAULT FALSE AFTER requires_client_approval');
CALL AddColumnIfNotExists('tasks', 'expected_deliverable_type', "VARCHAR(50) NOT NULL DEFAULT 'document' AFTER requires_deliverable");
CALL AddColumnIfNotExists('tasks', 'internal_reviewer_id', 'BIGINT UNSIGNED NULL AFTER assignee_id');
CALL AddColumnIfNotExists('tasks', 'current_submission_id', 'BIGINT UNSIGNED NULL AFTER internal_reviewer_id');

-- 3. Create deliverable_submissions Table (multi-version support, auditability, client isolation)
CREATE TABLE IF NOT EXISTS deliverable_submissions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id BIGINT UNSIGNED NOT NULL,
  client_id BIGINT UNSIGNED NOT NULL,
  project_id BIGINT UNSIGNED NULL,
  service_instance_id BIGINT UNSIGNED NULL,
  version_number INT UNSIGNED NOT NULL DEFAULT 1,
  deliverable_type VARCHAR(50) NOT NULL DEFAULT 'document',
  title VARCHAR(255) NOT NULL,
  deliverable_url VARCHAR(1000) NULL,
  file_path VARCHAR(500) NULL,
  file_name VARCHAR(255) NULL,
  file_size BIGINT UNSIGNED NULL,
  file_mime_type VARCHAR(100) NULL,
  submission_notes TEXT NULL,
  submitted_by BIGINT UNSIGNED NOT NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Internal Review
  internal_review_status ENUM('pending', 'approved', 'changes_requested') NOT NULL DEFAULT 'pending',
  internal_reviewer_id BIGINT UNSIGNED NULL,
  internal_review_feedback TEXT NULL,
  internal_reviewed_at DATETIME NULL,

  -- Client Approval
  requires_client_approval BOOLEAN NOT NULL DEFAULT FALSE,
  client_approval_status ENUM('not_required', 'pending', 'approved', 'revision_requested') NOT NULL DEFAULT 'not_required',
  client_reviewer_id BIGINT UNSIGNED NULL,
  client_feedback TEXT NULL,
  client_reviewed_at DATETIME NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_ds_task (task_id),
  INDEX idx_ds_client (client_id),
  INDEX idx_ds_project (project_id),
  INDEX idx_ds_internal_status (internal_review_status),
  INDEX idx_ds_client_status (client_approval_status),
  INDEX idx_ds_task_version (task_id, version_number),
  CONSTRAINT fk_ds_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_ds_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_ds_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  CONSTRAINT fk_ds_service FOREIGN KEY (service_instance_id) REFERENCES service_instances(id) ON DELETE SET NULL,
  CONSTRAINT fk_ds_submitter FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ds_int_reviewer FOREIGN KEY (internal_reviewer_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_ds_client_reviewer FOREIGN KEY (client_reviewer_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Create deliverable_revision_requests Table
CREATE TABLE IF NOT EXISTS deliverable_revision_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  submission_id BIGINT UNSIGNED NOT NULL,
  task_id BIGINT UNSIGNED NOT NULL,
  revision_cycle INT UNSIGNED NOT NULL DEFAULT 1,
  requested_by_type ENUM('internal_reviewer', 'client') NOT NULL,
  requested_by_user_id BIGINT UNSIGNED NOT NULL,
  revision_reason TEXT NOT NULL,
  status ENUM('open', 'resolved') NOT NULL DEFAULT 'open',
  resolved_in_submission_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_drr_submission (submission_id),
  INDEX idx_drr_task (task_id),
  INDEX idx_drr_status (status),
  CONSTRAINT fk_drr_submission FOREIGN KEY (submission_id) REFERENCES deliverable_submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_drr_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_drr_user FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_drr_resolved FOREIGN KEY (resolved_in_submission_id) REFERENCES deliverable_submissions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Clean up helper procedure
DROP PROCEDURE IF EXISTS AddColumnIfNotExists;
