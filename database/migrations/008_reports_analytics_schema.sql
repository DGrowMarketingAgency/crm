-- Migration: 008_reports_analytics_schema.sql
-- Description: Adds reporting performance indexes and report_exports table for asynchronous and tracked exports

USE agency_manager;

-- 1. Create Report Exports Table
CREATE TABLE IF NOT EXISTS report_exports (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  report_type ENUM('dashboard', 'projects', 'tasks', 'overdue_tasks', 'teams', 'time_summary', 'project_hours', 'employee_hours', 'clients') NOT NULL,
  format ENUM('csv', 'xlsx') NOT NULL DEFAULT 'csv',
  status ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  filters JSON NULL,
  filename VARCHAR(255) NULL,
  file_path VARCHAR(500) NULL,
  file_size BIGINT UNSIGNED NULL,
  row_count INT UNSIGNED NULL,
  error_message TEXT NULL,
  expires_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  KEY idx_report_exports_user (user_id),
  KEY idx_report_exports_status (status),
  KEY idx_report_exports_created (created_at),
  CONSTRAINT fk_report_exports_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Add Composite Performance Indexes for Reporting
-- Check and create index on tasks(project_id, status) if not existing
SET @exist := (SELECT COUNT(*) FROM information_schema.statistics 
               WHERE table_schema = 'agency_manager' 
               AND table_name = 'tasks' 
               AND index_name = 'idx_tasks_project_status');
SET @sql := IF(@exist = 0, 'ALTER TABLE tasks ADD INDEX idx_tasks_project_status (project_id, status)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Check and create index on tasks(status, due_date) if not existing
SET @exist := (SELECT COUNT(*) FROM information_schema.statistics 
               WHERE table_schema = 'agency_manager' 
               AND table_name = 'tasks' 
               AND index_name = 'idx_tasks_status_due_date');
SET @sql := IF(@exist = 0, 'ALTER TABLE tasks ADD INDEX idx_tasks_status_due_date (status, due_date)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Check and create index on time_entries(project_id, approval_status, is_billable) if not existing
SET @exist := (SELECT COUNT(*) FROM information_schema.statistics 
               WHERE table_schema = 'agency_manager' 
               AND table_name = 'time_entries' 
               AND index_name = 'idx_time_entries_proj_status_billable');
SET @sql := IF(@exist = 0, 'ALTER TABLE time_entries ADD INDEX idx_time_entries_proj_status_billable (project_id, approval_status, is_billable)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
