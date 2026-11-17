import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_FILE = path.resolve(__dirname, '../../../database/migrations/023_sales_pipeline.sql');

// [table, column, definition]
export const COLUMNS_023 = [
  ['leads', 'services_interested', 'VARCHAR(500) NULL AFTER source'],
  ['leads', 'lost_reason', 'VARCHAR(500) NULL AFTER notes'],
  ['leads', 'next_followup_date', 'DATE NULL AFTER lost_reason'],
  ['leads', 'last_activity_at', 'DATETIME NULL AFTER next_followup_date']
];

const exists = async (conn, sql, params) => Number((await conn.query(sql, params))[0][0].n) > 0;

export async function runMigration023() {
  const conn = await pool.getConnection();
  try {
    const sql = fs.readFileSync(SQL_FILE, 'utf8');
    for (const stmt of sql.split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean)) {
      await conn.query(stmt);
    }
    for (const [table, col, def] of COLUMNS_023) {
      const has = await exists(
        conn,
        'SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [table, col]
      );
      if (!has) {
        await conn.query(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
        console.log(`+ ${table}.${col}`);
      }
    }
    const hasFk = await exists(
      conn,
      "SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proposals' AND CONSTRAINT_NAME = 'fk_prop_accepted_tier'",
      []
    );
    if (!hasFk) {
      await conn.query('ALTER TABLE proposals ADD CONSTRAINT fk_prop_accepted_tier FOREIGN KEY (accepted_tier_id) REFERENCES proposal_tiers(id) ON DELETE SET NULL');
    }
    console.log('Migration 023 applied.');
  } finally {
    conn.release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigration023()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('Migration 023 failed:', e);
      process.exit(1);
    });
}
