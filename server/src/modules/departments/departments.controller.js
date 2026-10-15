import { DepartmentsService } from './departments.service.js';

export class DepartmentsController {
  /**
   * Helper to verify if actor is department manager or organization admin/owner
   */
  static async checkDepartmentManageAccess(req, departmentId) {
    if (req.user?.isOwner) return true;
    if (req.user?.permissions?.includes('departments.manage_members') || req.user?.permissions?.includes('departments.update')) {
      return true;
    }
    // Check if user is the assigned manager of this department
    const dept = await DepartmentsService.getDepartment(departmentId);
    if (dept.manager_id && Number(dept.manager_id) === Number(req.user.id)) {
      return true;
    }
    const err = new Error('Access denied: You are not authorized to manage this department.');
    err.status = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }

  static async listDepartments(req, res, next) {
    try {
      const { search, status, limit, offset } = req.query;
      const result = await DepartmentsService.listDepartments({
        search: search || '',
        status: status || '',
        limit: limit ? Number(limit) : 50,
        offset: offset ? Number(offset) : 0
      });
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async getDepartment(req, res, next) {
    try {
      const { id } = req.params;
      const dept = await DepartmentsService.getDepartment(Number(id));
      res.status(200).json({ success: true, data: dept });
    } catch (err) {
      next(err);
    }
  }

  static async createDepartment(req, res, next) {
    try {
      const dept = await DepartmentsService.createDepartment(req.body, req.user.id, req);
      res.status(201).json({
        success: true,
        message: 'Department created successfully.',
        data: dept
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateDepartment(req, res, next) {
    try {
      const { id } = req.params;
      await DepartmentsController.checkDepartmentManageAccess(req, Number(id));
      const dept = await DepartmentsService.updateDepartment(Number(id), req.body, req.user.id, req);
      res.status(200).json({
        success: true,
        message: 'Department updated successfully.',
        data: dept
      });
    } catch (err) {
      next(err);
    }
  }

  static async deleteDepartment(req, res, next) {
    try {
      const { id } = req.params;
      const forceArchive = req.query.archive === 'true';
      const result = await DepartmentsService.deleteOrArchiveDepartment(
        Number(id),
        { forceArchive },
        req.user.id,
        req
      );
      res.status(200).json({
        success: true,
        message: result.message,
        action: result.action
      });
    } catch (err) {
      next(err);
    }
  }

  static async getDepartmentMembers(req, res, next) {
    try {
      const { id } = req.params;
      const members = await DepartmentsService.getDepartmentMembers(Number(id));
      res.status(200).json({ success: true, data: members });
    } catch (err) {
      next(err);
    }
  }

  static async addDepartmentMember(req, res, next) {
    try {
      const { id } = req.params;
      await DepartmentsController.checkDepartmentManageAccess(req, Number(id));
      const members = await DepartmentsService.addDepartmentMember(Number(id), req.body, req.user.id, req);
      res.status(200).json({
        success: true,
        message: 'Employee assigned to department successfully.',
        data: members
      });
    } catch (err) {
      next(err);
    }
  }

  static async removeDepartmentMember(req, res, next) {
    try {
      const { id, userId } = req.params;
      await DepartmentsController.checkDepartmentManageAccess(req, Number(id));
      const result = await DepartmentsService.removeDepartmentMember(Number(id), Number(userId), req.user.id, req);
      res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (err) {
      next(err);
    }
  }

  static async getDepartmentPresets(req, res, next) {
    try {
      const { id } = req.params;
      const presets = await DepartmentsService.getDepartmentPresets(Number(id));
      res.status(200).json({ success: true, data: presets });
    } catch (err) {
      next(err);
    }
  }
}
