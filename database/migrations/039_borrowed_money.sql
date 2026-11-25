-- 039: Borrowed money — cash the agency borrowed from a person (friend, family, partner…) and pays back
-- whenever it can, in any amounts. Separate from EMI & Loans, which are fixed monthly schedules.

CREATE TABLE IF NOT EXISTS borrowings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  lender_name VARCHAR(150) NOT NULL,
  lender_phone VARCHAR(20) NULL,
  amount DECIMAL(12,2) NOT NULL,
  borrowed_on DATE NOT NULL,
  received_mode VARCHAR(60) NULL,
  purpose VARCHAR(255) NULL,
  return_by DATE NULL,
  status ENUM('open', 'settled') NOT NULL DEFAULT 'open',
  settled_on DATE NULL,
  notes TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_borrowings_status (status),
  INDEX idx_borrowings_lender (lender_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS borrowing_repayments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  borrowing_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  paid_on DATE NOT NULL,
  payment_mode VARCHAR(60) NULL,
  reference VARCHAR(100) NULL,
  notes VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_br_borrowing (borrowing_id),
  CONSTRAINT fk_br_borrowing FOREIGN KEY (borrowing_id) REFERENCES borrowings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
