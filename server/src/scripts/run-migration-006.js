import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  try {
    const migrationPath = path.resolve(__dirname, '../../../database/migrations/006_approvals_notifications_schema.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Strip single line comments
    const cleanedSql = sql
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');

    const statements = cleanedSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    console.log(`Running ${statements.length} migration statements from 006...`);
    for (const stmt of statements) {
      await pool.query(stmt);
    }
    console.log('Migration 006 applied successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

run();
