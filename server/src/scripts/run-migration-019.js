import { pool } from '../config/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  const connection = await pool.getConnection();
  try {
    console.log('🚀 Running Migration 019: Client Password Manager Schema...');
    const migrationPath = path.resolve(__dirname, '../../../database/migrations/019_client_password_manager.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Remove single line comments
    const cleanedSql = sql.replace(/--.*$/gm, '');

    const statements = cleanedSql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      if (statement.trim()) {
        await connection.query(statement);
      }
    }

    console.log('✅ Migration 019 completed successfully!');
  } catch (error) {
    console.error('❌ Migration 019 failed:', error);
    process.exit(1);
  } finally {
    connection.release();
    process.exit(0);
  }
}

runMigration();
