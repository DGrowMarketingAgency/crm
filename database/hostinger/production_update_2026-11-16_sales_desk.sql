-- =====================================================================================
-- D-GROW CRM - Production update: Sales desk (Phase A of the marketing flow)
-- Date: 2026-11-16   |   Run AFTER production_update_2026-11-16_enquiry_desk.sql
--
-- Adds: leads.rep_user_id (the marketing person who brought the enquiry in), filled for
--       existing enquiries added by field executives; sales_reminder_log so meeting and
--       follow-up reminders are sent only once.
--
-- HOW TO RUN: phpMyAdmin -> select the CRM database -> Export a backup -> SQL tab -> paste -> Go.
-- SAFE TO RE-RUN: every step checks first; nothing is dropped or overwritten.
-- =====================================================================================

SET NAMES utf8mb4;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'rep_user_id');
SET @q = IF(@n = 0, 'ALTER TABLE leads ADD COLUMN rep_user_id BIGINT UNSIGNED NULL AFTER owner_user_id', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND INDEX_NAME = 'idx_leads_rep');
SET @q = IF(@n = 0, 'ALTER TABLE leads ADD INDEX idx_leads_rep (rep_user_id)', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND CONSTRAINT_NAME = 'fk_leads_rep');
SET @q = IF(@n = 0, 'ALTER TABLE leads ADD CONSTRAINT fk_leads_rep FOREIGN KEY (rep_user_id) REFERENCES users(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

-- Existing enquiries added by a field executive (marketing person) were brought in by them
UPDATE leads l
SET l.rep_user_id = l.created_by
WHERE l.rep_user_id IS NULL AND l.created_by IS NOT NULL
  AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = l.created_by AND r.slug = 'field-executive');

CREATE TABLE IF NOT EXISTS sales_reminder_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kind VARCHAR(30) NOT NULL,
  ref_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  period_key VARCHAR(20) NOT NULL,
  sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_srl (kind, ref_id, user_id, period_key),
  INDEX idx_srl_sent (sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Verification: every value should be 1
SELECT
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'rep_user_id') AS rep_col,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND CONSTRAINT_NAME = 'fk_leads_rep') AS rep_fk,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_reminder_log') AS reminder_log;
