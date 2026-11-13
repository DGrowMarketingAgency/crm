import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_FILE = path.resolve(__dirname, '../../../database/migrations/021_project_pipelines_and_flow.sql');

const PROJECT_COLUMNS = [
  ['project_category', "ENUM('regular','one_time','urgent','out_of_service') NULL AFTER project_type"],
  ['assignment_mode', "ENUM('individual','team') NULL AFTER project_category"],
  ['pipeline_id', 'BIGINT UNSIGNED NULL AFTER assignment_mode'],
  ['service_id', 'BIGINT UNSIGNED NULL AFTER pipeline_id'],
  ['team_leader_id', 'BIGINT UNSIGNED NULL AFTER service_id'],
  ['parent_project_id', 'BIGINT UNSIGNED NULL AFTER team_leader_id'],
  ['cycle_month', 'CHAR(7) NULL AFTER parent_project_id'],
  ['monthly_deliverables', 'JSON NULL AFTER cycle_month'],
  ['billing_amount', 'DECIMAL(12,2) NULL AFTER monthly_deliverables'],
  ['billing_status', "ENUM('unbilled','billed','paid') NULL AFTER billing_amount"]
];

const PROJECT_FKS = [
  ['fk_projects_pipeline', 'pipeline_id', 'project_pipelines(id)'],
  ['fk_projects_service', 'service_id', 'services(id)'],
  ['fk_projects_team_leader', 'team_leader_id', 'users(id)'],
  ['fk_projects_parent', 'parent_project_id', 'projects(id)']
];

const TASK_COLUMNS = [
  ['project_step_id', 'BIGINT UNSIGNED NULL AFTER project_id'],
  ['target_qty', 'INT UNSIGNED NULL AFTER estimated_minutes']
];

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    'SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, column]
  );
  return Number(rows[0].n) > 0;
}

async function constraintExists(conn, table, name) {
  const [rows] = await conn.query(
    'SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?',
    [table, name]
  );
  return Number(rows[0].n) > 0;
}

export async function runMigration021() {
  const conn = await pool.getConnection();
  try {
    const sql = fs.readFileSync(SQL_FILE, 'utf8');
    const statements = sql
      .split(/;\s*\n/)
      .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
      .filter(Boolean);
    for (const stmt of statements) await conn.query(stmt);

    for (const [col, def] of PROJECT_COLUMNS) {
      if (!(await columnExists(conn, 'projects', col))) {
        await conn.query(`ALTER TABLE projects ADD COLUMN ${col} ${def}`);
        console.log(`+ projects.${col}`);
      }
    }
    for (const [name, col, ref] of PROJECT_FKS) {
      if (!(await constraintExists(conn, 'projects', name))) {
        await conn.query(`ALTER TABLE projects ADD CONSTRAINT ${name} FOREIGN KEY (${col}) REFERENCES ${ref} ON DELETE SET NULL`);
      }
    }
    if (!(await constraintExists(conn, 'projects', 'uq_projects_parent_cycle'))) {
      await conn.query('ALTER TABLE projects ADD CONSTRAINT uq_projects_parent_cycle UNIQUE (parent_project_id, cycle_month)');
    }

    for (const [col, def] of TASK_COLUMNS) {
      if (!(await columnExists(conn, 'tasks', col))) {
        await conn.query(`ALTER TABLE tasks ADD COLUMN ${col} ${def}`);
        console.log(`+ tasks.${col}`);
      }
    }
    if (!(await constraintExists(conn, 'tasks', 'fk_tasks_project_step'))) {
      await conn.query('ALTER TABLE tasks ADD CONSTRAINT fk_tasks_project_step FOREIGN KEY (project_step_id) REFERENCES project_steps(id) ON DELETE SET NULL');
    }
    console.log('Migration 021 applied.');
  } finally {
    conn.release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigration021()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('Migration 021 failed:', e);
      process.exit(1);
    });
}
