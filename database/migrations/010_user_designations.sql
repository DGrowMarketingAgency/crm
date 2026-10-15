-- Migration 010: Multiple Designations Support for Agency Team
-- Supports multi-designation capabilities for employees (e.g., Sarun, Jaleesh, Subu)

-- 1. Add designations JSON column to users table if not exists
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'designations'
);

SET @stmt = IF(@col_exists = 0, 'ALTER TABLE users ADD COLUMN designations JSON NULL AFTER role', 'SELECT 1');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- 2. Create normalized user_designations table
CREATE TABLE IF NOT EXISTS user_designations (
  user_id BIGINT UNSIGNED NOT NULL,
  designation VARCHAR(150) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, designation),
  INDEX idx_user_designations_user (user_id),
  INDEX idx_user_designations_name (designation),
  CONSTRAINT fk_user_designations_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
