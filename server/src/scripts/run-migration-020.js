import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';
import { SERVICES_CATALOG, ROLE_DEPARTMENT_MAP } from '../modules/services/workflows.data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  console.log('Running Migration 020: Service Management & Project Types...');
  const sqlPath = path.resolve(__dirname, '../../../database/migrations/020_service_management_and_project_types.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  // Remove SQL comment lines
  const cleanSql = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  const statements = cleanSql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.toLowerCase().startsWith('use '));

  const conn = await pool.getConnection();
  try {
    for (const stmt of statements) {
      if (stmt.length > 0) {
        await conn.query(stmt);
      }
    }
    console.log('Migration 020 SQL executed successfully.');

    // Seed services from SERVICES_CATALOG
    console.log('Seeding services catalog into database...');
    const [departments] = await conn.query('SELECT id, name, code FROM departments');
    const deptMap = {};
    for (const d of departments) {
      deptMap[d.code.toUpperCase()] = d.id;
      deptMap[d.name.toUpperCase()] = d.id;
    }

    const [presets] = await conn.query('SELECT id, preset_code, name FROM workflow_presets');
    const presetMap = {};
    for (const p of presets) {
      presetMap[p.preset_code] = p.id;
      if (p.preset_code.includes('SEO')) presetMap['SEO'] = p.id;
      if (p.preset_code.includes('GADS')) presetMap['GoogleAds'] = p.id;
    }

    for (const [key, def] of Object.entries(SERVICES_CATALOG)) {
      const deptKey = (ROLE_DEPARTMENT_MAP[def.ownerRole] || 'MANAGEMENT').toUpperCase();
      let deptId = deptMap[deptKey] || null;
      if (!deptId) {
        // Fallback matching
        for (const [k, id] of Object.entries(deptMap)) {
          if (k.includes(deptKey) || deptKey.includes(k)) {
            deptId = id;
            break;
          }
        }
      }

      const wpId = presetMap[key] || null;

      const [existing] = await conn.query('SELECT id FROM services WHERE service_code = ?', [key]);
      if (existing.length === 0) {
        await conn.query(
          `INSERT INTO services (
            service_code, name, description, category, department_id,
            default_owner_role, execution_cycle, workflow_preset_id, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
          [
            key,
            def.label,
            `Comprehensive ${def.label} service with ${def.stages.length} workflow stages.`,
            def.group || 'Digital Marketing',
            deptId,
            def.ownerRole,
            def.cycle || 'Monthly',
            wpId
          ]
        );
        console.log(`+ Seeded service: ${key} (${def.label})`);
      } else {
        // Update department and workflow preset if empty
        await conn.query(
          `UPDATE services SET 
            name = ?, category = ?, default_owner_role = ?, execution_cycle = ?,
            department_id = COALESCE(department_id, ?),
            workflow_preset_id = COALESCE(workflow_preset_id, ?)
           WHERE service_code = ?`,
          [def.label, def.group || 'Digital Marketing', def.ownerRole, def.cycle || 'Monthly', deptId, wpId, key]
        );
      }
    }

    // Ensure RBAC permissions for services
    console.log('Ensuring RBAC permissions for services & workflows...');
    const newPermissions = [
      { key: 'services.create', module: 'Services', action: 'create', desc: 'Create new master service catalog items' },
      { key: 'services.update', module: 'Services', action: 'update', desc: 'Update service catalog definitions' },
      { key: 'services.delete', module: 'Services', action: 'delete', desc: 'Delete or archive service items' },
      { key: 'services.archive', module: 'Services', action: 'archive', desc: 'Archive obsolete service catalog items' }
    ];

    for (const p of newPermissions) {
      const [existingPerm] = await conn.query('SELECT id FROM permissions WHERE permission_key = ?', [p.key]);
      let permId;
      if (existingPerm.length === 0) {
        const [res] = await conn.query(
          'INSERT INTO permissions (permission_key, module, action, description) VALUES (?, ?, ?, ?)',
          [p.key, p.module, p.action, p.desc]
        );
        permId = res.insertId;
        console.log(`+ Added permission: ${p.key}`);
      } else {
        permId = existingPerm[0].id;
      }

      // Assign to owner and admin roles
      const [roles] = await conn.query("SELECT id FROM roles WHERE slug IN ('owner', 'admin')");
      for (const r of roles) {
        await conn.query(
          'INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
          [r.id, permId]
        );
      }
    }

    console.log('Migration 020 and service catalogue setup completed successfully.');
  } catch (err) {
    console.error('Error running migration 020:', err);
    throw err;
  } finally {
    conn.release();
    process.exit(0);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
