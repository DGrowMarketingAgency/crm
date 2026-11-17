import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';

// Enquiry desk: referral / marketing-person name on leads, call duration and
// negotiation rounds (with the revised budget) on follow-ups.
export const COLUMNS_025 = [
  ['leads', 'referrer_name', 'VARCHAR(255) NULL AFTER source'],
  ['lead_interactions', 'duration_minutes', 'SMALLINT UNSIGNED NULL AFTER outcome'],
  ['lead_interactions', 'negotiation_round', 'SMALLINT UNSIGNED NULL AFTER duration_minutes'],
  ['lead_interactions', 'amount', 'DECIMAL(12,2) NULL AFTER negotiation_round']
];

export async function runMigration025() {
  const conn = await pool.getConnection();
  try {
    for (const [table, col, def] of COLUMNS_025) {
      const [[{ n }]] = await conn.query(
        'SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [table, col]
      );
      if (!Number(n)) {
        await conn.query(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
        console.log(`+ ${table}.${col}`);
      }
    }
    console.log('Migration 025 applied.');
  } finally {
    conn.release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigration025()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('Migration 025 failed:', e);
      process.exit(1);
    });
}
