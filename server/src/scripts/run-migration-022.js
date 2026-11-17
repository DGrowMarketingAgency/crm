import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_FILE = path.resolve(__dirname, '../../../database/migrations/022_gst_billing_core.sql');

// [table, column, definition]
const COLUMNS = [
  ['invoices', 'invoice_type', "ENUM('INV','INC','IND') NULL AFTER invoice_number"],
  ['invoices', 'place_of_supply', 'VARCHAR(60) NULL AFTER invoice_type'],
  ['invoices', 'place_state_code', 'CHAR(2) NULL AFTER place_of_supply'],
  ['invoices', 'supply_type', "ENUM('intra','inter') NULL AFTER place_state_code"],
  ['invoices', 'taxable_amount', 'DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER discount_amount'],
  ['invoices', 'cgst_amount', 'DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER tax_amount'],
  ['invoices', 'sgst_amount', 'DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER cgst_amount'],
  ['invoices', 'igst_amount', 'DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER sgst_amount'],
  ['invoices', 'round_off', 'DECIMAL(6,2) NOT NULL DEFAULT 0.00 AFTER igst_amount'],
  ['invoices', 'cancelled_at', 'DATETIME NULL'],
  ['invoices', 'cancelled_by', 'BIGINT UNSIGNED NULL'],
  ['invoices', 'cancel_reason', 'TEXT NULL'],
  ['invoice_items', 'service_master_id', 'BIGINT UNSIGNED NULL AFTER invoice_id'],
  ['invoice_items', 'details', 'TEXT NULL AFTER item_description'],
  ['invoice_items', 'sac_code', 'VARCHAR(20) NULL AFTER details'],
  ['invoice_items', 'discount_amount', 'DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER discount_percent'],
  ['invoice_items', 'taxable_amount', 'DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER discount_amount'],
  ['invoice_items', 'cgst_amount', 'DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER tax_rate'],
  ['invoice_items', 'sgst_amount', 'DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER cgst_amount'],
  ['invoice_items', 'igst_amount', 'DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER sgst_amount'],
  ['clients', 'state', 'VARCHAR(60) NULL AFTER city'],
  ['clients', 'state_code', 'CHAR(2) NULL AFTER state'],
  ['clients', 'pincode', 'VARCHAR(10) NULL AFTER state_code'],
  ['clients', 'pan', 'VARCHAR(10) NULL AFTER gstin'],
  ['clients', 'payment_terms_days', 'INT UNSIGNED NULL AFTER pan'],
  ['services', 'sac_code', 'VARCHAR(20) NULL AFTER category'],
  ['services', 'default_rate', 'DECIMAL(12,2) NULL AFTER sac_code'],
  ['services', 'gst_rate', 'DECIMAL(5,2) NOT NULL DEFAULT 18.00 AFTER default_rate'],
  ['services', 'billing_details', 'TEXT NULL AFTER gst_rate']
];

const FKS = [
  ['invoices', 'fk_invoices_cancelled_by', 'cancelled_by', 'users(id)'],
  ['invoice_items', 'fk_invoice_items_service_master', 'service_master_id', 'services(id)']
];

const exists = async (conn, sql, params) => Number((await conn.query(sql, params))[0][0].n) > 0;

export async function runMigration022() {
  const conn = await pool.getConnection();
  try {
    const sql = fs.readFileSync(SQL_FILE, 'utf8');
    for (const stmt of sql.split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean)) {
      await conn.query(stmt);
    }
    for (const [table, col, def] of COLUMNS) {
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
    for (const [table, name, col, ref] of FKS) {
      const has = await exists(
        conn,
        'SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?',
        [table, name]
      );
      if (!has) await conn.query(`ALTER TABLE ${table} ADD CONSTRAINT ${name} FOREIGN KEY (${col}) REFERENCES ${ref} ON DELETE SET NULL`);
    }
    // Cheque is a common payment mode for agency clients.
    const [[pm]] = await conn.query(
      "SELECT COLUMN_TYPE AS t FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'payment_method'"
    );
    if (pm && !pm.t.includes("'cheque'")) {
      await conn.query(
        "ALTER TABLE payments MODIFY payment_method ENUM('bank_transfer','upi','cash','card','cheque','payment_gateway','other') NOT NULL DEFAULT 'bank_transfer'"
      );
      console.log('+ payments.payment_method cheque');
    }
    console.log('Migration 022 applied.');
  } finally {
    conn.release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigration022()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('Migration 022 failed:', e);
      process.exit(1);
    });
}
