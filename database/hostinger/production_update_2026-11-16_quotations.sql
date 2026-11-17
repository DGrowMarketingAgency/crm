-- =====================================================================================
-- D-GROW CRM - Production update: Quotations (Phase B of the marketing flow)
-- Date: 2026-11-16   |   Run AFTER production_update_2026-11-16_sales_desk.sql
--
-- Adds: sales_quotations, sales_quotation_items, sales_quotation_rounds; the QUO number series
--       (edit its next number in Finance Settings to continue the old portal's numbering);
--       permissions sales_quotes.view / .request / .price.
-- Changes: marketing people (Field Executive role) can request quotations without prices and no
--       longer create or send priced proposals - the admin prices everything.
--
-- HOW TO RUN: phpMyAdmin -> select the CRM database -> Export a backup -> SQL tab -> paste -> Go.
-- SAFE TO RE-RUN: every step checks first; nothing is dropped or overwritten.
-- =====================================================================================

SET NAMES utf8mb4;

-- Was this already installed? (the proposal-permission change below runs only the first time)
SET @had_quotes = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_quotations');

CREATE TABLE IF NOT EXISTS sales_quotations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  quote_number VARCHAR(30) NOT NULL UNIQUE,
  lead_id BIGINT UNSIGNED NULL,
  client_id BIGINT UNSIGNED NULL,
  proposal_id BIGINT UNSIGNED NULL,
  title VARCHAR(255) NOT NULL,
  status ENUM('requested','draft','sent','viewed','negotiating','approved','rejected','converted','expired') NOT NULL DEFAULT 'requested',
  gst_mode ENUM('gst','non_gst') NOT NULL DEFAULT 'gst',
  quote_date DATE NOT NULL,
  valid_until DATE NULL,
  requirements TEXT NULL,
  terms TEXT NULL,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  taxable_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  round_off DECIMAL(6,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  public_token CHAR(32) NOT NULL UNIQUE,
  view_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_viewed_at DATETIME NULL,
  requested_by BIGINT UNSIGNED NULL,
  priced_by BIGINT UNSIGNED NULL,
  priced_at DATETIME NULL,
  sent_at DATETIME NULL,
  decided_at DATETIME NULL,
  decided_by_name VARCHAR(255) NULL,
  decision_note TEXT NULL,
  converted_invoice_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sq_lead (lead_id), INDEX idx_sq_client (client_id), INDEX idx_sq_status (status),
  CONSTRAINT fk_sq_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
  CONSTRAINT fk_sq_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  CONSTRAINT fk_sq_proposal FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE SET NULL,
  CONSTRAINT fk_sq_invoice FOREIGN KEY (converted_invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
  CONSTRAINT fk_sq_requested FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_sq_priced FOREIGN KEY (priced_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_sq_created FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sales_quotation_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  quotation_id BIGINT UNSIGNED NOT NULL,
  service_id BIGINT UNSIGNED NULL,
  description VARCHAR(255) NOT NULL,
  details TEXT NULL,
  sac_code VARCHAR(10) NULL,
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit_price DECIMAL(12,2) NULL,
  gst_rate DECIMAL(5,2) NOT NULL DEFAULT 18,
  sort_order INT NOT NULL DEFAULT 0,
  INDEX idx_sqi_quote (quotation_id, sort_order),
  CONSTRAINT fk_sqi_quote FOREIGN KEY (quotation_id) REFERENCES sales_quotations(id) ON DELETE CASCADE,
  CONSTRAINT fk_sqi_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sales_quotation_rounds (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  quotation_id BIGINT UNSIGNED NOT NULL,
  round_no SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  kind ENUM('requested','priced','client_request','revision','accepted','rejected') NOT NULL,
  discount_amount DECIMAL(12,2) NULL,
  total_amount DECIMAL(12,2) NULL,
  client_amount DECIMAL(12,2) NULL,
  note TEXT NULL,
  by_name VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sqr_quote (quotation_id, created_at),
  CONSTRAINT fk_sqr_quote FOREIGN KEY (quotation_id) REFERENCES sales_quotations(id) ON DELETE CASCADE,
  CONSTRAINT fk_sqr_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Quotation number series (QUO001, QUO002 ...)
INSERT IGNORE INTO invoice_number_series (code, label, prefix, next_number, padding, fy_reset, is_tax)
VALUES ('QUO', 'Quotation', 'QUO', 1, 3, 0, 0);

-- Permissions (the app also adds these on start-up)
INSERT IGNORE INTO permissions (permission_key, module, action, description) VALUES
  ('sales_quotes.view', 'Quotations', 'view', 'See quotations for the enquiries and clients you can access'),
  ('sales_quotes.request', 'Quotations', 'request', 'Ask for a quotation by listing the services a client wants (no prices)'),
  ('sales_quotes.price', 'Quotations', 'price', 'Add prices, GST and discounts, send quotations to clients and record negotiated revisions');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.permission_key IN ('sales_quotes.view', 'sales_quotes.request', 'sales_quotes.price')
WHERE r.slug IN ('owner', 'admin');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.permission_key IN ('sales_quotes.view', 'sales_quotes.request')
WHERE r.slug IN ('field-executive', 'account-manager');

-- Marketing people no longer create / send priced proposals (first install only, so a later
-- manual re-grant by an admin is not undone if this file is run again)
SET @q = IF(@had_quotes = 0,
  "DELETE rp FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id WHERE r.slug = 'field-executive' AND p.permission_key IN ('proposals.create', 'proposals.send')",
  'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

-- Verification: tables 3, quo_series 1, admin_price 1, marketer_request 1, marketer_proposal_create 0
SELECT
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'sales_quotation%') AS tables,
  (SELECT COUNT(*) FROM invoice_number_series WHERE code = 'QUO') AS quo_series,
  (SELECT COUNT(*) FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id WHERE r.slug = 'admin' AND p.permission_key = 'sales_quotes.price') AS admin_price,
  (SELECT COUNT(*) FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id WHERE r.slug = 'field-executive' AND p.permission_key = 'sales_quotes.request') AS marketer_request,
  (SELECT COUNT(*) FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id WHERE r.slug = 'field-executive' AND p.permission_key = 'proposals.create') AS marketer_proposal_create;
