import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_FILE = path.resolve(__dirname, '../../../database/migrations/032_month_plan_billing_and_backfill.sql');

const PLAN_COLUMNS = [
  ['invoice_type', "ENUM('INV','INC','IND') NULL AFTER billing_amount"],
  ['auto_invoice', 'BOOLEAN NOT NULL DEFAULT FALSE AFTER invoice_type'],
  ['invoice_id', 'BIGINT UNSIGNED NULL AFTER auto_invoice'],
  ['auto_drafted', 'BOOLEAN NOT NULL DEFAULT FALSE AFTER copied_from_plan_id']
];

async function count(conn, sql, params) {
  const [[row]] = await conn.query(sql, params);
  return Number(row.n);
}

export async function runMigration032() {
  const conn = await pool.getConnection();
  try {
    const colSql = 'SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?';
    for (const [col, def] of PLAN_COLUMNS) {
      if (!(await count(conn, colSql, ['client_month_plans', col]))) {
        await conn.query(`ALTER TABLE client_month_plans ADD COLUMN ${col} ${def}`);
        console.log(`+ client_month_plans.${col}`);
      }
    }
    const fkSql = 'SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?';
    if (!(await count(conn, fkSql, ['client_month_plans', 'fk_cmp_invoice']))) {
      await conn.query('ALTER TABLE client_month_plans ADD CONSTRAINT fk_cmp_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL');
    }
    const sql = fs.readFileSync(SQL_FILE, 'utf8');
    for (const stmt of sql.split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean)) {
      const [res] = await conn.query(stmt);
      if (res.affectedRows) console.log(`  backfill: ${res.affectedRows} row(s)`);
    }
    console.log('Migration 032 applied.');
  } finally {
    conn.release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigration032()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('Migration 032 failed:', e);
      process.exit(1);
    });
}
