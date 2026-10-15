import { pool } from '../config/db.js';

async function audit() {
  const [tables] = await pool.query('SHOW TABLES');
  const tableNames = tables.map(t => Object.values(t)[0]);
  console.log('--- ALL TABLES ---');
  console.log(tableNames);

  console.log('\n--- CHECKING TABLES OF INTEREST ---');
  for (const name of ['projects', 'milestones', 'service_instances', 'tasks', 'task_template_dependencies', 'workflow_presets', 'workflow_preset_versions', 'workflow_stages', 'task_templates']) {
    if (tableNames.includes(name)) {
      const [cols] = await pool.query(`SHOW COLUMNS FROM \`${name}\``);
      console.log(`\nTable ${name}:`, cols.map(c => c.Field));
    } else {
      console.log(`\nTable ${name} DOES NOT EXIST`);
    }
  }

  process.exit(0);
}

audit().catch(e => {
  console.error(e);
  process.exit(1);
});
