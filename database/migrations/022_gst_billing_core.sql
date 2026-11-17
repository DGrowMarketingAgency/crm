-- Migration 022: GST billing core (Phase 1 of the Finance plan)
-- Agency billing profile, gap-free invoice number series per type, credit notes.
-- Column additions to invoices / invoice_items / clients / services / payments are applied
-- idempotently by server/src/scripts/run-migration-022.js.

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
