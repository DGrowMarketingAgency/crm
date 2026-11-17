-- =====================================================================================
-- D-GROW CRM - Production update: Sales Phase 2 (lead follow-ups, meetings, 3-tier proposals)
-- Date: 2026-11-14   |   Run AFTER production_update_2026-11-14_finance_phase1.sql
--
-- Adds: lead_interactions, proposals, proposal_tiers, sales_meetings tables; 4 new lead columns;
--       proposals.* permissions (marketers can create and share; owner/admin/account managers convert).
--
-- HOW TO RUN: phpMyAdmin -> select the CRM database -> Export a backup -> SQL tab -> paste -> Go.
-- SAFE TO RE-RUN: every step checks first; nothing is dropped or overwritten.
-- =====================================================================================

SET NAMES utf8mb4;

-- 1. Every touch on a lead: calls, negotiations, notes, quote follow-ups and stage changes
CREATE TABLE IF NOT EXISTS lead_interactions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lead_id BIGINT UNSIGNED NOT NULL,
  interaction_type ENUM('call', 'negotiation', 'note', 'quote_followup', 'meeting', 'stage_change', 'proposal') NOT NULL,
  title VARCHAR(255) NOT NULL,
  outcome TEXT NULL,
  stage_from VARCHAR(60) NULL,
  stage_to VARCHAR(60) NULL,
  next_followup_date DATE NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_li_lead (lead_id, created_at),
  INDEX idx_li_creator (created_by, created_at),
  CONSTRAINT fk_li_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_li_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. 3-tier proposals shared with the client by a secret link
CREATE TABLE IF NOT EXISTS proposals (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  proposal_code VARCHAR(30) NOT NULL UNIQUE,
  lead_id BIGINT UNSIGNED NULL,
  client_id BIGINT UNSIGNED NULL,
  title VARCHAR(255) NOT NULL,
  intro TEXT NULL,
  billing_cycle ENUM('monthly', 'quarterly', 'half_yearly', 'annual', 'one_time') NOT NULL DEFAULT 'monthly',
  gst_mode ENUM('gst', 'non_gst') NOT NULL DEFAULT 'gst',
  valid_until DATE NULL,
  status ENUM('draft', 'sent', 'viewed', 'accepted', 'rejected', 'converted') NOT NULL DEFAULT 'draft',
  public_token CHAR(32) NOT NULL UNIQUE,
  view_count INT UNSIGNED NOT NULL DEFAULT 0,
  first_viewed_at DATETIME NULL,
  last_viewed_at DATETIME NULL,
  accepted_tier_id BIGINT UNSIGNED NULL,
  decided_at DATETIME NULL,
  decided_by_name VARCHAR(255) NULL,
  decision_note TEXT NULL,
  converted_client_id BIGINT UNSIGNED NULL,
  converted_project_id BIGINT UNSIGNED NULL,
  converted_invoice_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_prop_lead (lead_id),
  INDEX idx_prop_client (client_id),
  INDEX idx_prop_status (status),
  CONSTRAINT fk_prop_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
  CONSTRAINT fk_prop_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  CONSTRAINT fk_prop_conv_client FOREIGN KEY (converted_client_id) REFERENCES clients(id) ON DELETE SET NULL,
  CONSTRAINT fk_prop_conv_project FOREIGN KEY (converted_project_id) REFERENCES projects(id) ON DELETE SET NULL,
  CONSTRAINT fk_prop_conv_invoice FOREIGN KEY (converted_invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
  CONSTRAINT fk_prop_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS proposal_tiers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  proposal_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  service_id BIGINT UNSIGNED NULL,
  inclusions TEXT NULL,
  is_recommended BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0,
  INDEX idx_pt_proposal (proposal_id, sort_order),
  CONSTRAINT fk_pt_proposal FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE,
  CONSTRAINT fk_pt_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Meetings with agenda, minutes and decisions (lead, client or proposal)
CREATE TABLE IF NOT EXISTS sales_meetings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lead_id BIGINT UNSIGNED NULL,
  client_id BIGINT UNSIGNED NULL,
  proposal_id BIGINT UNSIGNED NULL,
  title VARCHAR(255) NOT NULL,
  mode ENUM('online', 'offline') NOT NULL DEFAULT 'online',
  status ENUM('scheduled', 'completed', 'rescheduled', 'cancelled') NOT NULL DEFAULT 'scheduled',
  starts_at DATETIME NOT NULL,
  location VARCHAR(500) NULL,
  agenda TEXT NULL,
  minutes TEXT NULL,
  decisions TEXT NULL,
  owner_user_id BIGINT UNSIGNED NULL,
  completed_at DATETIME NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sm_starts (starts_at),
  INDEX idx_sm_lead (lead_id),
  INDEX idx_sm_client (client_id),
  INDEX idx_sm_owner (owner_user_id, starts_at),
  CONSTRAINT fk_sm_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_sm_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_sm_proposal FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE SET NULL,
  CONSTRAINT fk_sm_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_sm_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- New lead columns (added only when missing)
SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'services_interested');
SET @q = IF(@n = 0, 'ALTER TABLE leads ADD COLUMN services_interested VARCHAR(500) NULL AFTER source', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'lost_reason');
SET @q = IF(@n = 0, 'ALTER TABLE leads ADD COLUMN lost_reason VARCHAR(500) NULL AFTER notes', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'next_followup_date');
SET @q = IF(@n = 0, 'ALTER TABLE leads ADD COLUMN next_followup_date DATE NULL AFTER lost_reason', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'last_activity_at');
SET @q = IF(@n = 0, 'ALTER TABLE leads ADD COLUMN last_activity_at DATETIME NULL AFTER next_followup_date', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

-- Accepted package link (added after proposal_tiers exists)
SET @n = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proposals' AND CONSTRAINT_NAME = 'fk_prop_accepted_tier');
SET @q = IF(@n = 0, 'ALTER TABLE proposals ADD CONSTRAINT fk_prop_accepted_tier FOREIGN KEY (accepted_tier_id) REFERENCES proposal_tiers(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

-- Proposal permissions (the app also syncs these on start-up)
INSERT IGNORE INTO permissions (permission_key, module, action, description) VALUES
  ('proposals.view', 'Proposals', 'view', 'View 3-tier sales proposals for leads and clients the user can access'),
  ('proposals.create', 'Proposals', 'create', 'Create and edit 3-tier sales proposals'),
  ('proposals.send', 'Proposals', 'send', 'Share a proposal link with the client'),
  ('proposals.convert', 'Proposals', 'convert', 'Onboard the client and create the project and first invoice from an accepted proposal');
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key = 'proposals.view' WHERE r.slug IN ('owner', 'admin', 'account-manager', 'field-executive');
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key = 'proposals.create' WHERE r.slug IN ('owner', 'admin', 'account-manager', 'field-executive');
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key = 'proposals.send' WHERE r.slug IN ('owner', 'admin', 'account-manager', 'field-executive');
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key = 'proposals.convert' WHERE r.slug IN ('owner', 'admin', 'account-manager');

-- Verification: every value should be 1 (proposal_perms 4)
SELECT
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lead_interactions') AS lead_interactions_table,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proposals') AS proposals_table,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proposal_tiers') AS proposal_tiers_table,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_meetings') AS sales_meetings_table,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'next_followup_date') AS lead_followup_col,
  (SELECT COUNT(*) FROM permissions WHERE permission_key LIKE 'proposals.%') AS proposal_perms;
