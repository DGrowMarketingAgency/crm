import { pool } from '../config/db.js';

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows[0].count) > 0;
}

async function indexExists(table, indexName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.STATISTICS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName]
  );
  return Number(rows[0].count) > 0;
}

async function constraintExists(table, constraintName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
    [table, constraintName]
  );
  return Number(rows[0].count) > 0;
}

export async function runMigration012() {
  console.log('Starting Migration 012: Client Management & Lifecycle Backbone...');

  // 1. Extend clients table
  const clientCols = [
    { col: 'client_code', sql: 'ALTER TABLE clients ADD COLUMN client_code VARCHAR(50) NULL' },
    { col: 'industry', sql: 'ALTER TABLE clients ADD COLUMN industry VARCHAR(100) NULL' },
    { col: 'website', sql: 'ALTER TABLE clients ADD COLUMN website VARCHAR(255) NULL' },
    { col: 'city', sql: 'ALTER TABLE clients ADD COLUMN city VARCHAR(100) NULL' },
    { col: 'country', sql: "ALTER TABLE clients ADD COLUMN country VARCHAR(100) NOT NULL DEFAULT 'India'" },
    { col: 'onboarding_owner_id', sql: 'ALTER TABLE clients ADD COLUMN onboarding_owner_id BIGINT UNSIGNED NULL' },
    { col: 'requirements_notes', sql: 'ALTER TABLE clients ADD COLUMN requirements_notes TEXT NULL' },
    { col: 'communication_preferences', sql: 'ALTER TABLE clients ADD COLUMN communication_preferences JSON NULL' },
    { col: 'offboarding_reason', sql: 'ALTER TABLE clients ADD COLUMN offboarding_reason TEXT NULL' },
    { col: 'offboarded_at', sql: 'ALTER TABLE clients ADD COLUMN offboarded_at DATETIME NULL' },
    { col: 'offboarded_by', sql: 'ALTER TABLE clients ADD COLUMN offboarded_by BIGINT UNSIGNED NULL' }
  ];

  for (const item of clientCols) {
    if (!(await columnExists('clients', item.col))) {
      console.log(`Adding clients.${item.col}...`);
      await pool.query(item.sql);
    }
  }

  if (!(await indexExists('clients', 'uq_clients_code'))) {
    console.log('Adding unique constraint uq_clients_code...');
    await pool.query('ALTER TABLE clients ADD UNIQUE KEY uq_clients_code (client_code)');
  }

  // 2. Client Contacts Table
  console.log('Ensuring client_contacts table exists...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS client_contacts (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      client_id BIGINT UNSIGNED NOT NULL,
      name VARCHAR(255) NOT NULL,
      designation VARCHAR(150) NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(50) NULL,
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
      portal_access_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      user_id BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_cc_client (client_id),
      INDEX idx_cc_email (email),
      INDEX idx_cc_primary (client_id, is_primary),
      CONSTRAINT fk_cc_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      CONSTRAINT fk_cc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 3. Account Manager Assignment History Table
  console.log('Ensuring account_manager_history table exists...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS account_manager_history (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      client_id BIGINT UNSIGNED NOT NULL,
      previous_manager_id BIGINT UNSIGNED NULL,
      new_manager_id BIGINT UNSIGNED NOT NULL,
      assigned_by BIGINT UNSIGNED NOT NULL,
      reason VARCHAR(500) NULL,
      assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_amh_client (client_id),
      INDEX idx_amh_assigned_at (assigned_at),
      CONSTRAINT fk_amh_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      CONSTRAINT fk_amh_prev FOREIGN KEY (previous_manager_id) REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT fk_amh_new FOREIGN KEY (new_manager_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_amh_by FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 4. Client Onboarding Checklist Items Table
  console.log('Ensuring client_onboarding_items table exists...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS client_onboarding_items (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      client_id BIGINT UNSIGNED NOT NULL,
      item_key VARCHAR(100) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NULL,
      owner_user_id BIGINT UNSIGNED NULL,
      due_date DATE NULL,
      is_completed BOOLEAN NOT NULL DEFAULT FALSE,
      completed_at TIMESTAMP NULL,
      completed_by BIGINT UNSIGNED NULL,
      notes TEXT NULL,
      display_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_coi_client (client_id),
      INDEX idx_coi_completed (client_id, is_completed),
      CONSTRAINT fk_coi_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      CONSTRAINT fk_coi_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT fk_coi_completer FOREIGN KEY (completed_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 5. Extend service_instances Table
  console.log('Ensuring service_instances columns exist...');
  const siCols = [
    { col: 'department_id', sql: 'ALTER TABLE service_instances ADD COLUMN department_id BIGINT UNSIGNED NULL' },
    { col: 'workflow_preset_id', sql: 'ALTER TABLE service_instances ADD COLUMN workflow_preset_id BIGINT UNSIGNED NULL' },
    { col: 'workflow_preset_version_id', sql: 'ALTER TABLE service_instances ADD COLUMN workflow_preset_version_id BIGINT UNSIGNED NULL' },
    { col: 'scope_description', sql: 'ALTER TABLE service_instances ADD COLUMN scope_description TEXT NULL' },
    { col: 'expected_deliverables', sql: 'ALTER TABLE service_instances ADD COLUMN expected_deliverables TEXT NULL' },
    { col: 'service_frequency', sql: "ALTER TABLE service_instances ADD COLUMN service_frequency VARCHAR(60) NOT NULL DEFAULT 'Monthly'" },
    { col: 'start_date', sql: 'ALTER TABLE service_instances ADD COLUMN start_date DATE NULL' },
    { col: 'end_date', sql: 'ALTER TABLE service_instances ADD COLUMN end_date DATE NULL' },
    { col: 'operational_notes', sql: 'ALTER TABLE service_instances ADD COLUMN operational_notes TEXT NULL' }
  ];

  for (const item of siCols) {
    if (!(await columnExists('service_instances', item.col))) {
      console.log(`Adding service_instances.${item.col}...`);
      await pool.query(item.sql);
    }
  }

  // Update status ENUM to support all Phase 2 states
  try {
    await pool.query(`
      ALTER TABLE service_instances 
      MODIFY COLUMN status ENUM('draft', 'pending_activation', 'active', 'paused', 'completed', 'cancelled') NOT NULL DEFAULT 'active'
    `);
  } catch (err) {
    console.warn('Note modifying service_instances status ENUM:', err.message);
  }

  // Foreign keys on service_instances
  if (!(await constraintExists('service_instances', 'fk_si_dept'))) {
    console.log('Adding fk_si_dept constraint...');
    try {
      await pool.query('ALTER TABLE service_instances ADD CONSTRAINT fk_si_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL');
    } catch (e) { console.warn('fk_si_dept warning:', e.message); }
  }

  if (!(await constraintExists('service_instances', 'fk_si_preset'))) {
    console.log('Adding fk_si_preset constraint...');
    try {
      await pool.query('ALTER TABLE service_instances ADD CONSTRAINT fk_si_preset FOREIGN KEY (workflow_preset_id) REFERENCES workflow_presets(id) ON DELETE SET NULL');
    } catch (e) { console.warn('fk_si_preset warning:', e.message); }
  }

  if (!(await constraintExists('service_instances', 'fk_si_preset_version'))) {
    console.log('Adding fk_si_preset_version constraint...');
    try {
      await pool.query('ALTER TABLE service_instances ADD CONSTRAINT fk_si_preset_version FOREIGN KEY (workflow_preset_version_id) REFERENCES workflow_preset_versions(id) ON DELETE SET NULL');
    } catch (e) { console.warn('fk_si_preset_version warning:', e.message); }
  }

  // 6. Client Activity Timeline Table
  console.log('Ensuring client_activity_logs table exists...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS client_activity_logs (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      client_id BIGINT UNSIGNED NOT NULL,
      actor_id BIGINT UNSIGNED NULL,
      activity_type VARCHAR(100) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NULL,
      metadata JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_cal_client (client_id),
      INDEX idx_cal_type (activity_type),
      INDEX idx_cal_created (created_at),
      CONSTRAINT fk_cal_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      CONSTRAINT fk_cal_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Migrate existing client primary contacts into client_contacts table if none exist for that client
  const [existingClients] = await pool.query(`
    SELECT id, name, email, phone, company_name, created_at FROM clients
  `);
  
  for (const cl of existingClients) {
    if (cl.email) {
      const [existingC] = await pool.query('SELECT id FROM client_contacts WHERE client_id = ? LIMIT 1', [cl.id]);
      if (existingC.length === 0) {
        await pool.query(`
          INSERT INTO client_contacts (client_id, name, designation, email, phone, is_primary, status)
          VALUES (?, ?, 'Primary Contact', ?, ?, TRUE, 'active')
        `, [cl.id, cl.name || 'Primary Contact', cl.email, cl.phone || null]);
      }
    }
  }

  console.log('Migration 012 applied successfully!');
}

if (process.argv[1]?.endsWith('run-migration-012.js')) {
  runMigration012()
    .then(() => {
      console.log('Done.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration 012 failed:', err);
      process.exit(1);
    });
}
