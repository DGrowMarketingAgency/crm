-- =====================================================================================
-- D-GROW CRM - Production update: EVERYTHING since the 2026-11-19 update
-- Date: 2026-11-25
--
-- Includes (031 -> 039):
--   031/032  Client month plans + month plan billing (re-runs safely if already applied on the 19th)
--   033      Unified service pipelines (task templates, est. days, template key)
--   034      Client content plans (content calendar settings)
--   035      Videographers + monthly shoot availability
--   036      Shoot slots + first-come booking
--   037      Shoot date proposals + reminder log + attendance
--   038      Shoot footage hand-in, freelancer payout link, slot -> project link
--   039      Borrowed money (lender + repayments)
--
-- HOW TO RUN: phpMyAdmin -> select the CRM database -> Export a backup first -> SQL tab -> paste ALL -> Go.
-- SAFE TO RE-RUN: tables/columns/keys are created only if missing; nothing is dropped or overwritten.
-- Note: the 17 standard service pipelines (033) and new permissions are added by the Node app itself
--       when it starts, so restart the Node.js app after running this.
-- =====================================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS client_month_plans (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id BIGINT UNSIGNED NOT NULL,
  plan_month CHAR(7) NOT NULL,
  status ENUM('draft', 'active', 'closed') NOT NULL DEFAULT 'active',
  notes TEXT NULL,
  billing_amount DECIMAL(12,2) NULL,
  copied_from_plan_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NULL,
  closed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cmp_client_month (client_id, plan_month),
  INDEX idx_cmp_month (plan_month, status),
  CONSTRAINT fk_cmp_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_cmp_copied_from FOREIGN KEY (copied_from_plan_id) REFERENCES client_month_plans(id) ON DELETE SET NULL,
  CONSTRAINT fk_cmp_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- projects.month_plan_id (added only when missing)
SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'month_plan_id');
SET @q = IF(@n = 0, 'ALTER TABLE projects ADD COLUMN month_plan_id BIGINT UNSIGNED NULL AFTER cycle_month', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND CONSTRAINT_NAME = 'fk_projects_month_plan');
SET @q = IF(@n = 0, 'ALTER TABLE projects ADD CONSTRAINT fk_projects_month_plan FOREIGN KEY (month_plan_id) REFERENCES client_month_plans(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

-- Month plan billing columns (added only when missing)
SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'client_month_plans' AND COLUMN_NAME = 'invoice_type');
SET @q = IF(@n = 0, "ALTER TABLE client_month_plans ADD COLUMN invoice_type ENUM('INV','INC','IND') NULL AFTER billing_amount", 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'client_month_plans' AND COLUMN_NAME = 'auto_invoice');
SET @q = IF(@n = 0, 'ALTER TABLE client_month_plans ADD COLUMN auto_invoice BOOLEAN NOT NULL DEFAULT FALSE AFTER invoice_type', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'client_month_plans' AND COLUMN_NAME = 'invoice_id');
SET @q = IF(@n = 0, 'ALTER TABLE client_month_plans ADD COLUMN invoice_id BIGINT UNSIGNED NULL AFTER auto_invoice', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'client_month_plans' AND COLUMN_NAME = 'auto_drafted');
SET @q = IF(@n = 0, 'ALTER TABLE client_month_plans ADD COLUMN auto_drafted BOOLEAN NOT NULL DEFAULT FALSE AFTER copied_from_plan_id', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'client_month_plans' AND CONSTRAINT_NAME = 'fk_cmp_invoice');
SET @q = IF(@n = 0, 'ALTER TABLE client_month_plans ADD CONSTRAINT fk_cmp_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

-- One engine: pipeline steps carry default task templates; projects keep a snapshot (+ estimated days).
-- The 17 standard service pipelines are seeded automatically when the Node app starts (run-migration-033.js).
SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'project_pipeline_steps' AND COLUMN_NAME = 'task_templates');
SET @q = IF(@n = 0, 'ALTER TABLE project_pipeline_steps ADD COLUMN task_templates JSON NULL', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'project_steps' AND COLUMN_NAME = 'task_templates');
SET @q = IF(@n = 0, 'ALTER TABLE project_steps ADD COLUMN task_templates JSON NULL', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'project_steps' AND COLUMN_NAME = 'est_days');
SET @q = IF(@n = 0, 'ALTER TABLE project_steps ADD COLUMN est_days INT UNSIGNED NULL AFTER step_type', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'project_pipelines' AND COLUMN_NAME = 'template_key');
SET @q = IF(@n = 0, 'ALTER TABLE project_pipelines ADD COLUMN template_key VARCHAR(60) NULL AFTER service_id', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'project_pipelines' AND INDEX_NAME = 'uq_pp_template_key');
SET @q = IF(@n = 0, 'ALTER TABLE project_pipelines ADD UNIQUE KEY uq_pp_template_key (template_key)', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

-- Per-client content calendar settings (Reels/Posts per month, weekdays, platform, pillars).
CREATE TABLE IF NOT EXISTS client_content_plans (
  client_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  reels_per_month SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  posts_per_month SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  reel_days VARCHAR(20) NOT NULL DEFAULT '6,0,3',
  post_days VARCHAR(20) NOT NULL DEFAULT '1,2,4',
  platform VARCHAR(64) NULL,
  pillars JSON NULL,
  default_assignee_id BIGINT UNSIGNED NULL,
  client_visible BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by BIGINT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ccp_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_ccp_assignee FOREIGN KEY (default_assignee_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_ccp_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Existing retainer cycles join a month plan for their client + month (past months closed).
INSERT IGNORE INTO client_month_plans (client_id, plan_month, status, created_by, closed_at)
SELECT p.client_id, p.cycle_month,
       IF(p.cycle_month < DATE_FORMAT(CURDATE(), '%Y-%m'), 'closed', 'active'),
       MIN(p.created_by),
       IF(p.cycle_month < DATE_FORMAT(CURDATE(), '%Y-%m'), NOW(), NULL)
FROM projects p
WHERE p.parent_project_id IS NOT NULL AND p.month_plan_id IS NULL AND p.cycle_month IS NOT NULL AND p.client_id IS NOT NULL
GROUP BY p.client_id, p.cycle_month;

UPDATE projects p
JOIN client_month_plans mp ON mp.client_id = p.client_id AND mp.plan_month = p.cycle_month
SET p.month_plan_id = mp.id
WHERE p.parent_project_id IS NOT NULL AND p.month_plan_id IS NULL AND p.cycle_month IS NOT NULL;

-- Verification: every value should be 1 (unlinked_cycles 0)
SELECT
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'client_month_plans' AND COLUMN_NAME = 'auto_invoice') AS billing_cols,
  (SELECT COUNT(*) FROM projects WHERE parent_project_id IS NOT NULL AND month_plan_id IS NULL AND cycle_month IS NOT NULL) AS unlinked_cycles,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'client_month_plans') AS month_plans_table,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'month_plan_id') AS month_plan_col,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND CONSTRAINT_NAME = 'fk_projects_month_plan') AS month_plan_fk;


-- ─── 035: Videographers + monthly shoot availability ───

CREATE TABLE IF NOT EXISTS videographer_profiles (
  user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  kind ENUM('in_house', 'freelance') NOT NULL DEFAULT 'freelance',
  rate_amount DECIMAL(10,2) NULL,
  rate_unit ENUM('shoot', 'hour', 'day') NOT NULL DEFAULT 'shoot',
  kit VARCHAR(500) NULL,
  areas VARCHAR(500) NULL,
  notes VARCHAR(1000) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_vp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS videographer_availability (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  avail_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  full_day BOOLEAN NOT NULL DEFAULT FALSE,
  note VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_va_date (avail_date),
  INDEX idx_va_user_date (user_id, avail_date),
  CONSTRAINT fk_va_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS videographer_month_status (
  user_id BIGINT UNSIGNED NOT NULL,
  month CHAR(7) NOT NULL,
  submitted_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, month),
  CONSTRAINT fk_vms_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─── 036: Shoot slots + first-come booking ───

CREATE TABLE IF NOT EXISTS shoot_slots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_id BIGINT UNSIGNED NOT NULL,
  project_id BIGINT UNSIGNED NULL,
  title VARCHAR(255) NOT NULL,
  shoot_type VARCHAR(50) NOT NULL DEFAULT 'Reels',
  shoot_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  area VARCHAR(150) NOT NULL,
  address VARCHAR(500) NULL,
  map_url VARCHAR(500) NULL,
  brief TEXT NULL,
  pay_amount DECIMAL(10,2) NULL,
  people_needed TINYINT UNSIGNED NOT NULL DEFAULT 1,
  status ENUM('open', 'booked', 'cancelled', 'completed') NOT NULL DEFAULT 'open',
  cancel_reason VARCHAR(255) NULL,
  calendar_event_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ss_date (shoot_date),
  INDEX idx_ss_status_date (status, shoot_date),
  CONSTRAINT fk_ss_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shoot_bookings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slot_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  status ENUM('booked', 'withdrawn', 'removed') NOT NULL DEFAULT 'booked',
  assigned_by BIGINT UNSIGNED NULL,
  booked_at DATETIME NOT NULL,
  ended_at DATETIME NULL,
  end_reason VARCHAR(255) NULL,
  attendance ENUM('attended', 'no_show') NULL,
  attendance_by BIGINT UNSIGNED NULL,
  attendance_at DATETIME NULL,
  footage_url VARCHAR(1000) NULL,
  footage_notes VARCHAR(1000) NULL,
  footage_at DATETIME NULL,
  expense_id BIGINT UNSIGNED NULL,
  INDEX idx_sb_slot (slot_id, status),
  INDEX idx_sb_user (user_id, status),
  CONSTRAINT fk_sb_slot FOREIGN KEY (slot_id) REFERENCES shoot_slots(id) ON DELETE CASCADE,
  CONSTRAINT fk_sb_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─── 037: Shoot date proposals (client picks) + reminder log ───

CREATE TABLE IF NOT EXISTS shoot_proposals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  shoot_type VARCHAR(50) NOT NULL DEFAULT 'Reels',
  area VARCHAR(150) NOT NULL,
  address VARCHAR(500) NULL,
  map_url VARCHAR(500) NULL,
  brief TEXT NULL,
  pay_amount DECIMAL(10,2) NULL,
  people_needed TINYINT UNSIGNED NOT NULL DEFAULT 1,
  message_to_client VARCHAR(1000) NULL,
  status ENUM('pending', 'accepted', 'declined', 'withdrawn') NOT NULL DEFAULT 'pending',
  chosen_option_id BIGINT UNSIGNED NULL,
  slot_id BIGINT UNSIGNED NULL,
  client_note VARCHAR(1000) NULL,
  responded_by BIGINT UNSIGNED NULL,
  responded_at DATETIME NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sp_client_status (client_id, status),
  CONSTRAINT fk_sp_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shoot_proposal_options (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  proposal_id BIGINT UNSIGNED NOT NULL,
  shoot_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  INDEX idx_spo_proposal (proposal_id),
  CONSTRAINT fk_spo_proposal FOREIGN KEY (proposal_id) REFERENCES shoot_proposals(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shoot_reminder_log (
  kind VARCHAR(40) NOT NULL,
  ref_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  period_key VARCHAR(20) NOT NULL DEFAULT '',
  sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (kind, ref_id, user_id, period_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─── 039: Borrowed money (lender + repayments) ───

CREATE TABLE IF NOT EXISTS borrowings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  lender_name VARCHAR(150) NOT NULL,
  lender_phone VARCHAR(20) NULL,
  amount DECIMAL(12,2) NOT NULL,
  borrowed_on DATE NOT NULL,
  received_mode VARCHAR(60) NULL,
  purpose VARCHAR(255) NULL,
  return_by DATE NULL,
  status ENUM('open', 'settled') NOT NULL DEFAULT 'open',
  settled_on DATE NULL,
  notes TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_borrowings_status (status),
  INDEX idx_borrowings_lender (lender_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS borrowing_repayments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  borrowing_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  paid_on DATE NOT NULL,
  payment_mode VARCHAR(60) NULL,
  reference VARCHAR(100) NULL,
  notes VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_br_borrowing (borrowing_id),
  CONSTRAINT fk_br_borrowing FOREIGN KEY (borrowing_id) REFERENCES borrowings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─── 037/038: columns for databases where the shoot tables already existed ───
SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shoot_bookings' AND COLUMN_NAME = 'attendance');
SET @q = IF(@n = 0, "ALTER TABLE shoot_bookings ADD COLUMN attendance ENUM('attended','no_show') NULL AFTER end_reason", 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shoot_bookings' AND COLUMN_NAME = 'attendance_by');
SET @q = IF(@n = 0, "ALTER TABLE shoot_bookings ADD COLUMN attendance_by BIGINT UNSIGNED NULL AFTER attendance", 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shoot_bookings' AND COLUMN_NAME = 'attendance_at');
SET @q = IF(@n = 0, "ALTER TABLE shoot_bookings ADD COLUMN attendance_at DATETIME NULL AFTER attendance_by", 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shoot_bookings' AND COLUMN_NAME = 'footage_url');
SET @q = IF(@n = 0, "ALTER TABLE shoot_bookings ADD COLUMN footage_url VARCHAR(1000) NULL AFTER attendance_at", 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shoot_bookings' AND COLUMN_NAME = 'footage_notes');
SET @q = IF(@n = 0, "ALTER TABLE shoot_bookings ADD COLUMN footage_notes VARCHAR(1000) NULL AFTER footage_url", 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shoot_bookings' AND COLUMN_NAME = 'footage_at');
SET @q = IF(@n = 0, "ALTER TABLE shoot_bookings ADD COLUMN footage_at DATETIME NULL AFTER footage_notes", 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shoot_bookings' AND COLUMN_NAME = 'expense_id');
SET @q = IF(@n = 0, "ALTER TABLE shoot_bookings ADD COLUMN expense_id BIGINT UNSIGNED NULL AFTER footage_at", 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shoot_slots' AND COLUMN_NAME = 'project_id');
SET @q = IF(@n = 0, "ALTER TABLE shoot_slots ADD COLUMN project_id BIGINT UNSIGNED NULL AFTER client_id", 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shoot_slots' AND INDEX_NAME = 'idx_ss_project');
SET @q = IF(@n = 0, 'ALTER TABLE shoot_slots ADD INDEX idx_ss_project (project_id)', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

-- Verification: every value should be 1
SELECT
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'client_content_plans') AS content_plans,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'videographer_availability') AS videographers,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shoot_proposals') AS shoot_proposals,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shoot_bookings' AND COLUMN_NAME = 'expense_id') AS shoot_payout_col,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'project_pipelines' AND COLUMN_NAME = 'template_key') AS pipeline_templates,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'borrowing_repayments') AS borrowed_money;
