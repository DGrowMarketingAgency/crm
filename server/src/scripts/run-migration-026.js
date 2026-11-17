import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';

// Phase A (marketing desk): the REP who brought an enquiry in, and a log so meeting and
// follow-up reminders are sent once.
export async function runMigration026() {
  const conn = await pool.getConnection();
  try {
    const [[{ n }]] = await conn.query(
      "SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'rep_user_id'"
    );
    if (!Number(n)) {
      await conn.query('ALTER TABLE leads ADD COLUMN rep_user_id BIGINT UNSIGNED NULL AFTER owner_user_id');
      await conn.query('ALTER TABLE leads ADD INDEX idx_leads_rep (rep_user_id)');
      await conn.query('ALTER TABLE leads ADD CONSTRAINT fk_leads_rep FOREIGN KEY (rep_user_id) REFERENCES users(id) ON DELETE SET NULL');
      // Existing enquiries added by a field executive were brought in by them.
      await conn.query(
        `UPDATE leads l SET l.rep_user_id = l.created_by
         WHERE l.rep_user_id IS NULL AND l.created_by IS NOT NULL
           AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = l.created_by AND r.slug = 'field-executive')`
      );
      console.log('+ leads.rep_user_id');
    }
    await conn.query(
      `CREATE TABLE IF NOT EXISTS sales_reminder_log (
         id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
         kind VARCHAR(30) NOT NULL,
         ref_id BIGINT UNSIGNED NOT NULL,
         user_id BIGINT UNSIGNED NOT NULL,
         period_key VARCHAR(20) NOT NULL,
         sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
         UNIQUE KEY uq_srl (kind, ref_id, user_id, period_key),
         INDEX idx_srl_sent (sent_at)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );
    console.log('Migration 026 applied.');
  } finally {
    conn.release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigration026()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('Migration 026 failed:', e);
      process.exit(1);
    });
}
