-- Migration 020: Service Management Master Records & Project Types
-- D-Grow OS Service, Project & Workflow Management Restructure

-- 1. Create services master table
CREATE TABLE IF NOT EXISTS services (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  service_code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  category VARCHAR(100) NOT NULL DEFAULT 'Digital Marketing',
  department_id BIGINT UNSIGNED NULL,
  default_owner_role VARCHAR(100) NULL,
  execution_cycle VARCHAR(60) NOT NULL DEFAULT 'Monthly',
  workflow_preset_id BIGINT UNSIGNED NULL,
  status ENUM('active', 'inactive', 'archived') NOT NULL DEFAULT 'active',
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_services_status (status),
  INDEX idx_services_category (category),
  INDEX idx_services_department (department_id),
  INDEX idx_services_workflow_preset (workflow_preset_id),
  CONSTRAINT fk_services_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  CONSTRAINT fk_services_wp FOREIGN KEY (workflow_preset_id) REFERENCES workflow_presets(id) ON DELETE SET NULL,
  CONSTRAINT fk_services_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_services_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Add service_id to service_instances
SET @si_service_col = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_instances' AND COLUMN_NAME = 'service_id'
);
SET @si_service_stmt = IF(@si_service_col = 0, 'ALTER TABLE service_instances ADD COLUMN service_id BIGINT UNSIGNED NULL AFTER client_id', 'SELECT 1');
PREPARE s_si_service FROM @si_service_stmt;
EXECUTE s_si_service;
DEALLOCATE PREPARE s_si_service;

-- Add foreign key constraint if not exists
SET @fk_si_service = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_instances' AND CONSTRAINT_NAME = 'fk_si_service'
);
SET @fk_si_service_stmt = IF(@fk_si_service = 0, 'ALTER TABLE service_instances ADD CONSTRAINT fk_si_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE s_fk_si_service FROM @fk_si_service_stmt;
EXECUTE s_fk_si_service;
DEALLOCATE PREPARE s_fk_si_service;

-- 3. Add project_type to projects
SET @prj_type_col = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'project_type'
);
SET @prj_type_stmt = IF(@prj_type_col = 0, "ALTER TABLE projects ADD COLUMN project_type ENUM('Indulge', 'One Time', 'Team', 'Regular') NOT NULL DEFAULT 'Regular' AFTER description", 'SELECT 1');
PREPARE s_prj_type FROM @prj_type_stmt;
EXECUTE s_prj_type;
DEALLOCATE PREPARE s_prj_type;

-- 4. Add project_type to service_instances
SET @si_type_col = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_instances' AND COLUMN_NAME = 'project_type'
);
SET @si_type_stmt = IF(@si_type_col = 0, "ALTER TABLE service_instances ADD COLUMN project_type ENUM('Indulge', 'One Time', 'Team', 'Regular') NOT NULL DEFAULT 'Regular' AFTER label", 'SELECT 1');
PREPARE s_si_type FROM @si_type_stmt;
EXECUTE s_si_type;
DEALLOCATE PREPARE s_si_type;
