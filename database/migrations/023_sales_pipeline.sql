-- Migration 023: Sales pipeline (Phase 2 of the Finance & Sales plan)
-- Lead follow-up log, meetings with minutes, 3-tier proposals with public links.
-- Lead column additions are applied idempotently by server/src/scripts/run-migration-023.js.

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
