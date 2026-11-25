import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_FILE = path.resolve(__dirname, '../../../database/migrations/031_client_month_plans.sql');

async function exists(conn, sql, params) {
  const [[row]] = await conn.query(sql, params);
  return Number(row.n) > 0;
}

export async function runMigration031() {
  const conn = await pool.getConnection();
  try {
    const sql = fs.readFileSync(SQL_FILE, 'utf8');
    for (const stmt of sql.split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean)) {
      await conn.query(stmt);
    }
    const colSql = 'SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?';
    const fkSql = 'SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?';
    if (!(await exists(conn, colSql, ['projects', 'month_plan_id']))) {
      await conn.query('ALTER TABLE projects ADD COLUMN month_plan_id BIGINT UNSIGNED NULL AFTER cycle_month');
      console.log('+ projects.month_plan_id');
    }
    if (!(await exists(conn, fkSql, ['projects', 'fk_projects_month_plan']))) {
      await conn.query(
        'ALTER TABLE projects ADD CONSTRAINT fk_projects_month_plan FOREIGN KEY (month_plan_id) REFERENCES client_month_plans(id) ON DELETE SET NULL'
      );
    }
    console.log('Migration 031 applied.');
  } finally {
    conn.release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigration031()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('Migration 031 failed:', e);
      process.exit(1);
    });
}
