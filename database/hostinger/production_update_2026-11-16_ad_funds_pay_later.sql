-- =====================================================================================
-- D-GROW CRM - Production update: Ad funds "Pay later" (agency spends first, client pays later)
-- Date: 2026-11-16   |   Run AFTER production_update_2026-11-16_expenses_loans_adfunds.sql
--
-- Adds: ad_wallet_settings - per client: Prepaid or Pay later, payment terms (days) and an optional
--       credit limit. The app works out what each client owes, since when, the due date and overdue
--       days, and sends daily collection reminders - nothing to schedule on the server.
--
-- HOW TO RUN: phpMyAdmin -> select the CRM database -> Export a backup -> SQL tab -> paste -> Go.
-- SAFE TO RE-RUN: the table is created only if missing; nothing is dropped or overwritten.
-- =====================================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS ad_wallet_settings (
  client_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  billing_mode ENUM('prepaid','postpaid') NOT NULL DEFAULT 'prepaid',
  credit_limit DECIMAL(12,2) NULL,
  payment_terms_days SMALLINT UNSIGNED NOT NULL DEFAULT 7,
  notes VARCHAR(500) NULL,
  updated_by BIGINT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_aws_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_aws_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Verification: settings_table 1
SELECT (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ad_wallet_settings') AS settings_table;
