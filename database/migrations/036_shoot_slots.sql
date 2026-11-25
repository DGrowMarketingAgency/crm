-- 036: Shoot slots and first-come booking (shoot-booking plan, Phase 2).
-- Admin posts a client's approved shoot date/time as a slot; videographers accept it. The first to accept gets it
-- (row lock on the slot inside a transaction), and nobody can hold two shoots that overlap.

CREATE TABLE IF NOT EXISTS shoot_slots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_id BIGINT UNSIGNED NOT NULL,
  project_id BIGINT UNSIGNED NULL,
  title VARCHAR(255) NOT NULL,
  shoot_type VARCHAR(50) NOT NULL DEFAULT 'Reels',
  shoot_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  area VARCHAR(150) NOT NULL,            -- shown before booking (privacy)
  address VARCHAR(500) NULL,             -- shown only to the booked videographer and managers
  map_url VARCHAR(500) NULL,
  brief TEXT NULL,
  pay_amount DECIMAL(10,2) NULL,
  people_needed TINYINT UNSIGNED NOT NULL DEFAULT 1,
  status ENUM('open', 'booked', 'cancelled', 'completed') NOT NULL DEFAULT 'open',
  cancel_reason VARCHAR(255) NULL,
  calendar_event_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ss_date (shoot_date),
  INDEX idx_ss_status_date (status, shoot_date),
  CONSTRAINT fk_ss_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shoot_bookings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slot_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  status ENUM('booked', 'withdrawn', 'removed') NOT NULL DEFAULT 'booked',
  assigned_by BIGINT UNSIGNED NULL,      -- set when a manager assigned it instead of the videographer accepting
  booked_at DATETIME NOT NULL,
  ended_at DATETIME NULL,
  end_reason VARCHAR(255) NULL,
  attendance ENUM('attended', 'no_show') NULL,
  attendance_by BIGINT UNSIGNED NULL,
  attendance_at DATETIME NULL,
  footage_url VARCHAR(1000) NULL,
  footage_notes VARCHAR(1000) NULL,
  footage_at DATETIME NULL,
  expense_id BIGINT UNSIGNED NULL,
  INDEX idx_sb_slot (slot_id, status),
  INDEX idx_sb_user (user_id, status),
  CONSTRAINT fk_sb_slot FOREIGN KEY (slot_id) REFERENCES shoot_slots(id) ON DELETE CASCADE,
  CONSTRAINT fk_sb_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
