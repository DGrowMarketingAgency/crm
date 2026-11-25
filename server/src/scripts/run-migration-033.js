import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';
import { SERVICES_CATALOG } from '../modules/services/workflows.data.js';

async function count(conn, sql, params) {
  const [[row]] = await conn.query(sql, params);
  return Number(row.n);
}

const colSql = 'SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?';
const idxSql = 'SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?';

/** Converts a workflows.data.js stage task into a stored task template. */
export function toTemplate(t) {
  if (typeof t === 'string') return { title: t, clientReview: false, role: null };
  return { title: String(t.title).slice(0, 255), clientReview: Boolean(t.cr), role: t.role || null };
}

/**
 * Seeds one standard pipeline per service in the catalog. A service that already has an active pipeline
 * (e.g. one the team built by hand) is left alone; re-running never duplicates (template_key is unique).
 */
export async function seedServicePipelines(conn) {
  let created = 0;
  for (const [key, def] of Object.entries(SERVICES_CATALOG)) {
    if (await count(conn, 'SELECT COUNT(*) AS n FROM project_pipelines WHERE template_key = ?', [key])) continue;
    const [[svc]] = await conn.query('SELECT id FROM services WHERE service_code = ?', [key]);
    if (svc && (await count(conn, "SELECT COUNT(*) AS n FROM project_pipelines WHERE service_id = ? AND status = 'active'", [svc.id]))) continue;
    await conn.beginTransaction();
    try {
      const [res] = await conn.query(
        'INSERT INTO project_pipelines (name, description, service_id, status, template_key) VALUES (?, ?, ?, ?, ?)',
        [def.label, `Standard ${def.cycle ? def.cycle.toLowerCase() + ' ' : ''}workflow from the D-Grow service playbook.`, svc?.id || null, 'active', key]
      );
      let order = 1;
      for (const stage of def.stages) {
        await conn.query(
          `INSERT INTO project_pipeline_steps (pipeline_id, step_order, name, step_type, est_days, task_templates)
           VALUES (?, ?, ?, 'work', ?, ?)`,
          [res.insertId, order, stage.name, stage.days || null, JSON.stringify((stage.tasks || []).map(toTemplate))]
        );
        order += 1;
      }
      await conn.commit();
      created += 1;
    } catch (e) {
      await conn.rollback();
      throw e;
    }
  }
  return created;
}

export async function runMigration033() {
  const conn = await pool.getConnection();
  try {
    for (const table of ['project_pipeline_steps', 'project_steps']) {
      if (!(await count(conn, colSql, [table, 'task_templates']))) {
        await conn.query(`ALTER TABLE ${table} ADD COLUMN task_templates JSON NULL`);
        console.log(`+ ${table}.task_templates`);
      }
    }
    if (!(await count(conn, colSql, ['project_steps', 'est_days']))) {
      await conn.query('ALTER TABLE project_steps ADD COLUMN est_days INT UNSIGNED NULL AFTER step_type');
      console.log('+ project_steps.est_days');
    }
    if (!(await count(conn, colSql, ['project_pipelines', 'template_key']))) {
      await conn.query('ALTER TABLE project_pipelines ADD COLUMN template_key VARCHAR(60) NULL AFTER service_id');
      console.log('+ project_pipelines.template_key');
    }
    if (!(await count(conn, idxSql, ['project_pipelines', 'uq_pp_template_key']))) {
      await conn.query('ALTER TABLE project_pipelines ADD UNIQUE KEY uq_pp_template_key (template_key)');
    }
    const seeded = await seedServicePipelines(conn);
    if (seeded) console.log(`  seeded ${seeded} standard service pipeline(s)`);
    console.log('Migration 033 applied.');
  } finally {
    conn.release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigration033()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('Migration 033 failed:', e);
      process.exit(1);
    });
}
