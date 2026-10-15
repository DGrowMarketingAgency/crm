-- Migration 013: Workflow Automation Engine & Execution Backbone
-- D-Grow OS Phase 4

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

-- 1. Extend projects table with workflow preset and service linkage
CALL AddColumnIfNotExists('projects', 'workflow_preset_id', 'BIGINT UNSIGNED NULL AFTER client_id');
CALL AddColumnIfNotExists('projects', 'workflow_preset_version_id', 'BIGINT UNSIGNED NULL AFTER workflow_preset_id');
CALL AddColumnIfNotExists('projects', 'service_instance_id', 'BIGINT UNSIGNED NULL AFTER workflow_preset_version_id');

-- Add foreign key constraints on projects if they don't already exist
SET @fk_prj_preset = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND CONSTRAINT_NAME = 'fk_prj_preset'
);
SET @fk_prj_preset_stmt = IF(@fk_prj_preset = 0, 'ALTER TABLE projects ADD CONSTRAINT fk_prj_preset FOREIGN KEY (workflow_preset_id) REFERENCES workflow_presets(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE s_prj_preset FROM @fk_prj_preset_stmt;
EXECUTE s_prj_preset;
DEALLOCATE PREPARE s_prj_preset;

SET @fk_prj_ver = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND CONSTRAINT_NAME = 'fk_prj_preset_ver'
);
SET @fk_prj_ver_stmt = IF(@fk_prj_ver = 0, 'ALTER TABLE projects ADD CONSTRAINT fk_prj_preset_ver FOREIGN KEY (workflow_preset_version_id) REFERENCES workflow_preset_versions(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE s_prj_ver FROM @fk_prj_ver_stmt;
EXECUTE s_prj_ver;
DEALLOCATE PREPARE s_prj_ver;

SET @fk_prj_si = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND CONSTRAINT_NAME = 'fk_prj_service_instance'
);
SET @fk_prj_si_stmt = IF(@fk_prj_si = 0, 'ALTER TABLE projects ADD CONSTRAINT fk_prj_service_instance FOREIGN KEY (service_instance_id) REFERENCES service_instances(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE s_prj_si FROM @fk_prj_si_stmt;
EXECUTE s_prj_si;
DEALLOCATE PREPARE s_prj_si;

-- 2. Create workflow_executions Table
CREATE TABLE IF NOT EXISTS workflow_executions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  execution_key VARCHAR(120) NOT NULL UNIQUE,
  trigger_type ENUM('service_activation', 'project_start', 'milestone_activation', 'manual') NOT NULL,
  client_id BIGINT UNSIGNED NULL,
  project_id BIGINT UNSIGNED NULL,
  service_instance_id BIGINT UNSIGNED NULL,
  milestone_id BIGINT UNSIGNED NULL,
  workflow_preset_id BIGINT UNSIGNED NOT NULL,
  workflow_preset_version_id BIGINT UNSIGNED NOT NULL,
  status ENUM('pending', 'running', 'completed', 'partially_failed', 'failed') NOT NULL DEFAULT 'pending',
  total_tasks_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_tasks_count INT UNSIGNED NOT NULL DEFAULT 0,
  failed_tasks_count INT UNSIGNED NOT NULL DEFAULT 0,
  error_details JSON NULL,
  executed_by BIGINT UNSIGNED NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_we_status (status),
  INDEX idx_we_trigger (trigger_type),
  INDEX idx_we_client (client_id),
  INDEX idx_we_project (project_id),
  INDEX idx_we_service (service_instance_id),
  CONSTRAINT fk_we_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  CONSTRAINT fk_we_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_we_service FOREIGN KEY (service_instance_id) REFERENCES service_instances(id) ON DELETE CASCADE,
  CONSTRAINT fk_we_preset FOREIGN KEY (workflow_preset_id) REFERENCES workflow_presets(id) ON DELETE RESTRICT,
  CONSTRAINT fk_we_ver FOREIGN KEY (workflow_preset_version_id) REFERENCES workflow_preset_versions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_we_user FOREIGN KEY (executed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Extend tasks Table with execution & template traceability
CALL AddColumnIfNotExists('tasks', 'workflow_preset_id', 'BIGINT UNSIGNED NULL AFTER department_id');
CALL AddColumnIfNotExists('tasks', 'workflow_preset_version_id', 'BIGINT UNSIGNED NULL AFTER workflow_preset_id');
CALL AddColumnIfNotExists('tasks', 'task_template_id', 'BIGINT UNSIGNED NULL AFTER workflow_preset_version_id');
CALL AddColumnIfNotExists('tasks', 'workflow_execution_id', 'BIGINT UNSIGNED NULL AFTER task_template_id');

-- Foreign keys on tasks
SET @fk_task_wp = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND CONSTRAINT_NAME = 'fk_tasks_preset'
);
SET @fk_task_wp_stmt = IF(@fk_task_wp = 0, 'ALTER TABLE tasks ADD CONSTRAINT fk_tasks_preset FOREIGN KEY (workflow_preset_id) REFERENCES workflow_presets(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE s_task_wp FROM @fk_task_wp_stmt;
EXECUTE s_task_wp;
DEALLOCATE PREPARE s_task_wp;

SET @fk_task_ver = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND CONSTRAINT_NAME = 'fk_tasks_preset_ver'
);
SET @fk_task_ver_stmt = IF(@fk_task_ver = 0, 'ALTER TABLE tasks ADD CONSTRAINT fk_tasks_preset_ver FOREIGN KEY (workflow_preset_version_id) REFERENCES workflow_preset_versions(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE s_task_ver FROM @fk_task_ver_stmt;
EXECUTE s_task_ver;
DEALLOCATE PREPARE s_task_ver;

SET @fk_task_tt = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND CONSTRAINT_NAME = 'fk_tasks_template'
);
SET @fk_task_tt_stmt = IF(@fk_task_tt = 0, 'ALTER TABLE tasks ADD CONSTRAINT fk_tasks_template FOREIGN KEY (task_template_id) REFERENCES task_templates(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE s_task_tt FROM @fk_task_tt_stmt;
EXECUTE s_task_tt;
DEALLOCATE PREPARE s_task_tt;

SET @fk_task_we = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND CONSTRAINT_NAME = 'fk_tasks_execution'
);
SET @fk_task_we_stmt = IF(@fk_task_we = 0, 'ALTER TABLE tasks ADD CONSTRAINT fk_tasks_execution FOREIGN KEY (workflow_execution_id) REFERENCES workflow_executions(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE s_task_we FROM @fk_task_we_stmt;
EXECUTE s_task_we;
DEALLOCATE PREPARE s_task_we;

-- 4. Create task_dependencies Table (Runtime Task Dependencies)
CREATE TABLE IF NOT EXISTS task_dependencies (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id BIGINT UNSIGNED NOT NULL,
  depends_on_task_id BIGINT UNSIGNED NOT NULL,
  dependency_type ENUM('finish_to_start', 'start_to_start') NOT NULL DEFAULT 'finish_to_start',
  is_satisfied BOOLEAN NOT NULL DEFAULT FALSE,
  satisfied_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_task_dependencies (task_id, depends_on_task_id),
  INDEX idx_td_task (task_id, is_satisfied),
  INDEX idx_td_depends_on (depends_on_task_id, is_satisfied),
  CONSTRAINT fk_td_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_td_depends_on FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS AddColumnIfNotExists;
