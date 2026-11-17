import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';

// Document lifecycle: proposals can be withdrawn, quotations cancelled, and payments reversed
// (kept on record with who/when/why rather than deleted).
const ENUMS = [
  ['proposals', 'status', "ENUM('draft','sent','viewed','accepted','rejected','converted','withdrawn') NOT NULL DEFAULT 'draft'", 'withdrawn'],
  ['sales_quotations', 'status', "ENUM('requested','draft','sent','viewed','negotiating','approved','rejected','converted','expired','cancelled') NOT NULL DEFAULT 'requested'", 'cancelled'],
  ['payments', 'payment_status', "ENUM('pending','completed','failed','refunded','reversed') NOT NULL DEFAULT 'completed'", 'reversed'],
  ['sales_quotation_rounds', 'kind', "ENUM('requested','priced','client_request','revision','accepted','rejected','cancelled') NOT NULL", 'cancelled']
];
const COLUMNS = [
  ['payments', 'reversed_at', 'DATETIME NULL'],
  ['payments', 'reversed_by', 'BIGINT UNSIGNED NULL'],
  ['payments', 'reversal_reason', 'VARCHAR(255) NULL']
];

export async function runMigration028() {
  const conn = await pool.getConnection();
  try {
    for (const [table, col, def, needed] of ENUMS) {
      const [[c]] = await conn.query(
        'SELECT COLUMN_TYPE AS t, COLUMN_DEFAULT AS d FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [table, col]
      );
      if (c && !String(c.t).includes(`'${needed}'`)) {
        // Keep the column's current default (payments default may differ).
        const fixed = c.d ? def.replace(/DEFAULT '[^']*'/, `DEFAULT '${c.d}'`) : def;
        await conn.query(`ALTER TABLE ${table} MODIFY COLUMN ${col} ${fixed}`);
        console.log(`~ ${table}.${col} += ${needed}`);
      }
    }
    for (const [table, col, def] of COLUMNS) {
      const [[{ n }]] = await conn.query(
        'SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [table, col]
      );
      if (!Number(n)) {
        await conn.query(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
        console.log(`+ ${table}.${col}`);
      }
    }
    console.log('Migration 028 applied.');
  } finally {
    conn.release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigration028()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('Migration 028 failed:', e);
      process.exit(1);
    });
}
