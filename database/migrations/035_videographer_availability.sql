-- 035: Videographers (in-house + freelance) and their monthly availability calendar.
-- Phase 1 of the shoot-booking plan: freelancers get their own login (role `freelance-videographer`),
-- mark the dates/times they are free, and managers see who is free before fixing a client's shoot day.

CREATE TABLE IF NOT EXISTS videographer_profiles (
  user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  kind ENUM('in_house', 'freelance') NOT NULL DEFAULT 'freelance',
  rate_amount DECIMAL(10,2) NULL,
  rate_unit ENUM('shoot', 'hour', 'day') NOT NULL DEFAULT 'shoot',
  kit VARCHAR(500) NULL,
  areas VARCHAR(500) NULL,
  notes VARCHAR(1000) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_vp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per free time range on a date (a day can have several, e.g. morning + evening).
CREATE TABLE IF NOT EXISTS videographer_availability (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  avail_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  full_day BOOLEAN NOT NULL DEFAULT FALSE,
  note VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_va_date (avail_date),
  INDEX idx_va_user_date (user_id, avail_date),
  CONSTRAINT fk_va_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- "I've finished filling this month" — lets managers see who still owes their availability.
CREATE TABLE IF NOT EXISTS videographer_month_status (
  user_id BIGINT UNSIGNED NOT NULL,
  month CHAR(7) NOT NULL,
  submitted_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, month),
  CONSTRAINT fk_vms_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
