-- 037: Shoot-booking Phase 3.
--  • Date proposals: the team offers the client 2–3 shoot date/time options (picked where videographers are free);
--    the client picks one in the portal and the shoot slot is posted automatically.
--  • Reminder log so each reminder (shoot tomorrow / in 2 hours / still unfilled / availability due) goes out once.
--  • Attendance on bookings (attended / no-show) is added by the runner (run-migration-037.js).

CREATE TABLE IF NOT EXISTS shoot_proposals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  shoot_type VARCHAR(50) NOT NULL DEFAULT 'Reels',
  area VARCHAR(150) NOT NULL,
  address VARCHAR(500) NULL,
  map_url VARCHAR(500) NULL,
  brief TEXT NULL,
  pay_amount DECIMAL(10,2) NULL,
  people_needed TINYINT UNSIGNED NOT NULL DEFAULT 1,
  message_to_client VARCHAR(1000) NULL,
  status ENUM('pending', 'accepted', 'declined', 'withdrawn') NOT NULL DEFAULT 'pending',
  chosen_option_id BIGINT UNSIGNED NULL,
  slot_id BIGINT UNSIGNED NULL,
  client_note VARCHAR(1000) NULL,
  responded_by BIGINT UNSIGNED NULL,
  responded_at DATETIME NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sp_client_status (client_id, status),
  CONSTRAINT fk_sp_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shoot_proposal_options (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  proposal_id BIGINT UNSIGNED NOT NULL,
  shoot_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  INDEX idx_spo_proposal (proposal_id),
  CONSTRAINT fk_spo_proposal FOREIGN KEY (proposal_id) REFERENCES shoot_proposals(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shoot_reminder_log (
  kind VARCHAR(40) NOT NULL,
  ref_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  period_key VARCHAR(20) NOT NULL DEFAULT '',
  sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (kind, ref_id, user_id, period_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
