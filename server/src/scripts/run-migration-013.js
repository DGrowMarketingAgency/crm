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

export async function runMigration013() {
  console.log('Starting Migration 013: Workflow Automation Engine & Execution Backbone...');

  // 1. Projects columns
  const projectCols = [
    { col: 'workflow_preset_id', sql: 'ALTER TABLE projects ADD COLUMN workflow_preset_id BIGINT UNSIGNED NULL AFTER client_id' },
    { col: 'workflow_preset_version_id', sql: 'ALTER TABLE projects ADD COLUMN workflow_preset_version_id BIGINT UNSIGNED NULL AFTER workflow_preset_id' },
    { col: 'service_instance_id', sql: 'ALTER TABLE projects ADD COLUMN service_instance_id BIGINT UNSIGNED NULL AFTER workflow_preset_version_id' }
  ];

  for (const item of projectCols) {
    if (!(await columnExists('projects', item.col))) {
      console.log(`Adding projects.${item.col}...`);
      await pool.query(item.sql);
    }
  }

  if (!(await constraintExists('projects', 'fk_prj_preset'))) {
    console.log('Adding fk_prj_preset...');
    await pool.query('ALTER TABLE projects ADD CONSTRAINT fk_prj_preset FOREIGN KEY (workflow_preset_id) REFERENCES workflow_presets(id) ON DELETE SET NULL');
  }

  if (!(await constraintExists('projects', 'fk_prj_preset_ver'))) {
    console.log('Adding fk_prj_preset_ver...');
    await pool.query('ALTER TABLE projects ADD CONSTRAINT fk_prj_preset_ver FOREIGN KEY (workflow_preset_version_id) REFERENCES workflow_preset_versions(id) ON DELETE SET NULL');
  }

  if (!(await constraintExists('projects', 'fk_prj_service_instance'))) {
    console.log('Adding fk_prj_service_instance...');
    await pool.query('ALTER TABLE projects ADD CONSTRAINT fk_prj_service_instance FOREIGN KEY (service_instance_id) REFERENCES service_instances(id) ON DELETE SET NULL');
  }

  // 2. Workflow executions table
  if (!(await tableExists('workflow_executions'))) {
    console.log('Creating table workflow_executions...');
    await pool.query(`
      CREATE TABLE workflow_executions (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        execution_key VARCHAR(120) NOT NULL UNIQUE,
        trigger_type ENUM('service_activation', 'project_start', 'milestone_activation', 'manual') NOT NULL,
        client_id BIGINT UNSIGNED NULL,
        project_id BIGINT UNSIGNED NULL,
        service_instance_id BIGINT UNSIGNED NULL,
        milestone_id BIGINT UNSIGNED NULL,
        workflow_preset_id BIGINT UNSIGNED NOT NULL,
        workflow_preset_version_id BIGINT UNSIGNED NOT NULL,
        status ENUM('pending', 'running', 'completed', 'partially_failed', 'failed') NOT NULL DEFAULT 'pending',
        total_tasks_count INT UNSIGNED NOT NULL DEFAULT 0,
        created_tasks_count INT UNSIGNED NOT NULL DEFAULT 0,
        failed_tasks_count INT UNSIGNED NOT NULL DEFAULT 0,
        error_details JSON NULL,
        executed_by BIGINT UNSIGNED NULL,
        started_at DATETIME NULL,
        completed_at DATETIME NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_we_status (status),
        INDEX idx_we_trigger (trigger_type),
        INDEX idx_we_client (client_id),
        INDEX idx_we_project (project_id),
        INDEX idx_we_service (service_instance_id),
        CONSTRAINT fk_we_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
        CONSTRAINT fk_we_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        CONSTRAINT fk_we_service FOREIGN KEY (service_instance_id) REFERENCES service_instances(id) ON DELETE CASCADE,
        CONSTRAINT fk_we_preset FOREIGN KEY (workflow_preset_id) REFERENCES workflow_presets(id) ON DELETE RESTRICT,
        CONSTRAINT fk_we_ver FOREIGN KEY (workflow_preset_version_id) REFERENCES workflow_preset_versions(id) ON DELETE RESTRICT,
        CONSTRAINT fk_we_user FOREIGN KEY (executed_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  // 3. Tasks columns
  const taskCols = [
    { col: 'workflow_preset_id', sql: 'ALTER TABLE tasks ADD COLUMN workflow_preset_id BIGINT UNSIGNED NULL AFTER department_id' },
    { col: 'workflow_preset_version_id', sql: 'ALTER TABLE tasks ADD COLUMN workflow_preset_version_id BIGINT UNSIGNED NULL AFTER workflow_preset_id' },
    { col: 'task_template_id', sql: 'ALTER TABLE tasks ADD COLUMN task_template_id BIGINT UNSIGNED NULL AFTER workflow_preset_version_id' },
    { col: 'workflow_execution_id', sql: 'ALTER TABLE tasks ADD COLUMN workflow_execution_id BIGINT UNSIGNED NULL AFTER task_template_id' }
  ];

  for (const item of taskCols) {
    if (!(await columnExists('tasks', item.col))) {
      console.log(`Adding tasks.${item.col}...`);
      await pool.query(item.sql);
    }
  }

  if (!(await constraintExists('tasks', 'fk_tasks_preset'))) {
    console.log('Adding fk_tasks_preset...');
    await pool.query('ALTER TABLE tasks ADD CONSTRAINT fk_tasks_preset FOREIGN KEY (workflow_preset_id) REFERENCES workflow_presets(id) ON DELETE SET NULL');
  }

  if (!(await constraintExists('tasks', 'fk_tasks_preset_ver'))) {
    console.log('Adding fk_tasks_preset_ver...');
    await pool.query('ALTER TABLE tasks ADD CONSTRAINT fk_tasks_preset_ver FOREIGN KEY (workflow_preset_version_id) REFERENCES workflow_preset_versions(id) ON DELETE SET NULL');
  }

  if (!(await constraintExists('tasks', 'fk_tasks_template'))) {
    console.log('Adding fk_tasks_template...');
    await pool.query('ALTER TABLE tasks ADD CONSTRAINT fk_tasks_template FOREIGN KEY (task_template_id) REFERENCES task_templates(id) ON DELETE SET NULL');
  }

  if (!(await constraintExists('tasks', 'fk_tasks_execution'))) {
    console.log('Adding fk_tasks_execution...');
    await pool.query('ALTER TABLE tasks ADD CONSTRAINT fk_tasks_execution FOREIGN KEY (workflow_execution_id) REFERENCES workflow_executions(id) ON DELETE SET NULL');
  }

  // 4. Task dependencies runtime table
  if (!(await tableExists('task_dependencies'))) {
    console.log('Creating table task_dependencies...');
    await pool.query(`
      CREATE TABLE task_dependencies (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        task_id BIGINT UNSIGNED NOT NULL,
        depends_on_task_id BIGINT UNSIGNED NOT NULL,
        dependency_type ENUM('finish_to_start', 'start_to_start') NOT NULL DEFAULT 'finish_to_start',
        is_satisfied BOOLEAN NOT NULL DEFAULT FALSE,
        satisfied_at DATETIME NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_task_dependencies (task_id, depends_on_task_id),
        INDEX idx_td_task (task_id, is_satisfied),
        INDEX idx_td_depends_on (depends_on_task_id, is_satisfied),
        CONSTRAINT fk_td_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        CONSTRAINT fk_td_depends_on FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  console.log('Migration 013 executed successfully.');
}

if (process.argv[1]?.includes('run-migration-013.js')) {
  runMigration013()
    .then(() => {
      console.log('Migration completed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
