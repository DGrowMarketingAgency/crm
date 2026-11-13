-- =====================================================================================
-- D-GROW CRM - Production database update (Hostinger / phpMyAdmin)
-- Date: 2026-11-13
--
-- Adds:  Service Management (migration 020) + Client Project Flow / Project Pipelines /
--        Employee Task Desk (migration 021). Time tracking and the permission fixes
--        need no schema changes.
--
-- HOW TO RUN
--   1. phpMyAdmin -> click your CRM database in the LEFT sidebar first.
--   2. Export -> Quick -> SQL   (download a backup before changing anything).
--   3. SQL tab -> paste this whole file -> Go.
--
-- SAFE TO RE-RUN: every step checks INFORMATION_SCHEMA, uses IF NOT EXISTS or INSERT IGNORE,
-- so running it twice, or on a database that already has part of it, adds nothing extra.
-- Needs these existing tables: users, roles, permissions, role_permissions, departments,
-- workflow_presets, service_instances, projects, tasks, task_assignees, project_members.
-- =====================================================================================

SET NAMES utf8mb4;

-- -------------------------------------------------------------------------------------
-- PART A - Migration 020: Service Management master table and project types
-- -------------------------------------------------------------------------------------

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

-- service_instances.service_id (+ foreign key)
SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_instances' AND COLUMN_NAME = 'service_id');
SET @q = IF(@n = 0, 'ALTER TABLE service_instances ADD COLUMN service_id BIGINT UNSIGNED NULL AFTER client_id', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_instances' AND CONSTRAINT_NAME = 'fk_si_service');
SET @q = IF(@n = 0, 'ALTER TABLE service_instances ADD CONSTRAINT fk_si_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

-- projects.project_type
SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'project_type');
SET @q = IF(@n = 0, "ALTER TABLE projects ADD COLUMN project_type ENUM('Indulge','One Time','Team','Regular') NOT NULL DEFAULT 'Regular' AFTER description", 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

-- service_instances.project_type
SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_instances' AND COLUMN_NAME = 'project_type');
SET @q = IF(@n = 0, "ALTER TABLE service_instances ADD COLUMN project_type ENUM('Indulge','One Time','Team','Regular') NOT NULL DEFAULT 'Regular' AFTER label", 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

-- Service catalogue (19 services). Departments and workflow presets are matched by CODE because
-- row ids differ between databases. Services that already exist (same service_code) are left untouched.
INSERT IGNORE INTO services (service_code, name, description, category, department_id, default_owner_role, execution_cycle, workflow_preset_id, status)
SELECT 'SEO', 'SEO (Website Ranking) incl. AEO & GEO', 'Comprehensive SEO (Website Ranking) incl. AEO & GEO service with 4 workflow stages.', 'Digital Marketing',
       (SELECT id FROM departments WHERE code = 'SEO' LIMIT 1), 'SEOExec', 'Monthly',
       (SELECT id FROM workflow_presets WHERE preset_code = 'WP-SEO-MONTHLY' LIMIT 1), 'active';
INSERT IGNORE INTO services (service_code, name, description, category, department_id, default_owner_role, execution_cycle, workflow_preset_id, status)
SELECT 'GoogleAds', 'Google Ads (PPC)', 'Comprehensive Google Ads (PPC) service with 4 workflow stages.', 'Digital Marketing',
       NULL, 'PerfMarketingExec', 'Monthly',
       (SELECT id FROM workflow_presets WHERE preset_code = 'WP-GADS-MONTHLY' LIMIT 1), 'active';
INSERT IGNORE INTO services (service_code, name, description, category, department_id, default_owner_role, execution_cycle, workflow_preset_id, status)
SELECT 'SocialMediaMarketing', 'Social Media Marketing (Paid Ads)', 'Comprehensive Social Media Marketing (Paid Ads) service with 4 workflow stages.', 'Digital Marketing',
       NULL, 'PerfMarketingExec', 'Monthly',
       NULL, 'active';
INSERT IGNORE INTO services (service_code, name, description, category, department_id, default_owner_role, execution_cycle, workflow_preset_id, status)
SELECT 'SocialMediaManagement', 'Social Media Management (Organic)', 'Comprehensive Social Media Management (Organic) service with 4 workflow stages.', 'Digital Marketing',
       (SELECT id FROM departments WHERE code = 'CONTENT_WRITING' LIMIT 1), 'ContentExec', 'Monthly',
       NULL, 'active';
INSERT IGNORE INTO services (service_code, name, description, category, department_id, default_owner_role, execution_cycle, workflow_preset_id, status)
SELECT 'EmailMarketing', 'Email Marketing (Brevo / Automation)', 'Comprehensive Email Marketing (Brevo / Automation) service with 4 workflow stages.', 'Digital Marketing',
       (SELECT id FROM departments WHERE code = 'CONTENT_WRITING' LIMIT 1), 'ContentExec', 'Monthly',
       NULL, 'active';
INSERT IGNORE INTO services (service_code, name, description, category, department_id, default_owner_role, execution_cycle, workflow_preset_id, status)
SELECT 'GMB', 'GMB Listing & Local Ranking', 'Comprehensive GMB Listing & Local Ranking service with 4 workflow stages.', 'Digital Marketing',
       (SELECT id FROM departments WHERE code = 'SEO' LIMIT 1), 'SEOExec', 'Monthly',
       NULL, 'active';
INSERT IGNORE INTO services (service_code, name, description, category, department_id, default_owner_role, execution_cycle, workflow_preset_id, status)
SELECT 'WhatsAppMarketing', 'WhatsApp Marketing & Automation', 'Comprehensive WhatsApp Marketing & Automation service with 3 workflow stages.', 'Digital Marketing',
       (SELECT id FROM departments WHERE code = 'CONTENT_WRITING' LIMIT 1), 'ContentExec', 'Monthly',
       NULL, 'active';
INSERT IGNORE INTO services (service_code, name, description, category, department_id, default_owner_role, execution_cycle, workflow_preset_id, status)
SELECT 'LeadsGeneration', 'Leads Generation System', 'Comprehensive Leads Generation System service with 3 workflow stages.', 'Digital Marketing',
       NULL, 'PerfMarketingExec', 'Monthly',
       NULL, 'active';
INSERT IGNORE INTO services (service_code, name, description, category, department_id, default_owner_role, execution_cycle, workflow_preset_id, status)
SELECT 'PoliticalAds', 'Political Ads & Voter Outreach', 'Comprehensive Political Ads & Voter Outreach service with 4 workflow stages.', 'Digital Marketing',
       NULL, 'PerfMarketingExec', 'Campaign-based',
       NULL, 'active';
INSERT IGNORE INTO services (service_code, name, description, category, department_id, default_owner_role, execution_cycle, workflow_preset_id, status)
SELECT 'ContentWriting', 'Content Writing & Marketing', 'Comprehensive Content Writing & Marketing service with 3 workflow stages.', 'Creative',
       (SELECT id FROM departments WHERE code = 'CONTENT_WRITING' LIMIT 1), 'ContentExec', 'Monthly',
       NULL, 'active';
INSERT IGNORE INTO services (service_code, name, description, category, department_id, default_owner_role, execution_cycle, workflow_preset_id, status)
SELECT 'GraphicDesigning', 'Graphic Designing & Brand Collateral', 'Comprehensive Graphic Designing & Brand Collateral service with 3 workflow stages.', 'Creative',
       (SELECT id FROM departments WHERE code = 'GRAPHIC_DESIGN' LIMIT 1), 'DesignExec', 'Monthly',
       NULL, 'active';
INSERT IGNORE INTO services (service_code, name, description, category, department_id, default_owner_role, execution_cycle, workflow_preset_id, status)
SELECT 'VideoShooting', 'Video Shooting & Editing', 'Comprehensive Video Shooting & Editing service with 4 workflow stages.', 'Creative',
       (SELECT id FROM departments WHERE code = 'VIDEO_EDITING' LIMIT 1), 'VideoExec', 'Per Shoot',
       NULL, 'active';
INSERT IGNORE INTO services (service_code, name, description, category, department_id, default_owner_role, execution_cycle, workflow_preset_id, status)
SELECT 'PersonalBranding', 'Personal Branding', 'Comprehensive Personal Branding service with 3 workflow stages.', 'Creative',
       (SELECT id FROM departments WHERE code = 'CONTENT_WRITING' LIMIT 1), 'ContentExec', 'Monthly',
       NULL, 'active';
INSERT IGNORE INTO services (service_code, name, description, category, department_id, default_owner_role, execution_cycle, workflow_preset_id, status)
SELECT 'LinkedInPersonalBranding', 'LinkedIn Personal Branding', 'Comprehensive LinkedIn Personal Branding service with 3 workflow stages.', 'Creative',
       (SELECT id FROM departments WHERE code = 'CONTENT_WRITING' LIMIT 1), 'ContentExec', 'Monthly',
       NULL, 'active';
INSERT IGNORE INTO services (service_code, name, description, category, department_id, default_owner_role, execution_cycle, workflow_preset_id, status)
SELECT 'WebsiteDevelopment', 'Website Design & Development', 'Comprehensive Website Design & Development service with 4 workflow stages.', 'Development',
       (SELECT id FROM departments WHERE code = 'WEB_DEVELOPMENT' LIMIT 1), 'DevExec', 'Milestone-based',
       NULL, 'active';
INSERT IGNORE INTO services (service_code, name, description, category, department_id, default_owner_role, execution_cycle, workflow_preset_id, status)
SELECT 'MarketingAutomation', 'Marketing Automation & Zapier Systems', 'Comprehensive Marketing Automation & Zapier Systems service with 3 workflow stages.', 'Development',
       (SELECT id FROM departments WHERE code = 'WEB_DEVELOPMENT' LIMIT 1), 'DevExec', 'Setup + Monthly',
       NULL, 'active';
INSERT IGNORE INTO services (service_code, name, description, category, department_id, default_owner_role, execution_cycle, workflow_preset_id, status)
SELECT 'LeadNurturing', 'Lead Nurturing System', 'Comprehensive Lead Nurturing System service with 3 workflow stages.', 'Development',
       (SELECT id FROM departments WHERE code = 'CONTENT_WRITING' LIMIT 1), 'ContentExec', 'Setup + Monthly',
       NULL, 'active';
INSERT IGNORE INTO services (service_code, name, description, category, department_id, default_owner_role, execution_cycle, workflow_preset_id, status)
SELECT 'DigitalConsultation', 'Digital Marketing Consultation', 'Comprehensive Digital Marketing Consultation service with 2 workflow stages.', 'Digital Marketing',
       NULL, 'AccountManager', 'Monthly / Quarterly',
       NULL, 'active';
INSERT IGNORE INTO services (service_code, name, description, category, department_id, default_owner_role, execution_cycle, workflow_preset_id, status)
SELECT 'ProductListingAmazonSEO', 'Product Listing + Amazon SEO', 'Comprehensive Product Listing + Amazon SEO service with 3 workflow stages.', 'Digital Marketing',
       (SELECT id FROM departments WHERE code = 'SEO' LIMIT 1), 'SEOExec', 'Per Catalog Batch',
       NULL, 'active';

-- Service-management permissions (not created by the app's automatic permission sync), granted to owner and admin.
INSERT IGNORE INTO permissions (permission_key, module, action, description) VALUES
  ('services.create',  'Services', 'create',  'Create new master service catalog items'),
  ('services.update',  'Services', 'update',  'Update service catalog definitions'),
  ('services.delete',  'Services', 'delete',  'Delete or archive service items'),
  ('services.archive', 'Services', 'archive', 'Archive obsolete service catalog items');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_key IN ('services.create', 'services.update', 'services.delete', 'services.archive')
WHERE r.slug IN ('owner', 'admin');

-- -------------------------------------------------------------------------------------
-- PART B - Migration 021: Project Pipelines, project categories, step assignments,
--          monthly cycles, employee task desk
-- -------------------------------------------------------------------------------------

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

CREATE TABLE IF NOT EXISTS project_step_assignees (
  project_step_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_step_id, user_id),
  INDEX idx_psa_user (user_id),
  CONSTRAINT fk_psa_step FOREIGN KEY (project_step_id) REFERENCES project_steps(id) ON DELETE CASCADE,
  CONSTRAINT fk_psa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- New columns on projects
SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'project_category');
SET @q = IF(@n = 0, "ALTER TABLE projects ADD COLUMN project_category ENUM('regular','one_time','urgent','out_of_service') NULL AFTER project_type", 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'assignment_mode');
SET @q = IF(@n = 0, "ALTER TABLE projects ADD COLUMN assignment_mode ENUM('individual','team') NULL AFTER project_category", 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'pipeline_id');
SET @q = IF(@n = 0, 'ALTER TABLE projects ADD COLUMN pipeline_id BIGINT UNSIGNED NULL AFTER assignment_mode', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'service_id');
SET @q = IF(@n = 0, 'ALTER TABLE projects ADD COLUMN service_id BIGINT UNSIGNED NULL AFTER pipeline_id', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'team_leader_id');
SET @q = IF(@n = 0, 'ALTER TABLE projects ADD COLUMN team_leader_id BIGINT UNSIGNED NULL AFTER service_id', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'parent_project_id');
SET @q = IF(@n = 0, 'ALTER TABLE projects ADD COLUMN parent_project_id BIGINT UNSIGNED NULL AFTER team_leader_id', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'cycle_month');
SET @q = IF(@n = 0, 'ALTER TABLE projects ADD COLUMN cycle_month CHAR(7) NULL AFTER parent_project_id', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'monthly_deliverables');
SET @q = IF(@n = 0, 'ALTER TABLE projects ADD COLUMN monthly_deliverables JSON NULL AFTER cycle_month', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'billing_amount');
SET @q = IF(@n = 0, 'ALTER TABLE projects ADD COLUMN billing_amount DECIMAL(12,2) NULL AFTER monthly_deliverables', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'billing_status');
SET @q = IF(@n = 0, "ALTER TABLE projects ADD COLUMN billing_status ENUM('unbilled','billed','paid') NULL AFTER billing_amount", 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

-- Foreign keys on projects
SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND CONSTRAINT_NAME = 'fk_projects_pipeline');
SET @q = IF(@n = 0, 'ALTER TABLE projects ADD CONSTRAINT fk_projects_pipeline FOREIGN KEY (pipeline_id) REFERENCES project_pipelines(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND CONSTRAINT_NAME = 'fk_projects_service');
SET @q = IF(@n = 0, 'ALTER TABLE projects ADD CONSTRAINT fk_projects_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND CONSTRAINT_NAME = 'fk_projects_team_leader');
SET @q = IF(@n = 0, 'ALTER TABLE projects ADD CONSTRAINT fk_projects_team_leader FOREIGN KEY (team_leader_id) REFERENCES users(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND CONSTRAINT_NAME = 'fk_projects_parent');
SET @q = IF(@n = 0, 'ALTER TABLE projects ADD CONSTRAINT fk_projects_parent FOREIGN KEY (parent_project_id) REFERENCES projects(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

-- One monthly cycle per retainer per month
SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND CONSTRAINT_NAME = 'uq_projects_parent_cycle');
SET @q = IF(@n = 0, 'ALTER TABLE projects ADD CONSTRAINT uq_projects_parent_cycle UNIQUE (parent_project_id, cycle_month)', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

-- New columns on tasks
SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'project_step_id');
SET @q = IF(@n = 0, 'ALTER TABLE tasks ADD COLUMN project_step_id BIGINT UNSIGNED NULL AFTER project_id', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'target_qty');
SET @q = IF(@n = 0, 'ALTER TABLE tasks ADD COLUMN target_qty INT UNSIGNED NULL', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND CONSTRAINT_NAME = 'fk_tasks_project_step');
SET @q = IF(@n = 0, 'ALTER TABLE tasks ADD CONSTRAINT fk_tasks_project_step FOREIGN KEY (project_step_id) REFERENCES project_steps(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

-- -------------------------------------------------------------------------------------
-- PART C - Verification: every column below should show 1 (services_rows should be 19 or more).
-- -------------------------------------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services') AS services_table,
  (SELECT COUNT(*) FROM services) AS services_rows,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'project_pipelines') AS pipelines_table,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'project_steps') AS project_steps_table,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'project_step_assignees') AS step_assignees_table,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'project_category') AS projects_category_col,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'project_step_id') AS tasks_step_col,
  (SELECT COUNT(*) FROM permissions WHERE permission_key = 'services.create') AS services_create_perm;
