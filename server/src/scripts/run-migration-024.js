import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_FILE = path.resolve(__dirname, '../../../database/migrations/024_finance_control.sql');

// Monthly retainers reuse projects.billing_amount as their monthly fee.
export const COLUMNS_024 = [
  ['projects', 'retainer_auto_invoice', 'BOOLEAN NOT NULL DEFAULT FALSE AFTER billing_status'],
  ['projects', 'retainer_invoice_type', "ENUM('INV','INC','IND') NULL AFTER retainer_auto_invoice"]
];

export async function runMigration024() {
  const conn = await pool.getConnection();
  try {
    const sql = fs.readFileSync(SQL_FILE, 'utf8');
    for (const stmt of sql.split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean)) {
      await conn.query(stmt);
    }
    for (const [table, col, def] of COLUMNS_024) {
      const [[{ n }]] = await conn.query(
        'SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [table, col]
      );
      if (!Number(n)) {
        await conn.query(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
        console.log(`+ ${table}.${col}`);
      }
    }
    console.log('Migration 024 applied.');
  } finally {
    conn.release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigration024()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('Migration 024 failed:', e);
      process.exit(1);
    });
}
