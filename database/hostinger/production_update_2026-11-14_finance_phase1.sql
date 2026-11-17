-- =====================================================================================
-- D-GROW CRM - Production update: Finance Phase 1 (GST billing core)
-- Date: 2026-11-14   |   Run AFTER production_update_2026-11-13.sql
--
-- Adds: agency billing settings, gap-free invoice number series (INV / INC / IND / CN),
--       credit notes, GST columns on invoices + invoice lines, client GST profile fields,
--       service SAC / GST rate, cheque payment mode, finance.settings.manage permission.
--
-- HOW TO RUN: phpMyAdmin -> select the CRM database -> Export a backup -> SQL tab -> paste -> Go.
-- SAFE TO RE-RUN: every step checks first; nothing is dropped or overwritten.
-- =====================================================================================

SET NAMES utf8mb4;

-- 1. Agency billing profile (single row, id = 1)
CREATE TABLE IF NOT EXISTS agency_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  agency_name VARCHAR(255) NOT NULL DEFAULT 'D-GROW Marketing Agency',
  legal_name VARCHAR(255) NULL,
  gstin VARCHAR(15) NULL,
  pan VARCHAR(10) NULL,
  phone VARCHAR(100) NULL,
  email VARCHAR(255) NULL,
  website VARCHAR(255) NULL,
  address TEXT NULL,
  city VARCHAR(100) NULL,
  state VARCHAR(60) NOT NULL DEFAULT 'Tamil Nadu',
  state_code CHAR(2) NOT NULL DEFAULT '33',
  pincode VARCHAR(10) NULL,
  bank_name VARCHAR(255) NULL,
  account_name VARCHAR(255) NULL,
  account_number VARCHAR(40) NULL,
  ifsc VARCHAR(20) NULL,
  branch VARCHAR(255) NULL,
  upi_id VARCHAR(100) NULL,
  gpay_number VARCHAR(30) NULL,
  signatory_name VARCHAR(255) NULL,
  signatory_title VARCHAR(255) NULL,
  terms_scope TEXT NULL,
  terms_payment TEXT NULL,
  terms_third_party TEXT NULL,
  terms_confidentiality TEXT NULL,
  terms_cancellation TEXT NULL,
  default_payment_terms_days INT UNSIGNED NOT NULL DEFAULT 7,
  updated_by BIGINT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_agency_settings_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO agency_settings (id) VALUES (1);

-- 2. Number series. Numbers are taken only when a document is ISSUED, so drafts never leave gaps.
CREATE TABLE IF NOT EXISTS invoice_number_series (
  code VARCHAR(10) NOT NULL PRIMARY KEY,
  label VARCHAR(100) NOT NULL,
  prefix VARCHAR(20) NOT NULL,
  next_number INT UNSIGNED NOT NULL DEFAULT 1,
  padding TINYINT UNSIGNED NOT NULL DEFAULT 3,
  fy_reset BOOLEAN NOT NULL DEFAULT FALSE,
  current_fy CHAR(7) NULL,
  is_tax BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO invoice_number_series (code, label, prefix, padding, is_tax) VALUES
  ('INV', 'GST Invoice', 'INV', 3, TRUE),
  ('INC', 'GST Invoice (GST-registered client)', 'INC', 3, TRUE),
  ('IND', 'Non-GST Invoice', 'IND', 3, FALSE),
  ('CN',  'Credit Note', 'CN', 3, TRUE);

-- 3. Credit notes: an issued invoice is cancelled by a credit note, never deleted.
CREATE TABLE IF NOT EXISTS credit_notes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  credit_note_number VARCHAR(50) NOT NULL UNIQUE,
  invoice_id BIGINT UNSIGNED NOT NULL,
  client_id BIGINT UNSIGNED NOT NULL,
  note_date DATE NOT NULL,
  taxable_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  cgst_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  sgst_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  igst_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  reason TEXT NOT NULL,
  issued_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cn_invoice (invoice_id),
  INDEX idx_cn_client (client_id),
  CONSTRAINT fk_cn_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cn_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cn_issued_by FOREIGN KEY (issued_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- New columns (added only when missing)
SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'invoice_type');
SET @q = IF(@n = 0, "ALTER TABLE invoices ADD COLUMN invoice_type ENUM('INV','INC','IND') NULL AFTER invoice_number", 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'place_of_supply');
SET @q = IF(@n = 0, 'ALTER TABLE invoices ADD COLUMN place_of_supply VARCHAR(60) NULL AFTER invoice_type', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'place_state_code');
SET @q = IF(@n = 0, 'ALTER TABLE invoices ADD COLUMN place_state_code CHAR(2) NULL AFTER place_of_supply', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'supply_type');
SET @q = IF(@n = 0, "ALTER TABLE invoices ADD COLUMN supply_type ENUM('intra','inter') NULL AFTER place_state_code", 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'taxable_amount');
SET @q = IF(@n = 0, 'ALTER TABLE invoices ADD COLUMN taxable_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER discount_amount', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'cgst_amount');
SET @q = IF(@n = 0, 'ALTER TABLE invoices ADD COLUMN cgst_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER tax_amount', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'sgst_amount');
SET @q = IF(@n = 0, 'ALTER TABLE invoices ADD COLUMN sgst_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER cgst_amount', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'igst_amount');
SET @q = IF(@n = 0, 'ALTER TABLE invoices ADD COLUMN igst_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER sgst_amount', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'round_off');
SET @q = IF(@n = 0, 'ALTER TABLE invoices ADD COLUMN round_off DECIMAL(6,2) NOT NULL DEFAULT 0.00 AFTER igst_amount', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'cancelled_at');
SET @q = IF(@n = 0, 'ALTER TABLE invoices ADD COLUMN cancelled_at DATETIME NULL', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'cancelled_by');
SET @q = IF(@n = 0, 'ALTER TABLE invoices ADD COLUMN cancelled_by BIGINT UNSIGNED NULL', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'cancel_reason');
SET @q = IF(@n = 0, 'ALTER TABLE invoices ADD COLUMN cancel_reason TEXT NULL', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoice_items' AND COLUMN_NAME = 'service_master_id');
SET @q = IF(@n = 0, 'ALTER TABLE invoice_items ADD COLUMN service_master_id BIGINT UNSIGNED NULL AFTER invoice_id', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoice_items' AND COLUMN_NAME = 'details');
SET @q = IF(@n = 0, 'ALTER TABLE invoice_items ADD COLUMN details TEXT NULL AFTER item_description', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoice_items' AND COLUMN_NAME = 'sac_code');
SET @q = IF(@n = 0, 'ALTER TABLE invoice_items ADD COLUMN sac_code VARCHAR(20) NULL AFTER details', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoice_items' AND COLUMN_NAME = 'discount_amount');
SET @q = IF(@n = 0, 'ALTER TABLE invoice_items ADD COLUMN discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER discount_percent', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoice_items' AND COLUMN_NAME = 'taxable_amount');
SET @q = IF(@n = 0, 'ALTER TABLE invoice_items ADD COLUMN taxable_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER discount_amount', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoice_items' AND COLUMN_NAME = 'cgst_amount');
SET @q = IF(@n = 0, 'ALTER TABLE invoice_items ADD COLUMN cgst_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER tax_rate', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoice_items' AND COLUMN_NAME = 'sgst_amount');
SET @q = IF(@n = 0, 'ALTER TABLE invoice_items ADD COLUMN sgst_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER cgst_amount', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoice_items' AND COLUMN_NAME = 'igst_amount');
SET @q = IF(@n = 0, 'ALTER TABLE invoice_items ADD COLUMN igst_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER sgst_amount', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'state');
SET @q = IF(@n = 0, 'ALTER TABLE clients ADD COLUMN state VARCHAR(60) NULL AFTER city', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'state_code');
SET @q = IF(@n = 0, 'ALTER TABLE clients ADD COLUMN state_code CHAR(2) NULL AFTER state', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'pincode');
SET @q = IF(@n = 0, 'ALTER TABLE clients ADD COLUMN pincode VARCHAR(10) NULL AFTER state_code', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'pan');
SET @q = IF(@n = 0, 'ALTER TABLE clients ADD COLUMN pan VARCHAR(10) NULL AFTER gstin', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'payment_terms_days');
SET @q = IF(@n = 0, 'ALTER TABLE clients ADD COLUMN payment_terms_days INT UNSIGNED NULL AFTER pan', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services' AND COLUMN_NAME = 'sac_code');
SET @q = IF(@n = 0, 'ALTER TABLE services ADD COLUMN sac_code VARCHAR(20) NULL AFTER category', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services' AND COLUMN_NAME = 'default_rate');
SET @q = IF(@n = 0, 'ALTER TABLE services ADD COLUMN default_rate DECIMAL(12,2) NULL AFTER sac_code', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services' AND COLUMN_NAME = 'gst_rate');
SET @q = IF(@n = 0, 'ALTER TABLE services ADD COLUMN gst_rate DECIMAL(5,2) NOT NULL DEFAULT 18.00 AFTER default_rate', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services' AND COLUMN_NAME = 'billing_details');
SET @q = IF(@n = 0, 'ALTER TABLE services ADD COLUMN billing_details TEXT NULL AFTER gst_rate', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

-- Foreign keys
SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices' AND CONSTRAINT_NAME = 'fk_invoices_cancelled_by');
SET @q = IF(@n = 0, 'ALTER TABLE invoices ADD CONSTRAINT fk_invoices_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoice_items' AND CONSTRAINT_NAME = 'fk_invoice_items_service_master');
SET @q = IF(@n = 0, 'ALTER TABLE invoice_items ADD CONSTRAINT fk_invoice_items_service_master FOREIGN KEY (service_master_id) REFERENCES services(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

-- Cheque as a payment mode
SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'payment_method' AND COLUMN_TYPE LIKE '%''cheque''%');
SET @q = IF(@n = 0, "ALTER TABLE payments MODIFY payment_method ENUM('bank_transfer','upi','cash','card','cheque','payment_gateway','other') NOT NULL DEFAULT 'bank_transfer'", 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

-- Permission for Finance Settings (owner and admin). The app also syncs this on start-up.
INSERT IGNORE INTO permissions (permission_key, module, action, description) VALUES
  ('finance.settings.manage', 'Finance', 'manage_settings', 'Edit agency GST profile, bank / UPI details, signatory, invoice terms and invoice number series');
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key = 'finance.settings.manage' WHERE r.slug IN ('owner', 'admin');

-- Verification: every value should be 1 (series_rows 4)
SELECT
  (SELECT COUNT(*) FROM agency_settings WHERE id = 1) AS agency_settings_row,
  (SELECT COUNT(*) FROM invoice_number_series) AS series_rows,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'credit_notes') AS credit_notes_table,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'cgst_amount') AS invoice_gst_cols,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'state_code') AS client_state_col,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services' AND COLUMN_NAME = 'gst_rate') AS service_gst_col,
  (SELECT COUNT(*) FROM permissions WHERE permission_key = 'finance.settings.manage') AS finance_perm;
