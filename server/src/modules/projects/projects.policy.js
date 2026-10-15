import { pool } from '../../config/db.js';

export class ProjectsPolicy {
  /**
   * Checks if a user has global admin access (Owner or Admin role)
   */
  static isGlobalAdmin(user) {
    if (!user) return false;
    if (user.role === 'owner') return true;
    if (user.roles && Array.isArray(user.roles)) {
      return user.roles.some((r) => ['owner', 'admin'].includes(r.slug));
    }
    return false;
  }

  /**
   * Verifies if a user can view / access a specific project
   */
  static async canAccessProject(projectId, user) {
    if (this.isGlobalAdmin(user)) return true;

    // Check 1: User is designated project manager
    const [pmCheck] = await pool.query(
      'SELECT id FROM projects WHERE id = ? AND project_manager_id = ?',
      [projectId, user.id]
    );
    if (pmCheck.length > 0) return true;

    // Check 2: User is in project_members
    const [memberCheck] = await pool.query(
      'SELECT project_id FROM project_members WHERE project_id = ? AND user_id = ?',
      [projectId, user.id]
    );
    if (memberCheck.length > 0) return true;

    // Check 3: User is member of an assigned team
    const [teamCheck] = await pool.query(
      `SELECT pt.project_id
       FROM project_teams pt
       JOIN team_members tm ON pt.team_id = tm.team_id
       WHERE pt.project_id = ? AND tm.user_id = ?`,
      [projectId, user.id]
    );
    if (teamCheck.length > 0) return true;

    // Check 4: User is linked client
    const [clientCheck] = await pool.query(
      `SELECT p.id
       FROM projects p
       JOIN clients c ON p.client_id = c.id
       WHERE p.id = ? AND (c.user_id = ? OR c.email = ? OR c.id = ?)`,
      [projectId, user.id, user.email, user.client_id || 0]
    );
    if (clientCheck.length > 0) return true;

    return false;
  }

  /**
   * Verifies if a user can modify a project (update metadata, status, members, milestones)
   */
  static async canManageProject(projectId, user) {
    if (this.isGlobalAdmin(user)) return true;

    // Project manager of this project can manage
    const [pmCheck] = await pool.query(
      'SELECT id FROM projects WHERE id = ? AND project_manager_id = ?',
      [projectId, user.id]
    );
    return pmCheck.length > 0;
  }

  /**
   * Enforces project access or throws 403 Forbidden
   */
  static async enforceAccess(projectId, user) {
    const hasAccess = await this.canAccessProject(projectId, user);
    if (!hasAccess) {
      const error = new Error('You do not have permission to access this project');
      error.status = 403;
      error.code = 'PROJECT_ACCESS_DENIED';
      throw error;
    }
  }

  /**
   * Enforces management access or throws 403 Forbidden
   */
  static async enforceManage(projectId, user) {
    const canManage = await this.canManageProject(projectId, user);
    if (!canManage) {
      const error = new Error('Only project managers and administrators can manage this project');
      error.status = 403;
      error.code = 'PROJECT_MANAGE_DENIED';
      throw error;
    }
  }
}
