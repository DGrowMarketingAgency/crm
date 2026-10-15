import { pool } from '../config/db.js';
import bcrypt from 'bcrypt';
import { runMigration009 } from './run-migration-009.js';
import { runMigration010 } from './run-migration-010.js';
import { runMigration011 } from './run-migration-011.js';
import { runMigration012 } from './run-migration-012.js';
import { runMigration013 } from './run-migration-013.js';
import { runMigration014 } from './run-migration-014.js';
import { runMigration017 } from './run-migration-017.js';
import { seedRbac } from '../modules/rbac/rbac.seed.js';

async function syncDatabase() {
  try {
    console.log('🚀 Synchronizing schema on remote database...');

    console.log('--- Step 1: Migration 009 (Phase 1 Lifecycle Backbone, Leads, Tasks client_id) ---');
    await runMigration009();

    console.log('--- Step 2: Migration 010 (User Multi-Designations) ---');
    await runMigration010();

    console.log('--- Step 3: Migration 011 (Departments & Workflow Presets) ---');
    await runMigration011();

    console.log('--- Step 4: Migration 012 (Client Management & Lifecycle) ---');
    await runMigration012();

    console.log('--- Step 5: Migration 013 (Workflow Automation Engine) ---');
    await runMigration013();

    console.log('--- Step 6: Migration 014 (Deliverables & Revisions) ---');
    await runMigration014();

    console.log('--- Step 7: Migration 017 (HR Management & Calendar) ---');
    await runMigration017();

    console.log('--- Step 8: Seeding RBAC System Roles & Permissions ---');
    await seedRbac();
    console.log('✅ RBAC roles and permissions seeded successfully');

    // Ensure Admin / Owner exists
    const [existingOwners] = await pool.query(
      "SELECT id, email FROM users WHERE role IN ('owner', 'admin')"
    );

    if (existingOwners.length === 0) {
      console.log('--- Step 9: Creating initial administrator account ---');
      const defaultPassword = 'Password123!';
      const hash = await bcrypt.hash(defaultPassword, 10);

      const [insertRes] = await pool.query(
        `INSERT INTO users (name, email, password_hash, role, status)
         VALUES ('Administrator', 'info@dgrowmarketing.com', ?, 'admin', 'active')
         ON DUPLICATE KEY UPDATE password_hash = ?`,
        [hash, hash]
      );

      const [adminRole] = await pool.query("SELECT id FROM roles WHERE slug = 'admin'");
      const [ownerRole] = await pool.query("SELECT id FROM roles WHERE slug = 'owner'");

      const userId = insertRes.insertId || 1;
      if (adminRole.length > 0) {
        await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, adminRole[0].id]);
      }
      if (ownerRole.length > 0) {
        await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, ownerRole[0].id]);
      }

      console.log('✅ Created administrator login:');
      console.log('   Email: info@dgrowmarketing.com');
      console.log('   Password: Password123!');
    } else {
      console.log(`✅ Administrator accounts exist (${existingOwners.map((o) => o.email).join(', ')})`);
    }

    console.log('🎉 Remote database synchronization complete!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Database sync failed:', err);
    process.exit(1);
  }
}

syncDatabase();
