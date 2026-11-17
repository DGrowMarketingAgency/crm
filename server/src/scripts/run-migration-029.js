import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_FILE = path.resolve(__dirname, '../../../database/migrations/029_expenses_loans_adfunds.sql');

// Same categories as the old Miscellaneous screen. Ad spend lives in the client ad-fund wallets,
// and EMIs are posted from the loan schedule, so those are categories of their own kind.
export const DEFAULT_CATEGORIES = [
  ['Travel & Transport', 'expense', ['Petrol / Fuel', 'Rapido / Cab', 'Parking', 'Vehicle Maintenance', 'Vehicle Repair']],
  ['Food Expenses', 'expense', ['Breakfast', 'Lunch', 'Dinner', 'Tea / Coffee', 'Snacks', 'Drinking Water', 'Client Meeting Food', 'Team Food']],
  ['Office Expenses', 'expense', ['Stationery', 'Printing', 'Office Supplies', 'Cleaning', 'Drinking Water', 'Electricity', 'Internet', 'Mobile Recharge', 'Office Maintenance', 'Furniture', 'Equipment', 'Repairs']],
  ['Software & Technology', 'expense', ['Software Subscription', 'AI Tools', 'Domain', 'Hosting', 'Plugins', 'Cloud Storage', 'API Charges', 'Other Online Services', 'Storage Purchases', 'System Rent', 'Shooting Equipment Rent']],
  ['Employee', 'expense', ['Incentive', 'Reimbursement', 'Welfare']],
  ['Client-Related Expenses', 'expense', ['Client / Model Travel', 'Client Meeting', 'Client Food', 'Client Gift', 'Client Shoot Expense', 'Client Delivery / Courier']],
  ['General Business', 'expense', ['Auditor Bill', 'EB Bill', 'Office Rent', 'Bank Charges', 'Professional Fees']],
  ['Personal Expenses', 'expense', ['Personal Food', 'Personal Travel', 'Personal Shopping', 'Personal Bills', 'Personal Medical', 'Personal Transfer', 'Personal Withdrawal', 'Family Expense', 'Other Personal']],
  ['Refund', 'expense', ['Client Refund', 'Other Refund']],
  ['EMI & Loans', 'emi', ['Personal Loan', 'Equipment EMI', 'Vehicle EMI', 'Credit Card Bill', 'Business Loan']]
];

export async function runMigration029() {
  const conn = await pool.getConnection();
  try {
    const sql = fs.readFileSync(SQL_FILE, 'utf8');
    for (const stmt of sql.split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean)) {
      await conn.query(stmt);
    }
    let order = 0;
    for (const [name, kind, subs] of DEFAULT_CATEGORIES) {
      order += 10;
      await conn.query('INSERT IGNORE INTO expense_categories (name, kind, sort_order) VALUES (?, ?, ?)', [name, kind, order]);
      const [[cat]] = await conn.query('SELECT id FROM expense_categories WHERE name = ?', [name]);
      for (const s of subs) await conn.query('INSERT IGNORE INTO expense_subcategories (category_id, name) VALUES (?, ?)', [cat.id, s]);
    }
    console.log('Migration 029 applied.');
  } finally {
    conn.release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigration029()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('Migration 029 failed:', e);
      process.exit(1);
    });
}
