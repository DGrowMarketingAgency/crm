import { pool } from '../config/db.js';

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows[0].count) > 0;
}

export async function runMigration010() {
  console.log('Starting Migration 010: Multi-Designations Support...');

  if (!(await columnExists('users', 'designations'))) {
    console.log('Adding users.designations JSON column...');
    await pool.query(`ALTER TABLE users ADD COLUMN designations JSON NULL AFTER role`);
  } else {
    console.log('users.designations already exists.');
  }

  console.log('Ensuring user_designations table exists...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_designations (
      user_id BIGINT UNSIGNED NOT NULL,
      designation VARCHAR(150) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, designation),
      INDEX idx_user_designations_user (user_id),
      INDEX idx_user_designations_name (designation),
      CONSTRAINT fk_user_designations_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  console.log('Migration 010 applied successfully.');
}

if (process.argv[1]?.endsWith('run-migration-010.js')) {
  runMigration010()
    .then(() => {
      console.log('Done.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration 010 failed:', err);
      process.exit(1);
    });
}
