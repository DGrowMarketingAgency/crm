import { pool } from '../config/db.js';
import { seedRbac } from '../modules/rbac/rbac.seed.js';

export async function runMigration017() {
  console.log('🔄 Running Migration 017: Client Monthly Content & Work Calendar...');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Create calendar_recurrence_rules table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS calendar_recurrence_rules (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        client_id BIGINT UNSIGNED NOT NULL,
        title VARCHAR(255) NOT NULL,
        event_type VARCHAR(64) NOT NULL,
        event_category VARCHAR(64) NOT NULL,
        recurrence_pattern ENUM('daily', 'weekly', 'monthly', 'custom_weekdays') NOT NULL,
        interval_count INT DEFAULT 1,
        days_of_week JSON NULL,
        start_date DATE NOT NULL,
        end_date DATE NULL,
        max_occurrences INT NULL,
        template_event_payload JSON NOT NULL,
        created_by BIGINT UNSIGNED NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_crr_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
        CONSTRAINT fk_crr_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Create calendar_events table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS calendar_events (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        client_id BIGINT UNSIGNED NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NULL,
        event_type VARCHAR(64) NOT NULL,
        event_category VARCHAR(64) NOT NULL,
        event_date DATE NOT NULL,
        start_time TIME NULL,
        end_time TIME NULL,
        is_all_day BOOLEAN DEFAULT TRUE,
        assigned_to BIGINT UNSIGNED NULL,
        department VARCHAR(64) NULL,
        project_id BIGINT UNSIGNED NULL,
        task_id BIGINT UNSIGNED NULL,
        service_id BIGINT UNSIGNED NULL,
        platform VARCHAR(64) NULL,
        content_format VARCHAR(64) NULL,
        content_summary TEXT NULL,
        status ENUM('planned', 'in_production', 'pending_internal_review', 'awaiting_client_approval', 'scheduled', 'completed', 'published', 'cancelled', 'on_hold') DEFAULT 'planned',
        priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
        internal_notes TEXT NULL,
        client_notes TEXT NULL,
        is_client_visible BOOLEAN DEFAULT FALSE,
        recurrence_id BIGINT UNSIGNED NULL,
        recurrence_exception BOOLEAN DEFAULT FALSE,
        published_url VARCHAR(512) NULL,
        published_at DATETIME NULL,
        created_by BIGINT UNSIGNED NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_ce_client_date (client_id, event_date),
        INDEX idx_ce_date (event_date),
        INDEX idx_ce_status (status),
        INDEX idx_ce_client_visible (is_client_visible),
        CONSTRAINT fk_ce_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
        CONSTRAINT fk_ce_assignee FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT fk_ce_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
        CONSTRAINT fk_ce_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
        CONSTRAINT fk_ce_service FOREIGN KEY (service_id) REFERENCES service_instances(id) ON DELETE SET NULL,
        CONSTRAINT fk_ce_recurrence FOREIGN KEY (recurrence_id) REFERENCES calendar_recurrence_rules(id) ON DELETE SET NULL,
        CONSTRAINT fk_ce_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 3. Register calendar permissions
    const calendarPerms = [
      { key: 'calendar.view', module: 'Calendar', action: 'view', description: 'View agency calendar and client activities' },
      { key: 'calendar.create', module: 'Calendar', action: 'create', description: 'Create calendar events and publishing schedules' },
      { key: 'calendar.update', module: 'Calendar', action: 'update', description: 'Edit, reschedule, or reassign calendar events' },
      { key: 'calendar.delete', module: 'Calendar', action: 'delete', description: 'Cancel or delete calendar events' },
      { key: 'calendar.publish', module: 'Calendar', action: 'publish', description: 'Confirm publication and update publishing status' }
    ];

    for (const p of calendarPerms) {
      await connection.query(
        `INSERT INTO permissions (permission_key, module, action, description)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           module = VALUES(module),
           action = VALUES(action),
           description = VALUES(description)`,
        [p.key, p.module, p.action, p.description]
      );
    }

    // 4. Associate permissions with roles
    const [roles] = await connection.query('SELECT id, slug FROM roles');
    const roleMap = new Map();
    roles.forEach((r) => roleMap.set(r.slug, r.id));

    const [allPerms] = await connection.query('SELECT id, permission_key FROM permissions WHERE module = "Calendar"');

    // Owner and Admin get all calendar permissions
    for (const p of allPerms) {
      for (const roleSlug of ['owner', 'admin']) {
        const rId = roleMap.get(roleSlug);
        if (rId) {
          await connection.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [rId, p.id]);
        }
      }

      // Member gets view, create, update, publish
      if (['calendar.view', 'calendar.create', 'calendar.update', 'calendar.publish'].includes(p.permission_key)) {
        const memberId = roleMap.get('member');
        if (memberId) {
          await connection.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [memberId, p.id]);
        }
      }

      // Client role gets calendar.view (client-scoped)
      if (p.permission_key === 'calendar.view') {
        const clientId = roleMap.get('client');
        if (clientId) {
          await connection.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [clientId, p.id]);
        }
      }
    }

    await connection.commit();
    console.log('✅ Migration 017 successfully applied.');
  } catch (err) {
    await connection.rollback();
    console.error('❌ Migration 017 failed:', err);
    throw err;
  } finally {
    connection.release();
  }
}

if (process.argv[1] && process.argv[1].includes('run-migration-017.js')) {
  runMigration017()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
