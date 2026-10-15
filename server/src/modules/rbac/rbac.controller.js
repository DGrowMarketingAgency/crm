import { RbacService } from './rbac.service.js';
import { resolveUserPermissions } from '../../middleware/authorize.js';
import { AuditService } from '../audit/audit.service.js';

export class RbacController {
  static async getPermissions(req, res, next) {
    try {
      const permissions = await RbacService.getAllPermissions();
      res.status(200).json({ success: true, permissions });
    } catch (err) {
      next(err);
    }
  }

  static async getGroupedPermissions(req, res, next) {
    try {
      const grouped = await RbacService.getGroupedPermissions();
      res.status(200).json({ success: true, modules: grouped });
    } catch (err) {
      next(err);
    }
  }

  static async getRoles(req, res, next) {
    try {
      const roles = await RbacService.getRoles();
      res.status(200).json({ success: true, roles });
    } catch (err) {
      next(err);
    }
  }

  static async getRole(req, res, next) {
    try {
      const role = await RbacService.getRoleById(req.params.id);
      res.status(200).json({ success: true, role });
    } catch (err) {
      next(err);
    }
  }

  static async createRole(req, res, next) {
    try {
      const role = await RbacService.createRole(req.body, req.user.id, req);
      res.status(201).json({ success: true, role });
    } catch (err) {
      next(err);
    }
  }

  static async updateRole(req, res, next) {
    try {
      const role = await RbacService.updateRole(req.params.id, req.body, req.user.id, req);
      res.status(200).json({ success: true, role });
    } catch (err) {
      next(err);
    }
  }

  static async deleteRole(req, res, next) {
    try {
      await RbacService.deleteRole(req.params.id, req.user.id, req);
      res.status(200).json({ success: true, message: 'Role deleted successfully' });
    } catch (err) {
      next(err);
    }
  }

  static async getRolePermissions(req, res, next) {
    try {
      const permissions = await RbacService.getRolePermissions(req.params.id);
      res.status(200).json({ success: true, permissions });
    } catch (err) {
      next(err);
    }
  }

  static async setRolePermissions(req, res, next) {
    try {
      const result = await RbacService.setRolePermissions(
        req.params.id,
        req.body.permissionIds,
        req.user,
        req
      );
      res.status(200).json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getUserRoles(req, res, next) {
    try {
      const result = await RbacService.getUserRoles(req.params.id);
      res.status(200).json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async setUserRoles(req, res, next) {
    try {
      const result = await RbacService.setUserRoles(
        req.params.id,
        req.body.roleIds,
        req.user,
        req
      );
      res.status(200).json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getCurrentUserPermissions(req, res, next) {
    try {
      const { roles, permissions, isOwner } = await resolveUserPermissions(req.user.id);
      res.status(200).json({
        success: true,
        user: {
          id: req.user.id,
          name: req.user.name,
          email: req.user.email,
          isOwner
        },
        roles,
        permissions
      });
    } catch (err) {
      next(err);
    }
  }

  static async getAuditLogs(req, res, next) {
    try {
      const logs = await AuditService.getLogs(req.query.limit || 50, req.query.offset || 0);
      res.status(200).json({ success: true, logs });
    } catch (err) {
      next(err);
    }
  }
}
