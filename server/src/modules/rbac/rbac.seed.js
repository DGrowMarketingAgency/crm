import { pool } from '../../config/db.js';
import { PERMISSION_REGISTRY, DEFAULT_SYSTEM_ROLES } from './rbac.registry.js';

/**
 * Idempotently seeds system roles, registry permissions, and default mappings
 * @param {import('mysql2/promise').Pool} [db=pool]
 */
export async function seedRbac(db = pool) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Seed Permissions idempotently
    for (const perm of PERMISSION_REGISTRY) {
      await connection.query(
        `INSERT INTO permissions (permission_key, module, action, description)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           module = VALUES(module),
           action = VALUES(action),
           description = VALUES(description)`,
        [perm.key, perm.module, perm.action, perm.description]
      );
    }

    // 2. Fetch all permission IDs keyed by permission_key
    const [allPerms] = await connection.query('SELECT id, permission_key FROM permissions');
    const permMap = new Map();
    allPerms.forEach((p) => permMap.set(p.permission_key, p.id));

    // 3. Seed Default System Roles
    for (const r of DEFAULT_SYSTEM_ROLES) {
      await connection.query(
        `INSERT INTO roles (name, slug, description, is_system)
         VALUES (?, ?, ?, TRUE)
         ON DUPLICATE KEY UPDATE
           description = VALUES(description),
           is_system = TRUE`,
        [r.name, r.slug, r.description]
      );

      // Get role ID
      const [roleRows] = await connection.query('SELECT id FROM roles WHERE slug = ?', [r.slug]);
      const roleId = roleRows[0].id;

      // Determine permission IDs to associate
      let targetPermIds = [];
      if (r.allPermissions) {
        targetPermIds = allPerms.map((p) => p.id);
      } else if (r.permissionKeys) {
        targetPermIds = r.permissionKeys
          .map((k) => permMap.get(k))
          .filter(Boolean);
      }

      // Associate permissions for system role idempotently
      for (const pId of targetPermIds) {
        await connection.query(
          `INSERT IGNORE INTO role_permissions (role_id, permission_id)
           VALUES (?, ?)`,
          [roleId, pId]
        );
      }
    }

    // 4. Ensure any existing users with role = 'owner' have Owner role assigned in user_roles
    const [ownerRole] = await connection.query("SELECT id FROM roles WHERE slug = 'owner'");
    if (ownerRole.length > 0) {
      const ownerRoleId = ownerRole[0].id;
      const [existingOwners] = await connection.query(
        "SELECT id FROM users WHERE role = 'owner'"
      );
      for (const ownerUser of existingOwners) {
        await connection.query(
          `INSERT IGNORE INTO user_roles (user_id, role_id)
           VALUES (?, ?)`,
          [ownerUser.id, ownerRoleId]
        );
      }
    }

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    console.error('❌ Failed to seed RBAC roles and permissions:', error.message);
    throw error;
  } finally {
    connection.release();
  }
}
