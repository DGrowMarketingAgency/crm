-- =====================================================================================
-- D-GROW CRM - Production update: Edit / delete / cancel for proposals, quotations, invoices
-- Date: 2026-11-16   |   Run AFTER production_update_2026-11-16_quotations.sql
--
-- Adds: proposal status 'withdrawn'; quotation status 'cancelled' (and the matching history
--       entry type); payment status 'reversed' with reversed_at / reversed_by / reversal_reason,
--       so a wrong or bounced payment is reversed on record instead of deleted.
--
-- HOW TO RUN: phpMyAdmin -> select the CRM database -> Export a backup -> SQL tab -> paste -> Go.
-- SAFE TO RE-RUN: each change checks first; existing values are kept.
-- =====================================================================================

SET NAMES utf8mb4;

-- Proposal can be withdrawn
SET @t = (SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proposals' AND COLUMN_NAME = 'status');
SET @q = IF(@t NOT LIKE "%'withdrawn'%",
  "ALTER TABLE proposals MODIFY COLUMN status ENUM('draft','sent','viewed','accepted','rejected','converted','withdrawn') NOT NULL DEFAULT 'draft'",
  'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

-- Quotation can be cancelled
SET @t = (SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_quotations' AND COLUMN_NAME = 'status');
SET @q = IF(@t NOT LIKE "%'cancelled'%",
  "ALTER TABLE sales_quotations MODIFY COLUMN status ENUM('requested','draft','sent','viewed','negotiating','approved','rejected','converted','expired','cancelled') NOT NULL DEFAULT 'requested'",
  'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @t = (SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_quotation_rounds' AND COLUMN_NAME = 'kind');
SET @q = IF(@t NOT LIKE "%'cancelled'%",
  "ALTER TABLE sales_quotation_rounds MODIFY COLUMN kind ENUM('requested','priced','client_request','revision','accepted','rejected','cancelled') NOT NULL",
  'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

-- Payment can be reversed (kept on record)
SET @t = (SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'payment_status');
SET @q = IF(@t NOT LIKE "%'reversed'%",
  "ALTER TABLE payments MODIFY COLUMN payment_status ENUM('pending','completed','failed','refunded','reversed') NOT NULL DEFAULT 'completed'",
  'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'reversed_at');
SET @q = IF(@n = 0, 'ALTER TABLE payments ADD COLUMN reversed_at DATETIME NULL', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'reversed_by');
SET @q = IF(@n = 0, 'ALTER TABLE payments ADD COLUMN reversed_by BIGINT UNSIGNED NULL', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'reversal_reason');
SET @q = IF(@n = 0, 'ALTER TABLE payments ADD COLUMN reversal_reason VARCHAR(255) NULL', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

-- Verification: every value should be 1
SELECT
  (SELECT COLUMN_TYPE LIKE "%'withdrawn'%" FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proposals' AND COLUMN_NAME = 'status') AS proposal_withdrawn,
  (SELECT COLUMN_TYPE LIKE "%'cancelled'%" FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_quotations' AND COLUMN_NAME = 'status') AS quote_cancelled,
  (SELECT COLUMN_TYPE LIKE "%'reversed'%" FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'payment_status') AS payment_reversed,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'reversal_reason') AS reversal_reason_col;
