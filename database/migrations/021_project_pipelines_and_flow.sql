-- Migration 021: Project Pipelines, Project Categories, Step Assignments & Employee Task Flow
-- Flow: Active Clients -> Client Project Management -> Project (category + pipeline + team/individual)
--       -> Pipeline steps assigned to people -> Employee task desk splits step work into tasks.
-- Column additions to `projects` and `tasks` are applied idempotently by
-- server/src/scripts/run-migration-021.js (MySQL has no ADD COLUMN IF NOT EXISTS).

-- 1. Reusable pipeline templates (e.g. "Website Development", "SEO Monthly")
CREATE TABLE IF NOT EXISTS project_pipelines (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  service_id BIGINT UNSIGNED NULL,
  status ENUM('active', 'archived') NOT NULL DEFAULT 'active',
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pp_status (status),
  INDEX idx_pp_service (service_id),
  CONSTRAINT fk_pp_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL,
  CONSTRAINT fk_pp_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Ordered steps of a pipeline template
CREATE TABLE IF NOT EXISTS project_pipeline_steps (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pipeline_id BIGINT UNSIGNED NOT NULL,
  step_order INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  step_type ENUM('work', 'approval') NOT NULL DEFAULT 'work',
  needs_admin_approval BOOLEAN NOT NULL DEFAULT FALSE,
  needs_client_approval BOOLEAN NOT NULL DEFAULT FALSE,
  est_days INT UNSIGNED NULL,
  INDEX idx_pps_pipeline (pipeline_id, step_order),
  CONSTRAINT fk_pps_pipeline FOREIGN KEY (pipeline_id) REFERENCES project_pipelines(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Steps copied onto a concrete project (snapshot of the pipeline at creation time)
CREATE TABLE IF NOT EXISTS project_steps (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  pipeline_step_id BIGINT UNSIGNED NULL,
  step_order INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  step_type ENUM('work', 'approval') NOT NULL DEFAULT 'work',
  needs_admin_approval BOOLEAN NOT NULL DEFAULT FALSE,
  needs_client_approval BOOLEAN NOT NULL DEFAULT FALSE,
  status ENUM('pending', 'in_progress', 'completed') NOT NULL DEFAULT 'pending',
  admin_approved_by BIGINT UNSIGNED NULL,
  admin_approved_at DATETIME NULL,
  client_approved_by BIGINT UNSIGNED NULL,
  client_approved_at DATETIME NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  completed_by BIGINT UNSIGNED NULL,
  due_date DATE NULL,
  notes TEXT NULL,
  INDEX idx_ps_project (project_id, step_order),
  INDEX idx_ps_status (status),
  CONSTRAINT fk_ps_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_ps_pipeline_step FOREIGN KEY (pipeline_step_id) REFERENCES project_pipeline_steps(id) ON DELETE SET NULL,
  CONSTRAINT fk_ps_admin_appr FOREIGN KEY (admin_approved_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_ps_client_appr FOREIGN KEY (client_approved_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_ps_completed_by FOREIGN KEY (completed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. People assigned to each project step (one or many)
CREATE TABLE IF NOT EXISTS project_step_assignees (
  project_step_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_step_id, user_id),
  INDEX idx_psa_user (user_id),
  CONSTRAINT fk_psa_step FOREIGN KEY (project_step_id) REFERENCES project_steps(id) ON DELETE CASCADE,
  CONSTRAINT fk_psa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
