import { pool } from '../config/db.js';

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows[0].count) > 0;
}

async function tableExists(table) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
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

export async function runMigration014() {
  console.log('Starting Migration 014: Internal Review, Client Approval & Deliverable Revision Workflow...');

  // 1. task_templates extensions
  const ttCols = [
    { col: 'requires_deliverable', sql: 'ALTER TABLE task_templates ADD COLUMN requires_deliverable BOOLEAN NOT NULL DEFAULT FALSE AFTER requires_client_approval' },
    { col: 'expected_deliverable_type', sql: "ALTER TABLE task_templates ADD COLUMN expected_deliverable_type VARCHAR(50) NOT NULL DEFAULT 'document' AFTER requires_deliverable" },
    { col: 'reviewer_role', sql: 'ALTER TABLE task_templates ADD COLUMN reviewer_role VARCHAR(100) NULL AFTER expected_deliverable_type' },
    { col: 'revision_policy', sql: 'ALTER TABLE task_templates ADD COLUMN revision_policy JSON NULL AFTER reviewer_role' }
  ];

  for (const item of ttCols) {
    if (!(await columnExists('task_templates', item.col))) {
      console.log(`Adding task_templates.${item.col}...`);
      await pool.query(item.sql);
    }
  }

  // 2. tasks extensions
  const taskCols = [
    { col: 'requires_internal_review', sql: 'ALTER TABLE tasks ADD COLUMN requires_internal_review BOOLEAN NOT NULL DEFAULT TRUE AFTER is_client_deliverable' },
    { col: 'requires_client_approval', sql: 'ALTER TABLE tasks ADD COLUMN requires_client_approval BOOLEAN NOT NULL DEFAULT FALSE AFTER requires_internal_review' },
    { col: 'requires_deliverable', sql: 'ALTER TABLE tasks ADD COLUMN requires_deliverable BOOLEAN NOT NULL DEFAULT FALSE AFTER requires_client_approval' },
    { col: 'expected_deliverable_type', sql: "ALTER TABLE tasks ADD COLUMN expected_deliverable_type VARCHAR(50) NOT NULL DEFAULT 'document' AFTER requires_deliverable" },
    { col: 'internal_reviewer_id', sql: 'ALTER TABLE tasks ADD COLUMN internal_reviewer_id BIGINT UNSIGNED NULL AFTER assignee_id' },
    { col: 'current_submission_id', sql: 'ALTER TABLE tasks ADD COLUMN current_submission_id BIGINT UNSIGNED NULL AFTER internal_reviewer_id' }
  ];

  for (const item of taskCols) {
    if (!(await columnExists('tasks', item.col))) {
      console.log(`Adding tasks.${item.col}...`);
      await pool.query(item.sql);
    }
  }

  // 3. deliverable_submissions table
  if (!(await tableExists('deliverable_submissions'))) {
    console.log('Creating deliverable_submissions table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS deliverable_submissions (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        task_id BIGINT UNSIGNED NOT NULL,
        client_id BIGINT UNSIGNED NOT NULL,
        project_id BIGINT UNSIGNED NULL,
        service_instance_id BIGINT UNSIGNED NULL,
        version_number INT UNSIGNED NOT NULL DEFAULT 1,
        deliverable_type VARCHAR(50) NOT NULL DEFAULT 'document',
        title VARCHAR(255) NOT NULL,
        deliverable_url VARCHAR(1000) NULL,
        file_path VARCHAR(500) NULL,
        file_name VARCHAR(255) NULL,
        file_size BIGINT UNSIGNED NULL,
        file_mime_type VARCHAR(100) NULL,
        submission_notes TEXT NULL,
        submitted_by BIGINT UNSIGNED NOT NULL,
        submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        internal_review_status ENUM('pending', 'approved', 'changes_requested') NOT NULL DEFAULT 'pending',
        internal_reviewer_id BIGINT UNSIGNED NULL,
        internal_review_feedback TEXT NULL,
        internal_reviewed_at DATETIME NULL,
        requires_client_approval BOOLEAN NOT NULL DEFAULT FALSE,
        client_approval_status ENUM('not_required', 'pending', 'approved', 'revision_requested') NOT NULL DEFAULT 'not_required',
        client_reviewer_id BIGINT UNSIGNED NULL,
        client_feedback TEXT NULL,
        client_reviewed_at DATETIME NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_ds_task (task_id),
        INDEX idx_ds_client (client_id),
        INDEX idx_ds_project (project_id),
        INDEX idx_ds_internal_status (internal_review_status),
        INDEX idx_ds_client_status (client_approval_status),
        INDEX idx_ds_task_version (task_id, version_number),
        CONSTRAINT fk_ds_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        CONSTRAINT fk_ds_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
        CONSTRAINT fk_ds_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
        CONSTRAINT fk_ds_service FOREIGN KEY (service_instance_id) REFERENCES service_instances(id) ON DELETE SET NULL,
        CONSTRAINT fk_ds_submitter FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT fk_ds_int_reviewer FOREIGN KEY (internal_reviewer_id) REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT fk_ds_client_reviewer FOREIGN KEY (client_reviewer_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  // 4. deliverable_revision_requests table
  if (!(await tableExists('deliverable_revision_requests'))) {
    console.log('Creating deliverable_revision_requests table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS deliverable_revision_requests (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        submission_id BIGINT UNSIGNED NOT NULL,
        task_id BIGINT UNSIGNED NOT NULL,
        revision_cycle INT UNSIGNED NOT NULL DEFAULT 1,
        requested_by_type ENUM('internal_reviewer', 'client') NOT NULL,
        requested_by_user_id BIGINT UNSIGNED NOT NULL,
        revision_reason TEXT NOT NULL,
        status ENUM('open', 'resolved') NOT NULL DEFAULT 'open',
        resolved_in_submission_id BIGINT UNSIGNED NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_drr_submission (submission_id),
        INDEX idx_drr_task (task_id),
        INDEX idx_drr_status (status),
        CONSTRAINT fk_drr_submission FOREIGN KEY (submission_id) REFERENCES deliverable_submissions(id) ON DELETE CASCADE,
        CONSTRAINT fk_drr_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        CONSTRAINT fk_drr_user FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT fk_drr_resolved FOREIGN KEY (resolved_in_submission_id) REFERENCES deliverable_submissions(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  console.log('Migration 014 applied successfully.');
}

if (process.argv[1]?.endsWith('run-migration-014.js')) {
  runMigration014()
    .then(() => {
      console.log('Migration script finished.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
