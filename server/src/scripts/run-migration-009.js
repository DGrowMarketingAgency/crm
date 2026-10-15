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

export async function runMigration009() {
  console.log('Starting Migration 009: D-Grow OS Phase 1...');

  // 1. Users table columns
  if (!(await columnExists('users', 'department'))) {
    console.log('Adding users.department...');
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN department ENUM('SEO', 'PerformanceMarketing', 'Content', 'Design', 'Video', 'Dev', 'BD', 'HR', 'Leadership') NULL AFTER role
    `);
  }

  if (!(await columnExists('users', 'phone'))) {
    console.log('Adding users.phone...');
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN phone VARCHAR(20) NOT NULL DEFAULT '' AFTER email
    `);
  }

  if (!(await columnExists('users', 'client_id'))) {
    console.log('Adding users.client_id...');
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN client_id BIGINT UNSIGNED NULL AFTER phone
    `);
  }

  // Update status enum if needed
  try {
    await pool.query(`
      ALTER TABLE users 
      MODIFY COLUMN status ENUM('active', 'inactive', 'suspended', 'on_leave') NOT NULL DEFAULT 'active'
    `);
  } catch (err) {
    console.warn('Status enum modification note:', err.message);
  }

  if (!(await indexExists('users', 'idx_users_department'))) {
    await pool.query('CREATE INDEX idx_users_department ON users (department)');
  }
  if (!(await indexExists('users', 'idx_users_client_id'))) {
    await pool.query('CREATE INDEX idx_users_client_id ON users (client_id)');
  }

  // 2. Clients table columns
  if (!(await columnExists('clients', 'entity'))) {
    console.log('Adding clients.entity...');
    await pool.query(`
      ALTER TABLE clients 
      ADD COLUMN entity ENUM('D-Grow', 'MedGrowDigi') NOT NULL DEFAULT 'D-Grow' AFTER name
    `);
  }

  if (!(await columnExists('clients', 'vertical'))) {
    console.log('Adding clients.vertical...');
    await pool.query(`
      ALTER TABLE clients 
      ADD COLUMN vertical ENUM('Healthcare', 'General') NOT NULL DEFAULT 'General' AFTER entity
    `);
  }

  if (!(await columnExists('clients', 'lifecycle_stage'))) {
    console.log('Adding clients.lifecycle_stage...');
    await pool.query(`
      ALTER TABLE clients 
      ADD COLUMN lifecycle_stage ENUM('L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6') NOT NULL DEFAULT 'L1' AFTER vertical
    `);
  }

  if (!(await columnExists('clients', 'account_manager_id'))) {
    console.log('Adding clients.account_manager_id...');
    await pool.query(`
      ALTER TABLE clients 
      ADD COLUMN account_manager_id BIGINT UNSIGNED NULL AFTER lifecycle_stage
    `);
  }

  if (!(await columnExists('clients', 'gstin'))) {
    console.log('Adding clients.gstin...');
    await pool.query(`
      ALTER TABLE clients 
      ADD COLUMN gstin VARCHAR(15) NULL AFTER phone
    `);
  }

  if (!(await columnExists('clients', 'billing_address'))) {
    console.log('Adding clients.billing_address...');
    await pool.query(`
      ALTER TABLE clients 
      ADD COLUMN billing_address TEXT NULL AFTER address
    `);
  }

  if (!(await columnExists('clients', 'contract_start_date'))) {
    console.log('Adding clients.contract_start_date...');
    await pool.query(`
      ALTER TABLE clients 
      ADD COLUMN contract_start_date DATE NULL AFTER billing_address
    `);
  }

  if (!(await columnExists('clients', 'contract_end_date'))) {
    console.log('Adding clients.contract_end_date...');
    await pool.query(`
      ALTER TABLE clients 
      ADD COLUMN contract_end_date DATE NULL AFTER contract_start_date
    `);
  }

  if (!(await columnExists('clients', 'portal_account_created'))) {
    console.log('Adding clients.portal_account_created...');
    await pool.query(`
      ALTER TABLE clients 
      ADD COLUMN portal_account_created BOOLEAN NOT NULL DEFAULT FALSE AFTER contract_end_date
    `);
  }

  if (!(await columnExists('clients', 'mediqora_subscriber_id'))) {
    console.log('Adding clients.mediqora_subscriber_id...');
    await pool.query(`
      ALTER TABLE clients 
      ADD COLUMN mediqora_subscriber_id VARCHAR(64) NULL AFTER portal_account_created
    `);
  }

  if (!(await indexExists('clients', 'idx_clients_account_manager'))) {
    await pool.query('CREATE INDEX idx_clients_account_manager ON clients (account_manager_id)');
  }
  if (!(await indexExists('clients', 'idx_clients_lifecycle_stage'))) {
    await pool.query('CREATE INDEX idx_clients_lifecycle_stage ON clients (lifecycle_stage)');
  }
  if (!(await indexExists('clients', 'idx_clients_entity'))) {
    await pool.query('CREATE INDEX idx_clients_entity ON clients (entity)');
  }

  // 3. Service Instances table
  console.log('Ensuring service_instances table exists...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS service_instances (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      client_id BIGINT UNSIGNED NOT NULL,
      service_type VARCHAR(60) NOT NULL,
      label VARCHAR(160) NOT NULL,
      current_stage VARCHAR(60) NOT NULL,
      owner_user_id BIGINT UNSIGNED NULL,
      cycle VARCHAR(60) NOT NULL DEFAULT 'Monthly',
      status ENUM('active', 'paused', 'completed', 'cancelled') NOT NULL DEFAULT 'active',
      stage_index INT NOT NULL DEFAULT 0,
      bundled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_si_client (client_id),
      INDEX idx_si_owner (owner_user_id),
      INDEX idx_si_status (status),
      INDEX idx_si_service_type (service_type),
      CONSTRAINT fk_si_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      CONSTRAINT fk_si_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT fk_si_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 4. Leads table
  console.log('Ensuring leads table exists...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leads (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      pipeline_entity ENUM('D-Grow', 'MedGrowDigi', 'Mediqora') NOT NULL,
      stage VARCHAR(60) NOT NULL DEFAULT 'New',
      title VARCHAR(255) NOT NULL,
      company_name VARCHAR(255) NULL,
      contact_name VARCHAR(255) NULL,
      email VARCHAR(255) NULL,
      phone VARCHAR(50) NULL,
      source VARCHAR(100) NULL,
      estimated_value INT UNSIGNED NULL,
      owner_user_id BIGINT UNSIGNED NULL,
      converted_client_id BIGINT UNSIGNED NULL,
      converted_mediqora_subscriber_id VARCHAR(64) NULL,
      notes TEXT NULL,
      created_by BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_leads_pipeline (pipeline_entity, stage),
      INDEX idx_leads_owner (owner_user_id),
      INDEX idx_leads_client (converted_client_id),
      CONSTRAINT fk_leads_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT fk_leads_client FOREIGN KEY (converted_client_id) REFERENCES clients(id) ON DELETE SET NULL,
      CONSTRAINT fk_leads_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 5. Tasks table extensions
  console.log('Updating tasks table for D-Grow OS...');
  try {
    await pool.query('ALTER TABLE tasks MODIFY COLUMN project_id BIGINT UNSIGNED NULL');
  } catch (err) {
    console.warn('tasks.project_id nullability modification note:', err.message);
  }

  if (!(await columnExists('tasks', 'client_id'))) {
    console.log('Adding tasks.client_id...');
    await pool.query(`
      ALTER TABLE tasks 
      ADD COLUMN client_id BIGINT UNSIGNED NULL AFTER project_id
    `);
    await pool.query('CREATE INDEX idx_tasks_client ON tasks (client_id)');
  }

  if (!(await columnExists('tasks', 'service_instance_id'))) {
    console.log('Adding tasks.service_instance_id...');
    await pool.query(`
      ALTER TABLE tasks 
      ADD COLUMN service_instance_id BIGINT UNSIGNED NULL AFTER client_id
    `);
    await pool.query('CREATE INDEX idx_tasks_service_instance ON tasks (service_instance_id)');
  }

  if (!(await columnExists('tasks', 'source'))) {
    console.log('Adding tasks.source...');
    await pool.query(`
      ALTER TABLE tasks 
      ADD COLUMN source ENUM('Workflow', 'Manual') NOT NULL DEFAULT 'Manual' AFTER service_instance_id
    `);
    await pool.query('CREATE INDEX idx_tasks_source ON tasks (source)');
  }

  if (!(await columnExists('tasks', 'column_status'))) {
    console.log('Adding tasks.column_status...');
    await pool.query(`
      ALTER TABLE tasks 
      ADD COLUMN column_status ENUM('todo', 'in_progress', 'client_review', 'revision', 'done') NOT NULL DEFAULT 'todo' AFTER status
    `);
    await pool.query('CREATE INDEX idx_tasks_column_status ON tasks (column_status)');
  }

  if (!(await columnExists('tasks', 'is_client_deliverable'))) {
    console.log('Adding tasks.is_client_deliverable...');
    await pool.query(`
      ALTER TABLE tasks 
      ADD COLUMN is_client_deliverable BOOLEAN NOT NULL DEFAULT FALSE AFTER column_status
    `);
  }

  if (!(await columnExists('tasks', 'revision_count'))) {
    console.log('Adding tasks.revision_count...');
    await pool.query(`
      ALTER TABLE tasks 
      ADD COLUMN revision_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER is_client_deliverable
    `);
  }

  if (!(await columnExists('tasks', 'deliverable_url'))) {
    console.log('Adding tasks.deliverable_url...');
    await pool.query(`
      ALTER TABLE tasks 
      ADD COLUMN deliverable_url VARCHAR(1000) NULL AFTER revision_count
    `);
  }

  if (!(await columnExists('tasks', 'deliverable_notes'))) {
    console.log('Adding tasks.deliverable_notes...');
    await pool.query(`
      ALTER TABLE tasks 
      ADD COLUMN deliverable_notes TEXT NULL AFTER deliverable_url
    `);
  }

  if (!(await columnExists('tasks', 'assignee_id'))) {
    console.log('Adding tasks.assignee_id...');
    await pool.query(`
      ALTER TABLE tasks 
      ADD COLUMN assignee_id BIGINT UNSIGNED NULL AFTER deliverable_notes
    `);
    await pool.query('CREATE INDEX idx_tasks_assignee_id ON tasks (assignee_id)');
  }

  console.log('Migration 009 executed successfully!');
}

if (process.argv[1]?.endsWith('run-migration-009.js')) {
  runMigration009()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

