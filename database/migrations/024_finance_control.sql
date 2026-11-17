-- Migration 024: Finance control (Phase 3)
-- Billing reminder log (each alert is sent once per invoice / retainer and period).
-- Retainer billing columns on projects are applied idempotently by server/src/scripts/run-migration-024.js.

CREATE TABLE IF NOT EXISTS billing_reminder_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kind ENUM('due_soon', 'due_today', 'overdue', 'renewal') NOT NULL,
  ref_type ENUM('invoice', 'project') NOT NULL,
  ref_id BIGINT UNSIGNED NOT NULL,
  period_key VARCHAR(20) NOT NULL,
  recipients INT UNSIGNED NOT NULL DEFAULT 0,
  sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_brl (kind, ref_type, ref_id, period_key),
  INDEX idx_brl_sent (sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
