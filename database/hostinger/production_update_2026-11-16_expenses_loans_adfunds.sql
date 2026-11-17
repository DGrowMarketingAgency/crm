-- =====================================================================================
-- D-GROW CRM - Production update: Miscellaneous (expenses & purchases, EMI & loans, client ad funds)
-- Date: 2026-11-16   |   Run AFTER production_update_2026-11-16_document_lifecycle.sql
--
-- Adds: expense_categories (+ the 10 standard categories and their sub-categories), expense_subcategories,
--       expenses (office costs and GST purchase bills), loans + loan_installments (monthly EMI schedule),
--       ad_campaigns + ad_fund_transactions (client ad wallets);
--       permissions expenses.view / .manage (Admin; Auditor view) and adfunds.view / .manage
--       (Admin, Account Manager; Auditor view).
-- EMI reminders (before the due day, on the day, daily while overdue, final EMI) and low ad-wallet
-- alerts are sent by the app itself - nothing to schedule on the server.
--
-- HOW TO RUN: phpMyAdmin -> select the CRM database -> Export a backup -> SQL tab -> paste -> Go.
-- SAFE TO RE-RUN: every step checks first; nothing is dropped or overwritten.
-- =====================================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS expense_categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  kind ENUM('expense','emi','ad_fund') NOT NULL DEFAULT 'expense',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS expense_subcategories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id INT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uq_subcat (category_id, name),
  CONSTRAINT fk_subcat_cat FOREIGN KEY (category_id) REFERENCES expense_categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loans (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lender VARCHAR(120) NOT NULL,
  title VARCHAR(255) NOT NULL,
  loan_type ENUM('loan','emi','credit_card','other') NOT NULL DEFAULT 'emi',
  principal_amount DECIMAL(12,2) NULL,
  emi_amount DECIMAL(12,2) NOT NULL,
  due_day TINYINT UNSIGNED NOT NULL,
  first_due_date DATE NOT NULL,
  last_due_date DATE NOT NULL,
  payment_mode VARCHAR(60) NULL,
  account_ref VARCHAR(80) NULL,
  reminder_days_before TINYINT UNSIGNED NOT NULL DEFAULT 3,
  owner_user_id BIGINT UNSIGNED NULL,
  status ENUM('active','closed') NOT NULL DEFAULT 'active',
  closed_at DATETIME NULL,
  notes TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_loans_status (status),
  CONSTRAINT fk_loans_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_loans_created FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS expenses (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  expense_date DATE NOT NULL,
  category_id INT UNSIGNED NOT NULL,
  subcategory_id INT UNSIGNED NULL,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_mode VARCHAR(60) NULL,
  status ENUM('pending','paid') NOT NULL DEFAULT 'paid',
  paid_date DATE NULL,
  client_id BIGINT UNSIGNED NULL,
  payee VARCHAR(150) NULL,
  reference VARCHAR(100) NULL,
  is_purchase BOOLEAN NOT NULL DEFAULT FALSE,
  vendor_gstin VARCHAR(15) NULL,
  bill_number VARCHAR(60) NULL,
  taxable_amount DECIMAL(12,2) NULL,
  gst_amount DECIMAL(12,2) NULL,
  notes TEXT NULL,
  loan_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_exp_date (expense_date),
  INDEX idx_exp_cat (category_id, expense_date),
  INDEX idx_exp_client (client_id),
  CONSTRAINT fk_exp_cat FOREIGN KEY (category_id) REFERENCES expense_categories(id),
  CONSTRAINT fk_exp_subcat FOREIGN KEY (subcategory_id) REFERENCES expense_subcategories(id) ON DELETE SET NULL,
  CONSTRAINT fk_exp_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  CONSTRAINT fk_exp_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE SET NULL,
  CONSTRAINT fk_exp_created FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loan_installments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  loan_id BIGINT UNSIGNED NOT NULL,
  installment_no SMALLINT UNSIGNED NOT NULL,
  due_date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  status ENUM('upcoming','paid','skipped') NOT NULL DEFAULT 'upcoming',
  paid_date DATE NULL,
  paid_amount DECIMAL(12,2) NULL,
  payment_mode VARCHAR(60) NULL,
  reference VARCHAR(100) NULL,
  expense_id BIGINT UNSIGNED NULL,
  paid_by BIGINT UNSIGNED NULL,
  UNIQUE KEY uq_loan_inst (loan_id, installment_no),
  INDEX idx_inst_due (status, due_date),
  CONSTRAINT fk_inst_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
  CONSTRAINT fk_inst_expense FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE SET NULL,
  CONSTRAINT fk_inst_paid_by FOREIGN KEY (paid_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ad_campaigns (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  platform ENUM('meta','google','youtube','linkedin','other') NOT NULL DEFAULT 'meta',
  daily_budget DECIMAL(12,2) NOT NULL DEFAULT 0,
  status ENUM('active','paused','ended') NOT NULL DEFAULT 'active',
  start_date DATE NULL,
  notes TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_adc_client (client_id, status),
  CONSTRAINT fk_adc_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_adc_created FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ad_fund_transactions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id BIGINT UNSIGNED NOT NULL,
  campaign_id BIGINT UNSIGNED NULL,
  txn_type ENUM('deposit','spend','refund','adjustment') NOT NULL,
  txn_date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  platform VARCHAR(20) NULL,
  payment_mode VARCHAR(60) NULL,
  reference VARCHAR(100) NULL,
  notes VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_aft_client (client_id, txn_date),
  INDEX idx_aft_type (txn_type, txn_date),
  CONSTRAINT fk_aft_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_aft_campaign FOREIGN KEY (campaign_id) REFERENCES ad_campaigns(id) ON DELETE SET NULL,
  CONSTRAINT fk_aft_created FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Standard categories (same as the old Miscellaneous screen); your own can be added in the app
INSERT IGNORE INTO expense_categories (name, kind, sort_order) VALUES
  ('Travel & Transport', 'expense', 10),
  ('Food Expenses', 'expense', 20),
  ('Office Expenses', 'expense', 30),
  ('Software & Technology', 'expense', 40),
  ('Employee', 'expense', 50),
  ('Client-Related Expenses', 'expense', 60),
  ('General Business', 'expense', 70),
  ('Personal Expenses', 'expense', 80),
  ('Refund', 'expense', 90),
  ('EMI & Loans', 'emi', 100);

INSERT IGNORE INTO expense_subcategories (category_id, name)
SELECT c.id, s.name FROM expense_categories c JOIN (
  SELECT 'Petrol / Fuel' AS name UNION ALL
  SELECT 'Rapido / Cab' AS name UNION ALL
  SELECT 'Parking' AS name UNION ALL
  SELECT 'Vehicle Maintenance' AS name UNION ALL
  SELECT 'Vehicle Repair' AS name
) s WHERE c.name = 'Travel & Transport';

INSERT IGNORE INTO expense_subcategories (category_id, name)
SELECT c.id, s.name FROM expense_categories c JOIN (
  SELECT 'Breakfast' AS name UNION ALL
  SELECT 'Lunch' AS name UNION ALL
  SELECT 'Dinner' AS name UNION ALL
  SELECT 'Tea / Coffee' AS name UNION ALL
  SELECT 'Snacks' AS name UNION ALL
  SELECT 'Drinking Water' AS name UNION ALL
  SELECT 'Client Meeting Food' AS name UNION ALL
  SELECT 'Team Food' AS name
) s WHERE c.name = 'Food Expenses';

INSERT IGNORE INTO expense_subcategories (category_id, name)
SELECT c.id, s.name FROM expense_categories c JOIN (
  SELECT 'Stationery' AS name UNION ALL
  SELECT 'Printing' AS name UNION ALL
  SELECT 'Office Supplies' AS name UNION ALL
  SELECT 'Cleaning' AS name UNION ALL
  SELECT 'Drinking Water' AS name UNION ALL
  SELECT 'Electricity' AS name UNION ALL
  SELECT 'Internet' AS name UNION ALL
  SELECT 'Mobile Recharge' AS name UNION ALL
  SELECT 'Office Maintenance' AS name UNION ALL
  SELECT 'Furniture' AS name UNION ALL
  SELECT 'Equipment' AS name UNION ALL
  SELECT 'Repairs' AS name
) s WHERE c.name = 'Office Expenses';

INSERT IGNORE INTO expense_subcategories (category_id, name)
SELECT c.id, s.name FROM expense_categories c JOIN (
  SELECT 'Software Subscription' AS name UNION ALL
  SELECT 'AI Tools' AS name UNION ALL
  SELECT 'Domain' AS name UNION ALL
  SELECT 'Hosting' AS name UNION ALL
  SELECT 'Plugins' AS name UNION ALL
  SELECT 'Cloud Storage' AS name UNION ALL
  SELECT 'API Charges' AS name UNION ALL
  SELECT 'Other Online Services' AS name UNION ALL
  SELECT 'Storage Purchases' AS name UNION ALL
  SELECT 'System Rent' AS name UNION ALL
  SELECT 'Shooting Equipment Rent' AS name
) s WHERE c.name = 'Software & Technology';

INSERT IGNORE INTO expense_subcategories (category_id, name)
SELECT c.id, s.name FROM expense_categories c JOIN (
  SELECT 'Incentive' AS name UNION ALL
  SELECT 'Reimbursement' AS name UNION ALL
  SELECT 'Welfare' AS name
) s WHERE c.name = 'Employee';

INSERT IGNORE INTO expense_subcategories (category_id, name)
SELECT c.id, s.name FROM expense_categories c JOIN (
  SELECT 'Client / Model Travel' AS name UNION ALL
  SELECT 'Client Meeting' AS name UNION ALL
  SELECT 'Client Food' AS name UNION ALL
  SELECT 'Client Gift' AS name UNION ALL
  SELECT 'Client Shoot Expense' AS name UNION ALL
  SELECT 'Client Delivery / Courier' AS name
) s WHERE c.name = 'Client-Related Expenses';

INSERT IGNORE INTO expense_subcategories (category_id, name)
SELECT c.id, s.name FROM expense_categories c JOIN (
  SELECT 'Auditor Bill' AS name UNION ALL
  SELECT 'EB Bill' AS name UNION ALL
  SELECT 'Office Rent' AS name UNION ALL
  SELECT 'Bank Charges' AS name UNION ALL
  SELECT 'Professional Fees' AS name
) s WHERE c.name = 'General Business';

INSERT IGNORE INTO expense_subcategories (category_id, name)
SELECT c.id, s.name FROM expense_categories c JOIN (
  SELECT 'Personal Food' AS name UNION ALL
  SELECT 'Personal Travel' AS name UNION ALL
  SELECT 'Personal Shopping' AS name UNION ALL
  SELECT 'Personal Bills' AS name UNION ALL
  SELECT 'Personal Medical' AS name UNION ALL
  SELECT 'Personal Transfer' AS name UNION ALL
  SELECT 'Personal Withdrawal' AS name UNION ALL
  SELECT 'Family Expense' AS name UNION ALL
  SELECT 'Other Personal' AS name
) s WHERE c.name = 'Personal Expenses';

INSERT IGNORE INTO expense_subcategories (category_id, name)
SELECT c.id, s.name FROM expense_categories c JOIN (
  SELECT 'Client Refund' AS name UNION ALL
  SELECT 'Other Refund' AS name
) s WHERE c.name = 'Refund';

INSERT IGNORE INTO expense_subcategories (category_id, name)
SELECT c.id, s.name FROM expense_categories c JOIN (
  SELECT 'Personal Loan' AS name UNION ALL
  SELECT 'Equipment EMI' AS name UNION ALL
  SELECT 'Vehicle EMI' AS name UNION ALL
  SELECT 'Credit Card Bill' AS name UNION ALL
  SELECT 'Business Loan' AS name
) s WHERE c.name = 'EMI & Loans';

-- Permissions (the app also adds these on start-up)
INSERT IGNORE INTO permissions (permission_key, module, action, description) VALUES
  ('expenses.view', 'Expenses', 'view', 'See office expenses, purchases, loans and EMI schedules'),
  ('expenses.manage', 'Expenses', 'manage', 'Add, edit and delete expenses and purchases; manage loans and record EMI payments'),
  ('adfunds.view', 'Ad Funds', 'view', 'See client ad-fund wallets, campaigns and statements'),
  ('adfunds.manage', 'Ad Funds', 'manage', 'Record client deposits, daily ad spend and refunds; manage campaigns');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.permission_key IN ('expenses.view', 'expenses.manage', 'adfunds.view', 'adfunds.manage')
WHERE r.slug IN ('owner', 'admin');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key IN ('adfunds.view', 'adfunds.manage')
WHERE r.slug = 'account-manager';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key IN ('expenses.view', 'adfunds.view')
WHERE r.slug = 'auditor';

-- Verification: tables 7, categories 10, subcategories 66, admin_grants 4, am_adfunds 2
SELECT
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME IN ('expense_categories','expense_subcategories','loans','expenses','loan_installments','ad_campaigns','ad_fund_transactions')) AS tables,
  (SELECT COUNT(*) FROM expense_categories) AS categories,
  (SELECT COUNT(*) FROM expense_subcategories) AS subcategories,
  (SELECT COUNT(*) FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
     WHERE r.slug = 'admin' AND p.permission_key IN ('expenses.view','expenses.manage','adfunds.view','adfunds.manage')) AS admin_grants,
  (SELECT COUNT(*) FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
     WHERE r.slug = 'account-manager' AND p.permission_key IN ('adfunds.view','adfunds.manage')) AS am_adfunds;
