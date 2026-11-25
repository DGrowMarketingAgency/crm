import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_FILE = path.resolve(__dirname, '../../../database/migrations/034_client_content_plans.sql');

export async function runMigration034() {
  const sql = fs.readFileSync(SQL_FILE, 'utf8');
  for (const stmt of sql.split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean)) {
    await pool.query(stmt);
  }
  console.log('Migration 034 applied.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigration034()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('Migration 034 failed:', e);
      process.exit(1);
    });
}
