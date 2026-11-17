-- Migration 030: how each client's ad wallet works.
--   prepaid  = the client sends money first, the agency spends from it
--   postpaid = the agency pays the ad platform first and the client pays the agency back later
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
