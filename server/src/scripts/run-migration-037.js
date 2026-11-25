import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_FILE = path.resolve(__dirname, '../../../database/migrations/037_shoot_proposals_reminders.sql');

/** Attendance on shoot bookings (managers mark it after the shoot). */
const BOOKING_COLUMNS = [
  ['attendance', "ENUM('attended', 'no_show') NULL AFTER end_reason"],
  ['attendance_by', 'BIGINT UNSIGNED NULL AFTER attendance'],
  ['attendance_at', 'DATETIME NULL AFTER attendance_by']
];

export async function runMigration037() {
  const sql = fs.readFileSync(SQL_FILE, 'utf8');
  for (const stmt of sql.split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean)) {
    await pool.query(stmt);
  }
  const colSql = 'SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?';
  for (const [col, def] of BOOKING_COLUMNS) {
    const [[row]] = await pool.query(colSql, ['shoot_bookings', col]);
    if (!Number(row.n)) {
      await pool.query(`ALTER TABLE shoot_bookings ADD COLUMN ${col} ${def}`);
      console.log(`+ shoot_bookings.${col}`);
    }
  }
  console.log('Migration 037 applied.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigration037()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('Migration 037 failed:', e);
      process.exit(1);
    });
}
