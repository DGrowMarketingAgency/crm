import { pool } from '../../config/db.js';
import { AuditService } from '../audit/audit.service.js';

export class RbacService {
  /**
   * Retrieves all registered permissions
   */
  static async getAllPermissions() {
    const [rows] = await pool.query(
      'SELECT id, permission_key, module, action, description FROM permissions ORDER BY module, action'
    );
    return rows;
  }

  /**
   * Retrieves permissions grouped by module
   */
  static async getGroupedPermissions() {
    const permissions = await this.getAllPermissions();
    const grouped = {};

    permissions.forEach((perm) => {
      if (!grouped[perm.module]) {
        grouped[perm.module] = [];
      }
      grouped[perm.module].push(perm);
    });

    return grouped;
  }

  /**
   * Retrieves all roles with user count and permission count
   */
  static async getRoles() {
    const [roles] = await pool.query(`
      SELECT 
        r.id, 
        r.name, 
        r.slug, 
        r.description, 
        r.is_system, 
        r.created_at, 
        r.updated_at,
        COUNT(DISTINCT ur.user_id) AS user_count,
        COUNT(DISTINCT rp.permission_id) AS permission_count
      FROM roles r
      LEFT JOIN user_roles ur ON r.id = ur.role_id
      LEFT JOIN role_permissions rp ON r.id = rp.role_id
      GROUP BY r.id
      ORDER BY r.is_system DESC, r.name ASC
    `);

    return roles.map((r) => ({
      ...r,
      is_system: Boolean(r.is_system),
      user_count: Number(r.user_count),
      permission_count: Number(r.permission_count)
    }));
  }

  /**
   * Retrieves single role details by ID
   */
  static async getRoleById(roleId) {
    const [rows] = await pool.query(
      `SELECT id, name, slug, description, is_system, created_at, updated_at
       FROM roles
       WHERE id = ?`,
      [roleId]
    );

    if (rows.length === 0) {
      const error = new Error('Role not found');
      error.status = 404;
      error.code = 'ROLE_NOT_FOUND';
      throw error;
    }

    const role = rows[0];

    // Fetch assigned permissions
    const [permRows] = await pool.query(
      `SELECT p.id, p.permission_key, p.module, p.action, p.description
       FROM role_permissions rp
       JOIN permissions p ON rp.permission_id = p.id
       WHERE rp.role_id = ?
       ORDER BY p.module, p.action`,
      [roleId]
    );

    return {
      ...role,
      is_system: Boolean(role.is_system),
      permissions: permRows,
      permissionIds: permRows.map((p) => p.id)
    };
  }

  /**
   * Creates a new custom role
   */
  static async createRole({ name, slug, description }, actorId, req = null) {
    const trimmedName = name.trim();
    const finalSlug = (slug && slug.trim())
      ? slug.trim().toLowerCase()
      : trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    // Check unique name (case-insensitive)
    const [nameExists] = await pool.query(
      'SELECT id FROM roles WHERE LOWER(name) = LOWER(?)',
      [trimmedName]
    );
    if (nameExists.length > 0) {
      const error = new Error(`A role with name '${trimmedName}' already exists`);
      error.status = 409;
      error.code = 'ROLE_NAME_EXISTS';
      throw error;
    }

    // Check unique slug
    const [slugExists] = await pool.query(
      'SELECT id FROM roles WHERE slug = ?',
      [finalSlug]
    );
    if (slugExists.length > 0) {
      const error = new Error(`A role with slug '${finalSlug}' already exists`);
      error.status = 409;
      error.code = 'ROLE_SLUG_EXISTS';
      throw error;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [insertResult] = await connection.query(
        `INSERT INTO roles (name, slug, description, is_system, created_by)
         VALUES (?, ?, ?, FALSE, ?)`,
        [trimmedName, finalSlug, description || null, actorId]
      );

      const newRoleId = insertResult.insertId;

      await AuditService.log({
        db: connection,
        actorId,
        action: 'role.created',
        entityType: 'role',
        entityId: newRoleId,
        details: { name: trimmedName, slug: finalSlug, description },
        req
      });

      await connection.commit();

      return {
        id: newRoleId,
        name: trimmedName,
        slug: finalSlug,
        description: description || null,
        is_system: false
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Updates an existing role
   */
  static async updateRole(roleId, { name, description }, actorId, req = null) {
    const existing = await this.getRoleById(roleId);
    const trimmedName = name.trim();

    // Prevent renaming protected system roles
    if (existing.is_system && existing.name.toLowerCase() !== trimmedName.toLowerCase()) {
      const error = new Error('System role names cannot be renamed.');
      error.status = 403;
      error.code = 'SYSTEM_ROLE_PROTECTED';
      throw error;
    }

    // Check unique name across other roles
    const [nameExists] = await pool.query(
      'SELECT id FROM roles WHERE LOWER(name) = LOWER(?) AND id != ?',
      [trimmedName, roleId]
    );
    if (nameExists.length > 0) {
      const error = new Error(`Another role with name '${trimmedName}' already exists`);
      error.status = 409;
      error.code = 'ROLE_NAME_EXISTS';
      throw error;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        `UPDATE roles
         SET name = ?, description = ?
         WHERE id = ?`,
        [trimmedName, description || null, roleId]
      );

      await AuditService.log({
        db: connection,
        actorId,
        action: 'role.updated',
        entityType: 'role',
        entityId: roleId,
        details: {
          previous: { name: existing.name, description: existing.description },
          updated: { name: trimmedName, description }
        },
        req
      });

      await connection.commit();

      return {
        id: Number(roleId),
        name: trimmedName,
        slug: existing.slug,
        description: description || null,
        is_system: existing.is_system
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Deletes a custom role
   */
  static async deleteRole(roleId, actorId, req = null) {
    const existing = await this.getRoleById(roleId);

    if (existing.is_system) {
      const error = new Error('System roles cannot be deleted.');
      error.status = 403;
      error.code = 'CANNOT_DELETE_SYSTEM_ROLE';
      throw error;
    }

    // Check if any users currently have this role
    const [usersCount] = await pool.query(
      'SELECT COUNT(*) as count FROM user_roles WHERE role_id = ?',
      [roleId]
    );

    if (usersCount[0].count > 0) {
      const error = new Error(`Cannot delete role '${existing.name}'. It is currently assigned to ${usersCount[0].count} user(s).`);
      error.status = 409;
      error.code = 'ROLE_IN_USE';
      throw error;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query('DELETE FROM roles WHERE id = ?', [roleId]);

      await AuditService.log({
        db: connection,
        actorId,
        action: 'role.deleted',
        entityType: 'role',
        entityId: roleId,
        details: { name: existing.name, slug: existing.slug },
        req
      });

      await connection.commit();
      return true;
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Gets assigned permissions for a role
   */
  static async getRolePermissions(roleId) {
    const role = await this.getRoleById(roleId);
    return role.permissions;
  }

  /**
   * Replaces the selected role's complete permission set transactionally
   */
  static async setRolePermissions(roleId, permissionIds, actorUser, req = null) {
    const role = await this.getRoleById(roleId);

    // Safeguard 1: Owner role has immutable all-permissions
    if (role.slug === 'owner') {
      const error = new Error('The Owner role has immutable system permissions and cannot be modified.');
      error.status = 403;
      error.code = 'OWNER_PERMISSIONS_IMMUTABLE';
      throw error;
    }

    // Safeguard 2: Ordinary admins cannot modify system role permissions
    if (role.is_system && !actorUser.isOwner) {
      const error = new Error('Ordinary administrators cannot modify system-role permissions.');
      error.status = 403;
      error.code = 'SYSTEM_ROLE_PROTECTED';
      throw error;
    }

    // Validate that all permission IDs exist in registry
    if (permissionIds.length > 0) {
      const [existingPerms] = await pool.query(
        'SELECT id FROM permissions WHERE id IN (?)',
        [permissionIds]
      );
      if (existingPerms.length !== permissionIds.length) {
        const error = new Error('One or more selected permission IDs are invalid.');
        error.status = 400;
        error.code = 'INVALID_PERMISSIONS';
        throw error;
      }
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Clear existing mappings
      await connection.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);

      // Insert new mappings
      if (permissionIds.length > 0) {
        const values = permissionIds.map((pId) => [roleId, pId, actorUser.id]);
        await connection.query(
          `INSERT INTO role_permissions (role_id, permission_id, granted_by)
           VALUES ?`,
          [values]
        );
      }

      await AuditService.log({
        db: connection,
        actorId: actorUser.id,
        action: 'role.permissions_updated',
        entityType: 'role',
        entityId: roleId,
        details: { roleName: role.name, assignedCount: permissionIds.length, permissionIds },
        req
      });

      await connection.commit();

      return {
        roleId: Number(roleId),
        permissionIds,
        assignedCount: permissionIds.length
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Retrieves roles assigned to a user
   */
  static async getUserRoles(userId) {
    const [userRows] = await pool.query('SELECT id, name, email, status FROM users WHERE id = ?', [userId]);
    if (userRows.length === 0) {
      const error = new Error('User not found');
      error.status = 404;
      error.code = 'USER_NOT_FOUND';
      throw error;
    }

    const [roles] = await pool.query(
      `SELECT r.id, r.name, r.slug, r.is_system, ur.assigned_at
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id = ?`,
      [userId]
    );

    return {
      user: userRows[0],
      roles: roles.map((r) => ({ ...r, is_system: Boolean(r.is_system) }))
    };
  }

  /**
   * Sets role assignments for a user with Owner protection & privilege escalation safeguards
   */
  static async setUserRoles(targetUserId, requestedRoleIds, actorUser, req = null) {
    const [userRows] = await pool.query('SELECT id, name, email, status FROM users WHERE id = ?', [targetUserId]);
    if (userRows.length === 0) {
      const error = new Error('User not found');
      error.status = 404;
      error.code = 'USER_NOT_FOUND';
      throw error;
    }
    const targetUser = userRows[0];

    // Fetch existing roles for target user
    const [currentRoles] = await pool.query(
      `SELECT r.id, r.slug FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id = ?`,
      [targetUserId]
    );
    const wasOwner = currentRoles.some((r) => r.slug === 'owner');

    // Fetch requested role records
    let requestedRoles = [];
    if (requestedRoleIds.length > 0) {
      const [rRows] = await pool.query(
        'SELECT id, name, slug, is_system FROM roles WHERE id IN (?)',
        [requestedRoleIds]
      );
      if (rRows.length !== requestedRoleIds.length) {
        const error = new Error('One or more requested role IDs do not exist.');
        error.status = 400;
        error.code = 'INVALID_ROLE_IDS';
        throw error;
      }
      requestedRoles = rRows;
    }
    const willBeOwner = requestedRoles.some((r) => r.slug === 'owner');

    // SAFEGUARD 1: Privilege Escalation Prevention
    // Only an existing Owner can grant Owner privileges to any user!
    if (willBeOwner && !wasOwner && !actorUser.isOwner) {
      const error = new Error('Privilege escalation denied: Ordinary administrators cannot grant Owner privileges.');
      error.status = 403;
      error.code = 'OWNER_ESCALATION_DENIED';
      throw error;
    }

    // SAFEGUARD 2: Removing Owner role from an Owner
    if (wasOwner && !willBeOwner) {
      if (!actorUser.isOwner) {
        const error = new Error('Ordinary administrators cannot remove Owner privileges.');
        error.status = 403;
        error.code = 'FORBIDDEN';
        throw error;
      }

      // Check how many active Owners remain in the system
      const [ownerCount] = await pool.query(
        `SELECT COUNT(DISTINCT ur.user_id) as active_owner_count
         FROM user_roles ur
         JOIN roles r ON ur.role_id = r.id
         JOIN users u ON ur.user_id = u.id
         WHERE r.slug = 'owner' AND u.status = 'active'`
      );

      if (ownerCount[0].active_owner_count <= 1) {
        const error = new Error('Cannot remove the last active Owner from the system.');
        error.status = 403;
        error.code = 'CANNOT_REMOVE_LAST_OWNER';
        throw error;
      }
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Clear existing user roles
      await connection.query('DELETE FROM user_roles WHERE user_id = ?', [targetUserId]);

      // Assign new roles
      if (requestedRoleIds.length > 0) {
        const values = requestedRoleIds.map((rId) => [targetUserId, rId, actorUser.id]);
        await connection.query(
          `INSERT INTO user_roles (user_id, role_id, assigned_by)
           VALUES ?`,
          [values]
        );
      }

      // Sync users.role column
      const primaryRole = willBeOwner ? 'owner' : (requestedRoles[0]?.slug || 'member');
      await connection.query('UPDATE users SET role = ? WHERE id = ?', [primaryRole, targetUserId]);

      await AuditService.log({
        db: connection,
        actorId: actorUser.id,
        action: 'user.roles_updated',
        entityType: 'user',
        entityId: targetUserId,
        details: {
          targetEmail: targetUser.email,
          previousRoleIds: currentRoles.map((r) => r.id),
          newRoleIds: requestedRoleIds
        },
        req
      });

      await connection.commit();

      return {
        userId: Number(targetUserId),
        roles: requestedRoles
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }
}
