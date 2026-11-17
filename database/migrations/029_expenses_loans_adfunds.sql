-- Migration 029: Office expenses & purchases, EMI / loan schedules, client ad-fund wallets.
-- Every table is created only if missing; the category seed only adds what is missing.

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
