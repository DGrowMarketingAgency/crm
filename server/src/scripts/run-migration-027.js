import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';

// Phase B: quotations. A marketing person requests one (services, no prices); the admin prices it and
// sends it; the client accepts, declines or asks to negotiate through a link; every step is a round.
export async function runMigration027() {
  const conn = await pool.getConnection();
  try {
    const [[{ existed }]] = await conn.query(
      "SELECT COUNT(*) AS existed FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_quotations'"
    );
    await conn.query(
      `CREATE TABLE IF NOT EXISTS sales_quotations (
         id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
         quote_number VARCHAR(30) NOT NULL UNIQUE,
         lead_id BIGINT UNSIGNED NULL,
         client_id BIGINT UNSIGNED NULL,
         proposal_id BIGINT UNSIGNED NULL,
         title VARCHAR(255) NOT NULL,
         status ENUM('requested','draft','sent','viewed','negotiating','approved','rejected','converted','expired') NOT NULL DEFAULT 'requested',
         gst_mode ENUM('gst','non_gst') NOT NULL DEFAULT 'gst',
         quote_date DATE NOT NULL,
         valid_until DATE NULL,
         requirements TEXT NULL,
         terms TEXT NULL,
         subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
         discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
         taxable_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
         tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
         round_off DECIMAL(6,2) NOT NULL DEFAULT 0,
         total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
         public_token CHAR(32) NOT NULL UNIQUE,
         view_count INT UNSIGNED NOT NULL DEFAULT 0,
         last_viewed_at DATETIME NULL,
         requested_by BIGINT UNSIGNED NULL,
         priced_by BIGINT UNSIGNED NULL,
         priced_at DATETIME NULL,
         sent_at DATETIME NULL,
         decided_at DATETIME NULL,
         decided_by_name VARCHAR(255) NULL,
         decision_note TEXT NULL,
         converted_invoice_id BIGINT UNSIGNED NULL,
         created_by BIGINT UNSIGNED NULL,
         created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         INDEX idx_sq_lead (lead_id), INDEX idx_sq_client (client_id), INDEX idx_sq_status (status),
         CONSTRAINT fk_sq_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
         CONSTRAINT fk_sq_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
         CONSTRAINT fk_sq_proposal FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE SET NULL,
         CONSTRAINT fk_sq_invoice FOREIGN KEY (converted_invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
         CONSTRAINT fk_sq_requested FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL,
         CONSTRAINT fk_sq_priced FOREIGN KEY (priced_by) REFERENCES users(id) ON DELETE SET NULL,
         CONSTRAINT fk_sq_created FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );
    await conn.query(
      `CREATE TABLE IF NOT EXISTS sales_quotation_items (
         id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
         quotation_id BIGINT UNSIGNED NOT NULL,
         service_id BIGINT UNSIGNED NULL,
         description VARCHAR(255) NOT NULL,
         details TEXT NULL,
         sac_code VARCHAR(10) NULL,
         quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
         unit_price DECIMAL(12,2) NULL,
         gst_rate DECIMAL(5,2) NOT NULL DEFAULT 18,
         sort_order INT NOT NULL DEFAULT 0,
         INDEX idx_sqi_quote (quotation_id, sort_order),
         CONSTRAINT fk_sqi_quote FOREIGN KEY (quotation_id) REFERENCES sales_quotations(id) ON DELETE CASCADE,
         CONSTRAINT fk_sqi_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );
    await conn.query(
      `CREATE TABLE IF NOT EXISTS sales_quotation_rounds (
         id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
         quotation_id BIGINT UNSIGNED NOT NULL,
         round_no SMALLINT UNSIGNED NOT NULL DEFAULT 0,
         kind ENUM('requested','priced','client_request','revision','accepted','rejected') NOT NULL,
         discount_amount DECIMAL(12,2) NULL,
         total_amount DECIMAL(12,2) NULL,
         client_amount DECIMAL(12,2) NULL,
         note TEXT NULL,
         by_name VARCHAR(255) NULL,
         created_by BIGINT UNSIGNED NULL,
         created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
         INDEX idx_sqr_quote (quotation_id, created_at),
         CONSTRAINT fk_sqr_quote FOREIGN KEY (quotation_id) REFERENCES sales_quotations(id) ON DELETE CASCADE,
         CONSTRAINT fk_sqr_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );
    // Quotation number series, editable in Finance Settings like the invoice series.
    await conn.query(
      `INSERT IGNORE INTO invoice_number_series (code, label, prefix, next_number, padding, fy_reset, is_tax)
       VALUES ('QUO', 'Quotation', 'QUO', 1, 3, 0, 0)`
    );
    // Marketing people (field executives) no longer create or send priced proposals; the admin does.
    // The start-up permission sync only adds grants, so the old ones are removed here — once, when the
    // quotation tables are first created, so a later manual re-grant by an admin is left alone.
    if (!Number(existed)) {
      await conn.query(
        `DELETE rp FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
         WHERE r.slug = 'field-executive' AND p.permission_key IN ('proposals.create', 'proposals.send')`
      );
    }
    console.log('Migration 027 applied.');
  } finally {
    conn.release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigration027()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('Migration 027 failed:', e);
      process.exit(1);
    });
}
