import { pool } from '../config/db.js';

/**
 * Resolves user's effective roles and permissions from the database
 * @param {number} userId
 * @returns {Promise<{ roles: Array<{ id: number, name: string, slug: string, is_system: boolean }>, permissions: string[], isOwner: boolean }>}
 */
export async function resolveUserPermissions(userId) {
  // 1. Fetch user status and roles
  const [roleRows] = await pool.query(
    `SELECT r.id, r.name, r.slug, r.is_system
     FROM user_roles ur
     JOIN roles r ON ur.role_id = r.id
     WHERE ur.user_id = ?`,
    [userId]
  );

  const roles = roleRows;
  const isOwner = roles.some((r) => r.slug === 'owner');

  if (isOwner) {
    // Owner has unrestricted access to all active permissions
    const [allPermRows] = await pool.query('SELECT permission_key FROM permissions');
    const allPerms = allPermRows.map((p) => p.permission_key);
    return {
      roles,
      permissions: allPerms,
      isOwner: true
    };
  }

  // 2. Fetch permissions through assigned roles
  if (roles.length === 0) {
    return {
      roles: [],
      permissions: [],
      isOwner: false
    };
  }

  const roleIds = roles.map((r) => r.id);
  const [permRows] = await pool.query(
    `SELECT DISTINCT p.permission_key
     FROM role_permissions rp
     JOIN permissions p ON rp.permission_id = p.id
     WHERE rp.role_id IN (?)`,
    [roleIds]
  );

  const permissions = permRows.map((p) => p.permission_key);

  return {
    roles,
    permissions,
    isOwner: false
  };
}

/**
 * Middleware requiring a specific granular permission
 * @param {string} permissionKey
 */
export function requirePermission(permissionKey) {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          success: false,
          error: {
            message: 'Authentication required. No valid session found.',
            code: 'UNAUTHORIZED'
          }
        });
      }

      // Check account status directly
      const [users] = await pool.query(
        'SELECT status FROM users WHERE id = ?',
        [req.user.id]
      );

      if (users.length === 0 || users[0].status !== 'active') {
        return res.status(403).json({
          success: false,
          error: {
            message: 'Your account is inactive or suspended.',
            code: 'ACCOUNT_NOT_ACTIVE'
          }
        });
      }

      const { roles, permissions, isOwner } = await resolveUserPermissions(req.user.id);
      req.user.roles = roles;
      req.user.permissions = permissions;
      req.user.isOwner = isOwner;

      if (isOwner || permissions.includes(permissionKey)) {
        return next();
      }

      return res.status(403).json({
        success: false,
        error: {
          message: `Access denied. You do not have the required permission: '${permissionKey}'.`,
          code: 'FORBIDDEN',
          requiredPermission: permissionKey
        }
      });
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware requiring ANY of the provided permissions
 * @param {string[]} permissionKeys
 */
export function requireAnyPermission(permissionKeys) {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          success: false,
          error: {
            message: 'Authentication required.',
            code: 'UNAUTHORIZED'
          }
        });
      }

      const { roles, permissions, isOwner } = await resolveUserPermissions(req.user.id);
      req.user.roles = roles;
      req.user.permissions = permissions;
      req.user.isOwner = isOwner;

      if (isOwner || permissionKeys.some((k) => permissions.includes(k))) {
        return next();
      }

      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied. Insufficient permissions.',
          code: 'FORBIDDEN',
          requiredAny: permissionKeys
        }
      });
    } catch (error) {
      next(error);
    }
  };
}
