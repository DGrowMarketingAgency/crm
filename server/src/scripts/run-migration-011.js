import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';
import { SERVICES_CATALOG } from '../modules/services/workflows.data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigration011() {
  console.log('--- Starting Migration 011: Departments & Workflow Presets Engine ---');
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Execute SQL schema definitions
    const sqlPath = path.resolve(__dirname, '../../../database/migrations/011_departments_workflow_presets.sql');
    const rawSql = fs.readFileSync(sqlPath, 'utf8');

    // Remove SQL comments and split by semicolon
    const cleanSql = rawSql.replace(/--.*$/gm, '');
    const statements = cleanSql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.toUpperCase().startsWith('USE '));

    for (const stmt of statements) {
      if (stmt.length > 0) {
        await connection.query(stmt);
      }
    }
    console.log('Schema tables created/verified successfully.');

    // 2. Fetch existing real users
    const [realUsers] = await connection.query(
      `SELECT id, name, email FROM users WHERE status = 'active'`
    );
    const userMap = new Map();
    realUsers.forEach((u) => userMap.set(u.email.toLowerCase().trim(), u));

    const srija = userMap.get('info@dgrowmarketing.com');
    const sarun = userMap.get('sarun@dgrowmarketing.com');
    const subu = userMap.get('subu@dgrowmarketing.com');
    const jaleesh = userMap.get('jaleesh@dgrowmarketing.com');
    const aanand = userMap.get('aanand@dgrowmarketing.com');
    const naveen = userMap.get('naveen@dgrowmarketing.com');
    const sivamani = userMap.get('sivamani@dgrowmarketing.com');

    // 3. Define initial 9 departments
    const initialDepartments = [
      {
        name: 'Management',
        code: 'MANAGEMENT',
        description: 'Agency leadership, executive decisions, resource allocation, and general agency oversight.',
        managerId: srija?.id || null,
        members: srija ? [{ id: srija.id, isPrimary: true, role: 'Leadership & Director' }] : []
      },
      {
        name: 'SEO',
        code: 'SEO',
        description: 'Search Engine Optimization, technical site audits, on-page optimization, and AI Search visibility (AEO/GEO).',
        managerId: sarun?.id || null,
        members: [
          ...(sarun ? [{ id: sarun.id, isPrimary: true, role: 'SEO Lead & Account Manager' }] : []),
          ...(subu ? [{ id: subu.id, isPrimary: true, role: 'SEO Specialist (On-Page & Off-Page)' }] : [])
        ]
      },
      {
        name: 'Content Writing',
        code: 'CONTENT_WRITING',
        description: 'High-impact copywriting, SEO articles, editorial calendars, ad copy, and creative scripts.',
        managerId: sarun?.id || null,
        members: [
          ...(sarun ? [{ id: sarun.id, isPrimary: false, role: 'Senior Content Strategist' }] : [])
        ]
      },
      {
        name: 'Graphic Design',
        code: 'GRAPHIC_DESIGN',
        description: 'Brand identity, marketing collateral, social creatives, vector illustrations, and visual assets.',
        managerId: jaleesh?.id || null,
        members: [
          ...(jaleesh ? [{ id: jaleesh.id, isPrimary: true, role: 'Lead Graphic Designer' }] : [])
        ]
      },
      {
        name: 'UI/UX Design',
        code: 'UIUX_DESIGN',
        description: 'Website UX architectures, wireframing, high-fidelity Figma design systems, and client portal UI.',
        managerId: jaleesh?.id || null,
        members: [
          ...(jaleesh ? [{ id: jaleesh.id, isPrimary: false, role: 'UI/UX Product Designer' }] : [])
        ]
      },
      {
        name: 'Video Editing',
        code: 'VIDEO_EDITING',
        description: 'Short-form reels, high-retention video post-production, motion graphics, and commercial ads.',
        managerId: aanand?.id || null,
        members: [
          ...(aanand ? [{ id: aanand.id, isPrimary: true, role: 'Lead Video Producer & Motion Designer' }] : [])
        ]
      },
      {
        name: 'Web Development',
        code: 'WEB_DEVELOPMENT',
        description: 'Custom React & Vite web applications, full-stack Node.js backends, CMS implementations, and hosting maintenance.',
        managerId: naveen?.id || null,
        members: [
          ...(naveen ? [{ id: naveen.id, isPrimary: true, role: 'Lead Developer' }] : []),
          ...(sivamani ? [{ id: sivamani.id, isPrimary: true, role: 'Full Stack Engineer' }] : [])
        ]
      },
      {
        name: 'Google Ads / Performance Marketing',
        code: 'PERFORMANCE_MARKETING',
        description: 'Paid search, PPC campaign strategy, audience targeting, conversion rate optimization, and ROAS scaling.',
        managerId: sarun?.id || srija?.id || null,
        members: [
          ...(sarun ? [{ id: sarun.id, isPrimary: false, role: 'Performance Marketing Strategist' }] : [])
        ]
      },
      {
        name: 'Social Media Management',
        code: 'SOCIAL_MEDIA',
        description: 'Social channel growth, community engagement, content distribution, and monthly engagement analytics.',
        managerId: aanand?.id || null,
        members: [
          ...(aanand ? [{ id: aanand.id, isPrimary: false, role: 'Social Media Strategist' }] : [])
        ]
      }
    ];

    console.log('Seeding initial 9 departments if not existing...');
    const deptIdMap = new Map();

    for (const d of initialDepartments) {
      const [existing] = await connection.query(
        'SELECT id, name FROM departments WHERE code = ? OR LOWER(name) = LOWER(?)',
        [d.code, d.name]
      );

      let deptId;
      if (existing.length > 0) {
        deptId = existing[0].id;
        console.log(`Department '${d.name}' already exists (ID: ${deptId}).`);
        if (d.managerId) {
          await connection.query(
            'UPDATE departments SET manager_id = COALESCE(manager_id, ?) WHERE id = ?',
            [d.managerId, deptId]
          );
        }
      } else {
        const [insertRes] = await connection.query(
          `INSERT INTO departments (name, code, description, manager_id, status, created_by)
           VALUES (?, ?, ?, ?, 'active', ?)`,
          [d.name, d.code, d.description, d.managerId, srija?.id || null]
        );
        deptId = insertRes.insertId;
        console.log(`Created department: '${d.name}' (ID: ${deptId}).`);
      }

      deptIdMap.set(d.code, deptId);

      // Seed members
      for (const m of d.members) {
        await connection.query(
          `INSERT INTO department_members (department_id, user_id, is_primary, role_in_department)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             is_primary = VALUES(is_primary),
             role_in_department = VALUES(role_in_department)`,
          [deptId, m.id, m.isPrimary, m.role]
        );
      }
    }

    // 4. Seed initial workflow presets into the database from existing service definitions
    console.log('Checking and bootstrapping baseline workflow presets into the database...');
    const [existingPresets] = await connection.query('SELECT COUNT(*) as count FROM workflow_presets');

    if (Number(existingPresets[0].count) === 0) {
      console.log('Bootstrapping workflow presets from services catalog...');

      const presetMappings = [
        {
          catalogKey: 'SEO',
          deptCode: 'SEO',
          category: 'Digital Marketing',
          code: 'WP-SEO-MONTHLY',
          name: 'Monthly SEO Management & Ranking'
        },
        {
          catalogKey: 'GoogleAds',
          deptCode: 'PERFORMANCE_MARKETING',
          category: 'Paid Search',
          code: 'WP-GADS-MONTHLY',
          name: 'Google Ads (PPC) Management'
        },
        {
          catalogKey: 'MetaAds',
          deptCode: 'PERFORMANCE_MARKETING',
          category: 'Paid Social',
          code: 'WP-META-MONTHLY',
          name: 'Meta Ads (Facebook & Instagram)'
        },
        {
          catalogKey: 'WebDevCustom',
          deptCode: 'WEB_DEVELOPMENT',
          category: 'Development',
          code: 'WP-WEBDEV-CUSTOM',
          name: 'Custom Web Application Development'
        },
        {
          catalogKey: 'BrandingDesign',
          deptCode: 'GRAPHIC_DESIGN',
          category: 'Design & Creative',
          code: 'WP-BRANDING-DESIGN',
          name: 'Brand Identity & Visual Design'
        },
        {
          catalogKey: 'VideoProduction',
          deptCode: 'VIDEO_EDITING',
          category: 'Creative Production',
          code: 'WP-VIDEO-REELS',
          name: 'Video Production & Short-Form Content'
        },
        {
          catalogKey: 'SocialMedia',
          deptCode: 'SOCIAL_MEDIA',
          category: 'Social Media',
          code: 'WP-SM-GROWTH',
          name: 'Social Media Management & Growth'
        }
      ];

      for (const mapItem of presetMappings) {
        const catDef = SERVICES_CATALOG[mapItem.catalogKey];
        const deptId = deptIdMap.get(mapItem.deptCode);

        if (!catDef || !deptId) continue;

        // Create Preset
        const [pRes] = await connection.query(
          `INSERT INTO workflow_presets (preset_code, name, description, department_id, service_category, workflow_type, status, created_by)
           VALUES (?, ?, ?, ?, ?, 'recurring_monthly', 'published', ?)`,
          [
            mapItem.code,
            mapItem.name,
            `Standard production workflow preset for ${catDef.label}.`,
            deptId,
            mapItem.category,
            srija?.id || null
          ]
        );
        const presetId = pRes.insertId;

        // Calculate total days
        const totalDays = (catDef.stages || []).reduce((sum, s) => sum + (s.days || 3), 0);

        // Create Version 1 (Published)
        const [vRes] = await connection.query(
          `INSERT INTO workflow_preset_versions 
           (preset_id, version_number, status, estimated_duration_days, deadline_calculation_rules, default_assignee_rules, validation_status, published_at, published_by, created_by)
           VALUES (?, 1, 'published', ?, ?, ?, 'valid', NOW(), ?, ?)`,
          [
            presetId,
            totalDays,
            JSON.stringify({ type: 'business_days', buffer_days: 1 }),
            JSON.stringify({ default_role: catDef.ownerRole || 'member' }),
            srija?.id || null,
            srija?.id || null
          ]
        );
        const versionId = vRes.insertId;

        // Update preset pointer
        await connection.query(
          'UPDATE workflow_presets SET current_version_id = ? WHERE id = ?',
          [versionId, presetId]
        );

        // Insert Stages and Task Templates
        let stageOrder = 1;
        for (const stage of catDef.stages || []) {
          const stageKey = stage.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          const isReview = stage.name.toLowerCase().includes('report') || stage.name.toLowerCase().includes('review') || stage.name.toLowerCase().includes('audit');
          const isClient = stage.tasks?.some((t) => t.cr);

          const [sRes] = await connection.query(
            `INSERT INTO workflow_stages 
             (preset_version_id, stage_key, name, description, display_order, stage_category, is_client_facing, is_review_required, requires_deliverable, requires_client_approval, reviewer_policy, completion_conditions)
             VALUES (?, ?, ?, ?, ?, 'execution', ?, ?, ?, ?, ?, ?)`,
            [
              versionId,
              stageKey,
              stage.name,
              `Phase ${stageOrder}: ${stage.name} (${stage.days || 3} business days)`,
              stageOrder,
              Boolean(isClient),
              Boolean(isReview),
              Boolean(isClient),
              Boolean(isClient),
              JSON.stringify({ role: 'manager' }),
              JSON.stringify({ all_tasks_completed: true })
            ]
          );
          const stageId = sRes.insertId;

          // Insert Tasks
          let taskOrder = 1;
          for (const task of stage.tasks || []) {
            const taskKey = `${stageKey}-t${taskOrder}`;
            await connection.query(
              `INSERT INTO task_templates
               (preset_version_id, stage_id, task_key, title, description, department_id, default_assignee_role, estimated_duration_hours, relative_deadline_days, priority, requires_client_approval, display_order)
               VALUES (?, ?, ?, ?, ?, ?, ?, 4.00, ?, 'medium', ?, ?)`,
              [
                versionId,
                stageId,
                taskKey,
                task.title,
                task.title,
                deptId,
                catDef.ownerRole || 'member',
                stage.days || 2,
                Boolean(task.cr),
                taskOrder
              ]
            );
            taskOrder++;
          }
          stageOrder++;
        }
        console.log(`Initialized published preset: ${mapItem.name} (${mapItem.code}).`);
      }
    }

    await connection.commit();
    console.log('--- Migration 011 completed successfully! ---');
  } catch (err) {
    await connection.rollback();
    console.error('Migration 011 failed:', err);
    throw err;
  } finally {
    connection.release();
  }
}

if (process.argv[1]?.endsWith('run-migration-011.js')) {
  runMigration011()
    .then(() => {
      console.log('Done.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration 011 runner exited with error:', err);
      process.exit(1);
    });
}
