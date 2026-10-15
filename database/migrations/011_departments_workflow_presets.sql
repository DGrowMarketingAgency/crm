-- Migration 011: Department Management & Workflow Preset Builder
-- D-Grow OS Phase 1

USE agency_manager;

-- 1. Departments Table
CREATE TABLE IF NOT EXISTS departments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  description TEXT NULL,
  manager_id BIGINT UNSIGNED NULL,
  status ENUM('active', 'inactive', 'archived') NOT NULL DEFAULT 'active',
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_departments_name (name),
  INDEX idx_departments_status (status),
  INDEX idx_departments_manager (manager_id),
  CONSTRAINT fk_departments_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_departments_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Department Members Pivot Table (Many-to-Many: departments <-> users)
CREATE TABLE IF NOT EXISTS department_members (
  department_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  role_in_department VARCHAR(100) NOT NULL DEFAULT 'member',
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (department_id, user_id),
  INDEX idx_dept_members_user (user_id),
  INDEX idx_dept_members_dept (department_id),
  CONSTRAINT fk_dept_members_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
  CONSTRAINT fk_dept_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Workflow Presets Table
CREATE TABLE IF NOT EXISTS workflow_presets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  preset_code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  department_id BIGINT UNSIGNED NOT NULL,
  service_category VARCHAR(100) NOT NULL DEFAULT 'General',
  workflow_type ENUM('standard', 'custom', 'recurring_monthly', 'one_time') NOT NULL DEFAULT 'standard',
  status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
  current_version_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wp_department (department_id),
  INDEX idx_wp_status (status),
  INDEX idx_wp_category (service_category),
  CONSTRAINT fk_wp_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_wp_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_wp_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Workflow Preset Versions Table
CREATE TABLE IF NOT EXISTS workflow_preset_versions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  preset_id BIGINT UNSIGNED NOT NULL,
  version_number INT UNSIGNED NOT NULL DEFAULT 1,
  status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
  estimated_duration_days INT UNSIGNED NOT NULL DEFAULT 0,
  deadline_calculation_rules JSON NULL,
  default_assignee_rules JSON NULL,
  revision_rules JSON NULL,
  notification_config JSON NULL,
  validation_status ENUM('unvalidated', 'valid', 'invalid') NOT NULL DEFAULT 'unvalidated',
  validation_errors JSON NULL,
  changelog TEXT NULL,
  published_at DATETIME NULL,
  published_by BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wp_version (preset_id, version_number),
  INDEX idx_wpv_preset (preset_id),
  INDEX idx_wpv_status (status),
  CONSTRAINT fk_wpv_preset FOREIGN KEY (preset_id) REFERENCES workflow_presets(id) ON DELETE CASCADE,
  CONSTRAINT fk_wpv_published_by FOREIGN KEY (published_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_wpv_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_wpv_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Update foreign key on workflow_presets for current_version_id
SET @fk_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workflow_presets' AND CONSTRAINT_NAME = 'fk_wp_current_version'
);
SET @fk_stmt = IF(@fk_exists = 0, 'ALTER TABLE workflow_presets ADD CONSTRAINT fk_wp_current_version FOREIGN KEY (current_version_id) REFERENCES workflow_preset_versions(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE s_fk FROM @fk_stmt;
EXECUTE s_fk;
DEALLOCATE PREPARE s_fk;

-- 5. Workflow Stages Table
CREATE TABLE IF NOT EXISTS workflow_stages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  preset_version_id BIGINT UNSIGNED NOT NULL,
  stage_key VARCHAR(64) NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT NULL,
  display_order INT NOT NULL DEFAULT 1,
  stage_category ENUM('planning', 'execution', 'review', 'delivery', 'reporting', 'maintenance') NOT NULL DEFAULT 'execution',
  allowed_next_stages JSON NULL,
  is_client_facing BOOLEAN NOT NULL DEFAULT FALSE,
  is_review_required BOOLEAN NOT NULL DEFAULT FALSE,
  requires_deliverable BOOLEAN NOT NULL DEFAULT FALSE,
  requires_client_approval BOOLEAN NOT NULL DEFAULT FALSE,
  reviewer_policy JSON NULL,
  completion_conditions JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ws_version_key (preset_version_id, stage_key),
  INDEX idx_ws_version (preset_version_id),
  INDEX idx_ws_order (preset_version_id, display_order),
  CONSTRAINT fk_ws_version FOREIGN KEY (preset_version_id) REFERENCES workflow_preset_versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Task Templates Table
CREATE TABLE IF NOT EXISTS task_templates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  preset_version_id BIGINT UNSIGNED NOT NULL,
  stage_id BIGINT UNSIGNED NOT NULL,
  task_key VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  instructions TEXT NULL,
  department_id BIGINT UNSIGNED NULL,
  default_assignee_role VARCHAR(100) NULL,
  estimated_duration_hours DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  relative_deadline_days INT NOT NULL DEFAULT 1,
  priority ENUM('low', 'medium', 'high', 'urgent') NOT NULL DEFAULT 'medium',
  required_inputs JSON NULL,
  completion_checklist JSON NULL,
  expected_output TEXT NULL,
  requires_internal_review BOOLEAN NOT NULL DEFAULT FALSE,
  requires_client_approval BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tt_version_key (preset_version_id, task_key),
  INDEX idx_tt_version (preset_version_id),
  INDEX idx_tt_stage (stage_id),
  CONSTRAINT fk_tt_version FOREIGN KEY (preset_version_id) REFERENCES workflow_preset_versions(id) ON DELETE CASCADE,
  CONSTRAINT fk_tt_stage FOREIGN KEY (stage_id) REFERENCES workflow_stages(id) ON DELETE CASCADE,
  CONSTRAINT fk_tt_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Task Template Dependencies Table
CREATE TABLE IF NOT EXISTS task_template_dependencies (
  task_template_id BIGINT UNSIGNED NOT NULL,
  depends_on_task_template_id BIGINT UNSIGNED NOT NULL,
  dependency_type ENUM('finish_to_start', 'start_to_start') NOT NULL DEFAULT 'finish_to_start',
  PRIMARY KEY (task_template_id, depends_on_task_template_id),
  INDEX idx_ttd_dep (depends_on_task_template_id),
  CONSTRAINT fk_ttd_target FOREIGN KEY (task_template_id) REFERENCES task_templates(id) ON DELETE CASCADE,
  CONSTRAINT fk_ttd_depends FOREIGN KEY (depends_on_task_template_id) REFERENCES task_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Add department_id to tasks table if not exists
SET @task_dept_col = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'department_id'
);
SET @task_dept_stmt = IF(@task_dept_col = 0, 'ALTER TABLE tasks ADD COLUMN department_id BIGINT UNSIGNED NULL AFTER client_id', 'SELECT 1');
PREPARE s_task_dept FROM @task_dept_stmt;
EXECUTE s_task_dept;
DEALLOCATE PREPARE s_task_dept;
