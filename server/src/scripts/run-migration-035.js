import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_FILE = path.resolve(__dirname, '../../../database/migrations/035_videographer_availability.sql');

export async function runMigration035() {
  const sql = fs.readFileSync(SQL_FILE, 'utf8');
  for (const stmt of sql.split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean)) {
    await pool.query(stmt);
  }
  console.log('Migration 035 applied.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigration035()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('Migration 035 failed:', e);
      process.exit(1);
    });
}
