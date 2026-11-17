-- =====================================================================================
-- D-GROW CRM - Production update: Finance Phase 3 (reports, auditor, billing alerts, retainer invoices)
-- Date: 2026-11-14   |   Run AFTER production_update_2026-11-14_sales_phase2.sql
--
-- Adds: billing_reminder_log table; projects.retainer_auto_invoice / retainer_invoice_type;
--       finance.reports.view permission (owner, admin, auditor); the read-only Auditor role.
--
-- HOW TO RUN: phpMyAdmin -> select the CRM database -> Export a backup -> SQL tab -> paste -> Go.
-- SAFE TO RE-RUN: every step checks first; nothing is dropped or overwritten.
-- =====================================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS billing_reminder_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kind ENUM('due_soon', 'due_today', 'overdue', 'renewal') NOT NULL,
  ref_type ENUM('invoice', 'project') NOT NULL,
  ref_id BIGINT UNSIGNED NOT NULL,
  period_key VARCHAR(20) NOT NULL,
  recipients INT UNSIGNED NOT NULL DEFAULT 0,
  sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_brl (kind, ref_type, ref_id, period_key),
  INDEX idx_brl_sent (sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Retainer billing columns (added only when missing)
SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'retainer_auto_invoice');
SET @q = IF(@n = 0, 'ALTER TABLE projects ADD COLUMN retainer_auto_invoice BOOLEAN NOT NULL DEFAULT FALSE AFTER billing_status', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'retainer_invoice_type');
SET @q = IF(@n = 0, "ALTER TABLE projects ADD COLUMN retainer_invoice_type ENUM('INV','INC','IND') NULL AFTER retainer_auto_invoice", 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

-- Finance reports permission
INSERT IGNORE INTO permissions (permission_key, module, action, description) VALUES
  ('finance.reports.view', 'Finance', 'view_reports', 'Sales register, GST return summary, receivables aging and payments received, with export');

-- Auditor role (read-only finance). The app also creates it on start-up.
INSERT INTO roles (name, slug, description, is_system)
SELECT 'Auditor', 'auditor', 'External or internal auditor with read-only access to invoices, payments and GST / finance reports.', 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM roles WHERE slug = 'auditor');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key = 'finance.reports.view' WHERE r.slug IN ('owner', 'admin', 'auditor');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.permission_key IN ('invoices.view', 'payments.view', 'notifications.view', 'notifications.manage_own', 'permissions.view')
WHERE r.slug = 'auditor';

-- Verification: every value should be 1 (auditor_permissions 6)
SELECT
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_reminder_log') AS reminder_log_table,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'retainer_auto_invoice') AS retainer_col,
  (SELECT COUNT(*) FROM roles WHERE slug = 'auditor') AS auditor_role,
  (SELECT COUNT(*) FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE r.slug = 'auditor') AS auditor_permissions;
