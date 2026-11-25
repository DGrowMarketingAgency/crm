import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';

/**
 * 038 — Shoot booking Phase 4.
 *  • shoot_slots.project_id: the client's Video project this shoot feeds (footage completes its "Shoot" stage).
 *  • shoot_bookings.footage_*: the footage link the videographer hands in after the shoot.
 *  • shoot_bookings.expense_id: the freelancer's payout, recorded as a Client Shoot Expense (pending → paid).
 */
const COLUMNS = [
  ['shoot_slots', 'project_id', 'BIGINT UNSIGNED NULL AFTER client_id'],
  ['shoot_bookings', 'footage_url', 'VARCHAR(1000) NULL AFTER attendance_at'],
  ['shoot_bookings', 'footage_notes', 'VARCHAR(1000) NULL AFTER footage_url'],
  ['shoot_bookings', 'footage_at', 'DATETIME NULL AFTER footage_notes'],
  ['shoot_bookings', 'expense_id', 'BIGINT UNSIGNED NULL AFTER footage_at']
];

export async function runMigration038() {
  const colSql = 'SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?';
  for (const [table, col, def] of COLUMNS) {
    const [[row]] = await pool.query(colSql, [table, col]);
    if (!Number(row.n)) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
      console.log(`+ ${table}.${col}`);
    }
  }
  const idxSql = 'SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?';
  const [[ix]] = await pool.query(idxSql, ['shoot_slots', 'idx_ss_project']);
  if (!Number(ix.n)) await pool.query('ALTER TABLE shoot_slots ADD INDEX idx_ss_project (project_id)');
  console.log('Migration 038 applied.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigration038()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('Migration 038 failed:', e);
      process.exit(1);
    });
}
