-- Migration 034: Per-client content calendar settings (Master Plan §8 Social Media Management)
-- How many Reels / Posts a client gets each month, on which weekdays (default Reels Sat/Sun/Wed, Posts Mon/Tue/Thu,
-- adjustable to the client's shoot days), on which platform, and the content pillars/themes approved with them.
-- The "Build month calendar" action reads these as defaults and saves what was used.
CREATE TABLE IF NOT EXISTS client_content_plans (
  client_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  reels_per_month SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  posts_per_month SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  reel_days VARCHAR(20) NOT NULL DEFAULT '6,0,3',
  post_days VARCHAR(20) NOT NULL DEFAULT '1,2,4',
  platform VARCHAR(64) NULL,
  pillars JSON NULL,
  default_assignee_id BIGINT UNSIGNED NULL,
  client_visible BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by BIGINT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ccp_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_ccp_assignee FOREIGN KEY (default_assignee_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_ccp_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
