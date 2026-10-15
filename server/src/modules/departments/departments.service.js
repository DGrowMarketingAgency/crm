import { pool } from '../../config/db.js';
import { AuditService } from '../audit/audit.service.js';

export class DepartmentsService {
  /**
   * Generates a clean normalized department code from its name
   */
  static generateCode(name) {
    return name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50);
  }

  /**
   * Retrieves paginated list of departments with member count and presets count
   */
  static async listDepartments({
    search = '',
    status = '',
    limit = 50,
    offset = 0
  }) {
    const params = [];
    const whereClauses = [];

    if (search.trim()) {
      whereClauses.push('(d.name LIKE ? OR d.code LIKE ? OR d.description LIKE ?)');
      const pattern = `%${search.trim()}%`;
      params.push(pattern, pattern, pattern);
    }

    if (status.trim()) {
      whereClauses.push('d.status = ?');
      params.push(status.trim());
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total FROM departments d ${whereSql}`,
      params
    );
    const total = Number(countRows[0].total);

    const [rows] = await pool.query(
      `SELECT d.id, d.name, d.code, d.description, d.status, d.manager_id,
              d.created_at, d.updated_at,
              u.name as manager_name, u.email as manager_email,
              COUNT(DISTINCT dm.user_id) as member_count,
              COUNT(DISTINCT wp.id) as preset_count
       FROM departments d
       LEFT JOIN users u ON d.manager_id = u.id
       LEFT JOIN department_members dm ON d.id = dm.department_id
       LEFT JOIN workflow_presets wp ON d.id = wp.department_id AND wp.status != 'archived'
       ${whereSql}
       GROUP BY d.id
       ORDER BY d.name ASC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );

    return {
      departments: rows.map((r) => ({
        ...r,
        member_count: Number(r.member_count),
        preset_count: Number(r.preset_count)
      })),
      total,
      limit: Number(limit),
      offset: Number(offset)
    };
  }

  /**
   * Fetches single department with full manager and metrics details
   */
  static async getDepartment(id) {
    const [rows] = await pool.query(
      `SELECT d.id, d.name, d.code, d.description, d.status, d.manager_id,
              d.created_at, d.updated_at,
              u.name as manager_name, u.email as manager_email,
              COUNT(DISTINCT dm.user_id) as member_count,
              COUNT(DISTINCT wp.id) as preset_count
       FROM departments d
       LEFT JOIN users u ON d.manager_id = u.id
       LEFT JOIN department_members dm ON d.id = dm.department_id
       LEFT JOIN workflow_presets wp ON d.id = wp.department_id AND wp.status != 'archived'
       WHERE d.id = ?
       GROUP BY d.id`,
      [id]
    );

    if (rows.length === 0) {
      const err = new Error(`Department with ID ${id} not found`);
      err.status = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    return {
      ...rows[0],
      member_count: Number(rows[0].member_count),
      preset_count: Number(rows[0].preset_count)
    };
  }

  /**
   * Creates a new department with normalized duplicate check
   */
  static async createDepartment({ name, code, description, manager_id, status = 'active' }, actorId, req = null) {
    const trimmedName = name.trim();
    const finalCode = (code && code.trim()) ? code.trim().toUpperCase() : this.generateCode(trimmedName);

    // 1. Check duplicate department name (case-insensitive normalization)
    const [nameDupes] = await pool.query(
      'SELECT id, name FROM departments WHERE LOWER(TRIM(name)) = LOWER(?)',
      [trimmedName]
    );
    if (nameDupes.length > 0) {
      const err = new Error(`A department with name "${trimmedName}" already exists`);
      err.status = 409;
      err.code = 'DUPLICATE_NAME';
      throw err;
    }

    // 2. Check duplicate department code
    const [codeDupes] = await pool.query(
      'SELECT id, code FROM departments WHERE UPPER(code) = ?',
      [finalCode]
    );
    if (codeDupes.length > 0) {
      const err = new Error(`A department with code "${finalCode}" already exists`);
      err.status = 409;
      err.code = 'DUPLICATE_CODE';
      throw err;
    }

    // 3. Validate manager if provided
    if (manager_id) {
      const [managerRows] = await pool.query(
        "SELECT id, name, status FROM users WHERE id = ? AND status = 'active'",
        [manager_id]
      );
      if (managerRows.length === 0) {
        const err = new Error(`Assigned manager user (ID: ${manager_id}) not found or inactive`);
        err.status = 400;
        err.code = 'INVALID_MANAGER';
        throw err;
      }
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [insertRes] = await connection.query(
        `INSERT INTO departments (name, code, description, manager_id, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [trimmedName, finalCode, description ? description.trim() : null, manager_id || null, status, actorId]
      );

      const deptId = insertRes.insertId;

      // If manager is provided, ensure manager is enrolled in department_members
      if (manager_id) {
        await connection.query(
          `INSERT INTO department_members (department_id, user_id, is_primary, role_in_department)
           VALUES (?, ?, TRUE, 'Department Manager')
           ON DUPLICATE KEY UPDATE role_in_department = 'Department Manager'`,
          [deptId, manager_id]
        );
      }

      await AuditService.log({
        actorId,
        action: 'department.create',
        entityType: 'department',
        entityId: deptId,
        details: { name: trimmedName, code: finalCode, manager_id, status },
        req
      });

      await connection.commit();
      return this.getDepartment(deptId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Updates existing department
   */
  static async updateDepartment(id, updates, actorId, req = null) {
    const existing = await this.getDepartment(id);
    const updatesApplied = {};

    if (updates.name !== undefined) {
      const trimmedName = updates.name.trim();
      if (trimmedName.toLowerCase() !== existing.name.toLowerCase()) {
        const [dupes] = await pool.query(
          'SELECT id FROM departments WHERE LOWER(TRIM(name)) = LOWER(?) AND id != ?',
          [trimmedName, id]
        );
        if (dupes.length > 0) {
          const err = new Error(`A department with name "${trimmedName}" already exists`);
          err.status = 409;
          err.code = 'DUPLICATE_NAME';
          throw err;
        }
      }
      updatesApplied.name = trimmedName;
    }

    if (updates.code !== undefined) {
      const finalCode = updates.code.trim().toUpperCase();
      if (finalCode !== existing.code) {
        const [codeDupes] = await pool.query(
          'SELECT id FROM departments WHERE UPPER(code) = ? AND id != ?',
          [finalCode, id]
        );
        if (codeDupes.length > 0) {
          const err = new Error(`A department with code "${finalCode}" already exists`);
          err.status = 409;
          err.code = 'DUPLICATE_CODE';
          throw err;
        }
      }
      updatesApplied.code = finalCode;
    }

    if (updates.description !== undefined) {
      updatesApplied.description = updates.description ? updates.description.trim() : null;
    }

    if (updates.status !== undefined) {
      updatesApplied.status = updates.status;
    }

    if (updates.manager_id !== undefined) {
      if (updates.manager_id !== null) {
        const [managerRows] = await pool.query(
          "SELECT id, name, status FROM users WHERE id = ? AND status = 'active'",
          [updates.manager_id]
        );
        if (managerRows.length === 0) {
          const err = new Error(`Assigned manager user (ID: ${updates.manager_id}) not found or inactive`);
          err.status = 400;
          err.code = 'INVALID_MANAGER';
          throw err;
        }
      }
      updatesApplied.manager_id = updates.manager_id;
    }

    if (Object.keys(updatesApplied).length === 0) {
      return existing;
    }

    const setClauses = [];
    const setParams = [];
    for (const [key, val] of Object.entries(updatesApplied)) {
      setClauses.push(`\`${key}\` = ?`);
      setParams.push(val);
    }
    setParams.push(id);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        `UPDATE departments SET ${setClauses.join(', ')} WHERE id = ?`,
        setParams
      );

      // If new manager assigned, ensure membership
      if (updatesApplied.manager_id) {
        await connection.query(
          `INSERT INTO department_members (department_id, user_id, is_primary, role_in_department)
           VALUES (?, ?, FALSE, 'Department Manager')
           ON DUPLICATE KEY UPDATE role_in_department = 'Department Manager'`,
          [id, updatesApplied.manager_id]
        );
      }

      await AuditService.log({
        actorId,
        action: 'department.update',
        entityType: 'department',
        entityId: id,
        details: { previous: existing, updated: updatesApplied },
        req
      });

      await connection.commit();
      return this.getDepartment(id);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Safely deletes or archives a department.
   * Prevents unsafe deletion if referenced by active workflows or tasks.
   */
  static async deleteOrArchiveDepartment(id, { forceArchive = false }, actorId, req = null) {
    const existing = await this.getDepartment(id);

    // 1. Check if department is referenced by active/published workflows
    const [wfRows] = await pool.query(
      "SELECT id, name, preset_code, status FROM workflow_presets WHERE department_id = ? AND status != 'archived'",
      [id]
    );

    // 2. Check if department is referenced by active tasks
    const [taskRows] = await pool.query(
      'SELECT id, title, task_code FROM tasks WHERE department_id = ? AND is_archived = FALSE',
      [id]
    );

    const hasActiveWorkflows = wfRows.length > 0;
    const hasActiveTasks = taskRows.length > 0;

    if (hasActiveWorkflows || hasActiveTasks) {
      // Hard deletion is prohibited to protect historical data integrity
      if (!forceArchive) {
        const err = new Error(
          `Cannot delete department "${existing.name}". It is referenced by ${wfRows.length} active workflow preset(s) and ${taskRows.length} active task(s). You can archive this department instead.`
        );
        err.status = 400;
        err.code = 'DEPARTMENT_IN_USE';
        err.references = {
          workflowPresetsCount: wfRows.length,
          activeTasksCount: taskRows.length
        };
        throw err;
      }

      // Archive department
      await pool.query(
        "UPDATE departments SET status = 'archived' WHERE id = ?",
        [id]
      );

      await AuditService.log({
        actorId,
        action: 'department.archive',
        entityType: 'department',
        entityId: id,
        details: { reason: 'Archived due to active references', name: existing.name },
        req
      });

      return {
        success: true,
        action: 'archived',
        message: `Department "${existing.name}" archived successfully.`
      };
    }

    // If no active workflows or tasks, we can either archive or remove
    if (forceArchive) {
      await pool.query("UPDATE departments SET status = 'archived' WHERE id = ?", [id]);
      await AuditService.log({
        actorId,
        action: 'department.archive',
        entityType: 'department',
        entityId: id,
        details: { name: existing.name },
        req
      });
      return { success: true, action: 'archived', message: `Department "${existing.name}" archived successfully.` };
    } else {
      await pool.query('DELETE FROM departments WHERE id = ?', [id]);
      await AuditService.log({
        actorId,
        action: 'department.delete',
        entityType: 'department',
        entityId: id,
        details: { name: existing.name },
        req
      });
      return { success: true, action: 'deleted', message: `Department "${existing.name}" deleted successfully.` };
    }
  }

  /**
   * Retrieves department members
   */
  static async getDepartmentMembers(departmentId) {
    await this.getDepartment(departmentId);

    const [members] = await pool.query(
      `SELECT dm.department_id, dm.user_id, dm.is_primary, dm.role_in_department, dm.joined_at,
              u.name, u.email, u.role, u.department as user_primary_dept, u.designations, u.status
       FROM department_members dm
       JOIN users u ON dm.user_id = u.id
       WHERE dm.department_id = ?
       ORDER BY dm.is_primary DESC, u.name ASC`,
      [departmentId]
    );

    return members;
  }

  /**
   * Adds an employee to a department
   */
  static async addDepartmentMember(departmentId, { userId, roleInDepartment = 'member', isPrimary = false }, actorId, req = null) {
    const dept = await this.getDepartment(departmentId);

    const [userRows] = await pool.query(
      "SELECT id, name, email, status FROM users WHERE id = ? AND status = 'active'",
      [userId]
    );
    if (userRows.length === 0) {
      const err = new Error(`User with ID ${userId} not found or inactive`);
      err.status = 404;
      err.code = 'USER_NOT_FOUND';
      throw err;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      if (isPrimary) {
        // Unset other primary department memberships if desired
        await connection.query(
          'UPDATE department_members SET is_primary = FALSE WHERE user_id = ?',
          [userId]
        );
      }

      await connection.query(
        `INSERT INTO department_members (department_id, user_id, is_primary, role_in_department)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           is_primary = VALUES(is_primary),
           role_in_department = VALUES(role_in_department)`,
        [departmentId, userId, Boolean(isPrimary), roleInDepartment.trim()]
      );

      await AuditService.log({
        actorId,
        action: 'department.member_add',
        entityType: 'department',
        entityId: departmentId,
        details: { userId, userName: userRows[0].name, roleInDepartment, isPrimary },
        req
      });

      await connection.commit();
      return this.getDepartmentMembers(departmentId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Removes an employee from a department
   */
  static async removeDepartmentMember(departmentId, userId, actorId, req = null) {
    await this.getDepartment(departmentId);

    const [existing] = await pool.query(
      'SELECT user_id FROM department_members WHERE department_id = ? AND user_id = ?',
      [departmentId, userId]
    );

    if (existing.length === 0) {
      const err = new Error('User is not a member of this department');
      err.status = 404;
      err.code = 'MEMBER_NOT_FOUND';
      throw err;
    }

    await pool.query(
      'DELETE FROM department_members WHERE department_id = ? AND user_id = ?',
      [departmentId, userId]
    );

    await AuditService.log({
      actorId,
      action: 'department.member_remove',
      entityType: 'department',
      entityId: departmentId,
      details: { userId },
      req
    });

    return { success: true, message: 'Member removed from department successfully.' };
  }

  /**
   * Retrieves active workflow presets configured for this department
   */
  static async getDepartmentPresets(departmentId) {
    await this.getDepartment(departmentId);

    const [presets] = await pool.query(
      `SELECT wp.id, wp.preset_code, wp.name, wp.description, wp.service_category,
              wp.workflow_type, wp.status, wp.current_version_id, wp.created_at, wp.updated_at,
              wpv.version_number, wpv.status as version_status, wpv.estimated_duration_days,
              COUNT(DISTINCT ws.id) as stage_count,
              COUNT(DISTINCT tt.id) as task_count
       FROM workflow_presets wp
       LEFT JOIN workflow_preset_versions wpv ON wp.current_version_id = wpv.id
       LEFT JOIN workflow_stages ws ON wpv.id = ws.preset_version_id
       LEFT JOIN task_templates tt ON wpv.id = tt.preset_version_id
       WHERE wp.department_id = ?
       GROUP BY wp.id
       ORDER BY wp.name ASC`,
      [departmentId]
    );

    return presets.map((p) => ({
      ...p,
      stage_count: Number(p.stage_count),
      task_count: Number(p.task_count)
    }));
  }
}
