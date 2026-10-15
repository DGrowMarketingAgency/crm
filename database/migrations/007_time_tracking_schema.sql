-- Migration: 007_time_tracking_schema.sql
-- Description: Creates tables for time tracking, work logs, active timers, and timesheet approvals

USE agency_manager;

-- 1. Timesheets table
CREATE TABLE IF NOT EXISTS timesheets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status ENUM('draft', 'submitted', 'approved', 'rejected') NOT NULL DEFAULT 'draft',
  submitted_at DATETIME NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  reviewer_comment TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_period (user_id, period_start, period_end),
  KEY idx_timesheets_user_status (user_id, status),
  KEY idx_timesheets_period (period_start, period_end),
  CONSTRAINT fk_timesheets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_timesheets_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Time entries table
CREATE TABLE IF NOT EXISTS time_entries (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  project_id BIGINT UNSIGNED NOT NULL,
  task_id BIGINT UNSIGNED NOT NULL,
  timesheet_id BIGINT UNSIGNED NULL,
  work_date DATE NOT NULL,
  started_at DATETIME NULL,
  ended_at DATETIME NULL,
  duration_minutes INT UNSIGNED NOT NULL DEFAULT 0,
  description TEXT NULL,
  entry_type ENUM('timer', 'manual') NOT NULL DEFAULT 'manual',
  is_billable TINYINT(1) NOT NULL DEFAULT 1,
  approval_status ENUM('draft', 'submitted', 'approved', 'rejected') NOT NULL DEFAULT 'draft',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  KEY idx_time_entries_user_date (user_id, work_date),
  KEY idx_time_entries_project_date (project_id, work_date),
  KEY idx_time_entries_task_date (task_id, work_date),
  KEY idx_time_entries_status (approval_status),
  KEY idx_time_entries_timesheet (timesheet_id),
  CONSTRAINT fk_time_entries_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_time_entries_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_time_entries_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_time_entries_timesheet FOREIGN KEY (timesheet_id) REFERENCES timesheets(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Active timers table (guarantees strictly one active timer per user at DB level)
CREATE TABLE IF NOT EXISTS active_timers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  task_id BIGINT UNSIGNED NOT NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  stopped_at DATETIME NULL,
  status ENUM('running', 'paused', 'stopped') NOT NULL DEFAULT 'running',
  description VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_active_timer (user_id),
  KEY idx_active_timers_task (task_id),
  CONSTRAINT fk_active_timers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_active_timers_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
