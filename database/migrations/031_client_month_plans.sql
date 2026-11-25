-- Migration 031: Client month plans
-- Flow: Client -> Month plan (e.g. 2026-12) -> many projects inside that month, one per service line
--       (Social media video, Graphic design, SEO, ...), each with its own pipeline, people and quota.
-- projects.month_plan_id is added idempotently by server/src/scripts/run-migration-031.js.

CREATE TABLE IF NOT EXISTS client_month_plans (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id BIGINT UNSIGNED NOT NULL,
  plan_month CHAR(7) NOT NULL,
  status ENUM('draft', 'active', 'closed') NOT NULL DEFAULT 'active',
  notes TEXT NULL,
  billing_amount DECIMAL(12,2) NULL,
  copied_from_plan_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NULL,
  closed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cmp_client_month (client_id, plan_month),
  INDEX idx_cmp_month (plan_month, status),
  CONSTRAINT fk_cmp_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_cmp_copied_from FOREIGN KEY (copied_from_plan_id) REFERENCES client_month_plans(id) ON DELETE SET NULL,
  CONSTRAINT fk_cmp_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
