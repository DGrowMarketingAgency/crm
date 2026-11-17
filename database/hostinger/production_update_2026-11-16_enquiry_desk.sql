-- =====================================================================================
-- D-GROW CRM - Production update: Enquiry desk (Leads & Follow-ups upgrade)
-- Date: 2026-11-16   |   Run AFTER production_update_2026-11-14_finance_phase3.sql
--
-- Adds: leads.referrer_name (who referred the enquiry / marketing person name);
--       lead_interactions.duration_minutes, negotiation_round, amount (call length,
--       negotiation round number, revised budget); leads.delete permission (owner, admin).
--
-- HOW TO RUN: phpMyAdmin -> select the CRM database -> Export a backup -> SQL tab -> paste -> Go.
-- SAFE TO RE-RUN: every step checks first; nothing is dropped or overwritten.
-- =====================================================================================

SET NAMES utf8mb4;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'referrer_name');
SET @q = IF(@n = 0, 'ALTER TABLE leads ADD COLUMN referrer_name VARCHAR(255) NULL AFTER source', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lead_interactions' AND COLUMN_NAME = 'duration_minutes');
SET @q = IF(@n = 0, 'ALTER TABLE lead_interactions ADD COLUMN duration_minutes SMALLINT UNSIGNED NULL AFTER outcome', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lead_interactions' AND COLUMN_NAME = 'negotiation_round');
SET @q = IF(@n = 0, 'ALTER TABLE lead_interactions ADD COLUMN negotiation_round SMALLINT UNSIGNED NULL AFTER duration_minutes', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lead_interactions' AND COLUMN_NAME = 'amount');
SET @q = IF(@n = 0, 'ALTER TABLE lead_interactions ADD COLUMN amount DECIMAL(12,2) NULL AFTER negotiation_round', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

-- Number existing negotiation follow-ups per lead (1, 2, 3…) so old history shows rounds too
UPDATE lead_interactions li
JOIN (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY lead_id ORDER BY created_at, id) AS rn
  FROM lead_interactions WHERE interaction_type = 'negotiation'
) x ON x.id = li.id
SET li.negotiation_round = x.rn
WHERE li.negotiation_round IS NULL;

-- Delete-enquiry permission (the app also adds it on start-up)
INSERT IGNORE INTO permissions (permission_key, module, action, description) VALUES
  ('leads.delete', 'Leads', 'delete', 'Allows permanently removing enquiries that were never onboarded');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key = 'leads.delete' WHERE r.slug IN ('owner', 'admin');

-- Verification: every value should be 1 (delete_roles 2)
SELECT
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'referrer_name') AS referrer_col,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lead_interactions' AND COLUMN_NAME = 'duration_minutes') AS duration_col,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lead_interactions' AND COLUMN_NAME = 'negotiation_round') AS round_col,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lead_interactions' AND COLUMN_NAME = 'amount') AS amount_col,
  (SELECT COUNT(*) FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
     WHERE p.permission_key = 'leads.delete' AND r.slug IN ('owner', 'admin')) AS delete_roles;
