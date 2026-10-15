import { pool } from '../../config/db.js';
import { ProjectsPolicy } from '../projects/projects.policy.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

export class TimeService {
  /**
   * Helper to check if user has admin/owner privileges
   */
  static isGlobalAdmin(user) {
    if (!user) return false;
    if (user.role === 'owner') return true;
    if (user.roles && Array.isArray(user.roles)) {
      return user.roles.some((r) => ['owner', 'admin'].includes(r.slug));
    }
    return false;
  }

  // ==========================================
  // ACTIVE TIMERS
  // ==========================================

  /**
   * Starts a task timer for the user
   */
  static async startTimer(userId, { taskId, description }, user, req = null) {
    // 1. Validate task existence and project access
    const [taskRows] = await pool.query(
      `SELECT t.id, t.title, t.task_code, t.project_id, t.status, t.is_archived,
              p.name as project_name
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       WHERE t.id = ?`,
      [taskId]
    );

    if (taskRows.length === 0) {
      const err = new Error('Task not found');
      err.status = 404;
      throw err;
    }

    const task = taskRows[0];
    if (task.is_archived) {
      const err = new Error('Cannot track time against an archived task');
      err.status = 400;
      throw err;
    }

    // Verify project access
    const canAccess = await ProjectsPolicy.canAccessProject(task.project_id, user);
    if (!canAccess) {
      const err = new Error('Access denied: You do not have access to this project or task');
      err.status = 403;
      throw err;
    }

    // 2. Concurrency safeguard: Verify user does not already have an active timer
    const [existing] = await pool.query(
      `SELECT at.*, t.task_code, t.title as task_title
       FROM active_timers at
       JOIN tasks t ON at.task_id = t.id
       WHERE at.user_id = ?`,
      [userId]
    );

    if (existing.length > 0) {
      const err = new Error(
        `You already have an active timer running on task ${existing[0].task_code || `#${existing[0].task_id}`}. Please stop your running timer first.`
      );
      err.status = 400;
      err.activeTimer = existing[0];
      throw err;
    }

    // 3. Insert active timer transactionally
    const [result] = await pool.query(
      `INSERT INTO active_timers (user_id, task_id, started_at, status, description)
       VALUES (?, ?, NOW(), 'running', ?)`,
      [userId, taskId, description || null]
    );

    const timerId = result.insertId;

    // 4. Audit logging
    await AuditService.log({
      actorId: user.id,
      action: 'timer.started',
      entityType: 'active_timer',
      entityId: timerId,
      details: { taskId, project_id: task.project_id, description },
      req
    });

    return {
      id: timerId,
      userId: Number(userId),
      taskId: Number(taskId),
      taskTitle: task.title,
      taskCode: task.task_code,
      projectId: Number(task.project_id),
      projectName: task.project_name,
      startedAt: new Date().toISOString(),
      status: 'running',
      description: description || null
    };
  }

  /**
   * Stops an active timer and records a draft time entry
   */
  static async stopTimer(timerId, userId, { description, isBillable = true }, user, req = null) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Lock active timer row
      const [timerRows] = await conn.query(
        `SELECT at.*, t.project_id, t.title as task_title, t.task_code
         FROM active_timers at
         JOIN tasks t ON at.task_id = t.id
         WHERE at.id = ? FOR UPDATE`,
        [timerId]
      );

      if (timerRows.length === 0) {
        const err = new Error('Active timer not found');
        err.status = 404;
        throw err;
      }

      const timer = timerRows[0];

      // 2. Ownership check
      if (timer.user_id !== Number(userId) && !this.isGlobalAdmin(user)) {
        const err = new Error('Access denied: You cannot stop another user’s timer');
        err.status = 403;
        throw err;
      }

      // 3. Compute elapsed duration using server timestamps
      const now = new Date();
      const startedAt = new Date(timer.started_at);
      const diffMs = Math.max(0, now.getTime() - startedAt.getTime());
      const durationMinutes = Math.max(1, Math.round(diffMs / 60000));
      const workDate = now.toISOString().slice(0, 10);
      const finalDescription = description !== undefined ? description : timer.description;

      // 4. Insert time entry
      const [entryRes] = await conn.query(
        `INSERT INTO time_entries (
           user_id, project_id, task_id, work_date, started_at, ended_at,
           duration_minutes, description, entry_type, is_billable, approval_status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'timer', ?, 'draft')`,
        [
          timer.user_id,
          timer.project_id,
          timer.task_id,
          workDate,
          timer.started_at,
          now,
          durationMinutes,
          finalDescription || null,
          isBillable ? 1 : 0
        ]
      );

      const timeEntryId = entryRes.insertId;

      // 5. Remove active timer
      await conn.query('DELETE FROM active_timers WHERE id = ?', [timerId]);

      await conn.commit();

      // 6. Audit logging
      await AuditService.log({
        actorId: user.id,
        action: 'timer.stopped',
        entityType: 'time_entry',
        entityId: timeEntryId,
        details: { timerId, durationMinutes, taskId: timer.task_id, isBillable },
        req
      });

      return {
        id: timeEntryId,
        userId: Number(timer.user_id),
        projectId: Number(timer.project_id),
        taskId: Number(timer.task_id),
        taskTitle: timer.task_title,
        taskCode: timer.task_code,
        workDate,
        durationMinutes,
        description: finalDescription || null,
        entryType: 'timer',
        isBillable: Boolean(isBillable),
        approvalStatus: 'draft'
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Retrieves the current user's active running timer
   */
  static async getActiveTimer(userId) {
    const [rows] = await pool.query(
      `SELECT at.id, at.user_id, at.task_id, at.started_at, at.status, at.description,
              t.title as task_title, t.task_code, p.id as project_id, p.name as project_name
       FROM active_timers at
       JOIN tasks t ON at.task_id = t.id
       JOIN projects p ON t.project_id = p.id
       WHERE at.user_id = ?`,
      [userId]
    );

    if (rows.length === 0) return null;

    const row = rows[0];
    const startedAt = new Date(row.started_at);
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));

    return {
      id: row.id,
      userId: Number(row.user_id),
      taskId: Number(row.task_id),
      taskTitle: row.task_title,
      taskCode: row.task_code,
      projectId: Number(row.project_id),
      projectName: row.project_name,
      startedAt: row.started_at,
      status: row.status,
      description: row.description,
      elapsedSeconds
    };
  }

  /**
   * Retrieves a specific timer by ID
   */
  static async getTimerById(timerId, user) {
    const [rows] = await pool.query(
      `SELECT at.*, t.title as task_title, t.task_code, p.id as project_id, p.name as project_name
       FROM active_timers at
       JOIN tasks t ON at.task_id = t.id
       JOIN projects p ON t.project_id = p.id
       WHERE at.id = ?`,
      [timerId]
    );

    if (rows.length === 0) {
      const err = new Error('Timer not found');
      err.status = 404;
      throw err;
    }

    const timer = rows[0];
    if (timer.user_id !== user.id && !this.isGlobalAdmin(user)) {
      const err = new Error('Access denied: You cannot view this timer');
      err.status = 403;
      throw err;
    }

    return timer;
  }

  // ==========================================
  // TIME ENTRIES (WORK LOGS)
  // ==========================================

  /**
   * Retrieves paginated time entries with filters
   */
  static async getTimeEntries(query, user) {
    const {
      userId,
      projectId,
      taskId,
      startDate,
      endDate,
      approvalStatus,
      isBillable,
      page = 1,
      limit = 20
    } = query;

    const where = ['te.deleted_at IS NULL'];
    const params = [];

    // Ownership & permission boundary
    const canViewAll = this.isGlobalAdmin(user) || user.permissions?.includes('time_entries.view_all');
    if (!canViewAll) {
      where.push('te.user_id = ?');
      params.push(user.id);
    } else if (userId) {
      where.push('te.user_id = ?');
      params.push(userId);
    }

    if (projectId) {
      where.push('te.project_id = ?');
      params.push(projectId);
    }

    if (taskId) {
      where.push('te.task_id = ?');
      params.push(taskId);
    }

    if (startDate) {
      where.push('te.work_date >= ?');
      params.push(startDate);
    }

    if (endDate) {
      where.push('te.work_date <= ?');
      params.push(endDate);
    }

    if (approvalStatus) {
      where.push('te.approval_status = ?');
      params.push(approvalStatus);
    }

    if (isBillable !== undefined) {
      where.push('te.is_billable = ?');
      params.push(isBillable === 'true' || isBillable === true ? 1 : 0);
    }

    const whereSql = where.join(' AND ');

    // Count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total FROM time_entries te WHERE ${whereSql}`,
      params
    );
    const total = countRows[0].total;

    // Fetch entries
    const offset = (Number(page) - 1) * Number(limit);
    const [rows] = await pool.query(
      `SELECT te.*,
              u.name as user_name, u.email as user_email,
              t.title as task_title, t.task_code,
              p.name as project_name, p.project_code as project_code,
              ts.status as timesheet_status
       FROM time_entries te
       JOIN users u ON te.user_id = u.id
       JOIN tasks t ON te.task_id = t.id
       JOIN projects p ON te.project_id = p.id
       LEFT JOIN timesheets ts ON te.timesheet_id = ts.id
       WHERE ${whereSql}
       ORDER BY te.work_date DESC, te.id DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );

    return {
      entries: rows,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit))
      }
    };
  }

  /**
   * Retrieves a single time entry by ID
   */
  static async getTimeEntryById(entryId, user) {
    const [rows] = await pool.query(
      `SELECT te.*,
              u.name as user_name, u.email as user_email,
              t.title as task_title, t.task_code,
              p.name as project_name, p.project_code as project_code
       FROM time_entries te
       JOIN users u ON te.user_id = u.id
       JOIN tasks t ON te.task_id = t.id
       JOIN projects p ON te.project_id = p.id
       WHERE te.id = ? AND te.deleted_at IS NULL`,
      [entryId]
    );

    if (rows.length === 0) {
      const err = new Error('Time entry not found');
      err.status = 404;
      throw err;
    }

    const entry = rows[0];
    const canViewAll = this.isGlobalAdmin(user) || user.permissions?.includes('time_entries.view_all');
    if (entry.user_id !== user.id && !canViewAll) {
      const err = new Error('Access denied: You cannot view this time entry');
      err.status = 403;
      throw err;
    }

    return entry;
  }

  /**
   * Records a manual time entry
   */
  static async createTimeEntry(userId, data, user, req = null) {
    const {
      taskId,
      workDate,
      durationMinutes,
      description,
      isBillable = true,
      startedAt = null,
      endedAt = null
    } = data;

    // 1. Verify task existence and project access
    const [taskRows] = await pool.query(
      `SELECT t.id, t.title, t.task_code, t.project_id, t.is_archived
       FROM tasks t
       WHERE t.id = ?`,
      [taskId]
    );

    if (taskRows.length === 0) {
      const err = new Error('Task not found');
      err.status = 404;
      throw err;
    }

    const task = taskRows[0];
    if (task.is_archived) {
      const err = new Error('Cannot log time against an archived task');
      err.status = 400;
      throw err;
    }

    const canAccess = await ProjectsPolicy.canAccessProject(task.project_id, user);
    if (!canAccess) {
      const err = new Error('Access denied: You do not have access to this project or task');
      err.status = 403;
      throw err;
    }

    // 2. Insert time entry
    const [result] = await pool.query(
      `INSERT INTO time_entries (
         user_id, project_id, task_id, work_date, started_at, ended_at,
         duration_minutes, description, entry_type, is_billable, approval_status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, 'draft')`,
      [
        userId,
        task.project_id,
        taskId,
        workDate,
        startedAt,
        endedAt,
        durationMinutes,
        description || null,
        isBillable ? 1 : 0
      ]
    );

    const entryId = result.insertId;

    // 3. Audit logging
    await AuditService.log({
      actorId: user.id,
      action: 'time_entry.created',
      entityType: 'time_entry',
      entityId: entryId,
      details: { taskId, workDate, durationMinutes, isBillable },
      req
    });

    return this.getTimeEntryById(entryId, user);
  }

  /**
   * Updates an existing time entry (only draft entries can be modified)
   */
  static async updateTimeEntry(entryId, data, user, req = null) {
    const [rows] = await pool.query(
      'SELECT * FROM time_entries WHERE id = ? AND deleted_at IS NULL',
      [entryId]
    );

    if (rows.length === 0) {
      const err = new Error('Time entry not found');
      err.status = 404;
      throw err;
    }

    const entry = rows[0];

    // Ownership / authorization
    const canManageAll = this.isGlobalAdmin(user) || user.permissions?.includes('time_entries.manage_all');
    if (entry.user_id !== user.id && !canManageAll) {
      const err = new Error('Access denied: You cannot edit another user’s time entry');
      err.status = 403;
      throw err;
    }

    // Critical workflow protection: submitted and approved entries cannot be edited
    if (['submitted', 'approved'].includes(entry.approval_status)) {
      const err = new Error(
        `Cannot edit a ${entry.approval_status} time entry. The timesheet must be rejected or revised first.`
      );
      err.status = 400;
      throw err;
    }

    const updates = [];
    const params = [];

    if (data.workDate !== undefined) {
      updates.push('work_date = ?');
      params.push(data.workDate);
    }
    if (data.durationMinutes !== undefined) {
      updates.push('duration_minutes = ?');
      params.push(data.durationMinutes);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      params.push(data.description || null);
    }
    if (data.isBillable !== undefined) {
      updates.push('is_billable = ?');
      params.push(data.isBillable ? 1 : 0);
    }

    if (updates.length > 0) {
      params.push(entryId);
      await pool.query(
        `UPDATE time_entries SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
    }

    // Audit logging
    await AuditService.log({
      actorId: user.id,
      action: 'time_entry.updated',
      entityType: 'time_entry',
      entityId: entryId,
      details: data,
      req
    });

    return this.getTimeEntryById(entryId, user);
  }

  /**
   * Deletes a draft time entry (soft delete)
   */
  static async deleteTimeEntry(entryId, user, req = null) {
    const [rows] = await pool.query(
      'SELECT * FROM time_entries WHERE id = ? AND deleted_at IS NULL',
      [entryId]
    );

    if (rows.length === 0) {
      const err = new Error('Time entry not found');
      err.status = 404;
      throw err;
    }

    const entry = rows[0];

    const canManageAll = this.isGlobalAdmin(user) || user.permissions?.includes('time_entries.manage_all');
    if (entry.user_id !== user.id && !canManageAll) {
      const err = new Error('Access denied: You cannot delete another user’s time entry');
      err.status = 403;
      throw err;
    }

    if (['submitted', 'approved'].includes(entry.approval_status)) {
      const err = new Error(
        `Cannot delete a ${entry.approval_status} time entry.`
      );
      err.status = 400;
      throw err;
    }

    await pool.query('UPDATE time_entries SET deleted_at = NOW() WHERE id = ?', [entryId]);

    // Audit logging
    await AuditService.log({
      actorId: user.id,
      action: 'time_entry.deleted',
      entityType: 'time_entry',
      entityId: entryId,
      details: { taskId: entry.task_id, durationMinutes: entry.duration_minutes },
      req
    });

    return { success: true, message: 'Time entry deleted successfully' };
  }

  // ==========================================
  // TIMESHEETS
  // ==========================================

  /**
   * Retrieves list of timesheets with summary stats
   */
  static async getTimesheets(query, user) {
    const { userId, status, page = 1, limit = 20 } = query;

    const where = [];
    const params = [];

    const canViewTeam =
      this.isGlobalAdmin(user) ||
      user.permissions?.includes('timesheets.view_team') ||
      user.permissions?.includes('timesheets.manage_all');

    if (!canViewTeam) {
      where.push('ts.user_id = ?');
      params.push(user.id);
    } else if (userId) {
      where.push('ts.user_id = ?');
      params.push(userId);
    }

    if (status) {
      where.push('ts.status = ?');
      params.push(status);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total FROM timesheets ts ${whereSql}`,
      params
    );
    const total = countRows[0].total;

    const offset = (Number(page) - 1) * Number(limit);
    const [rows] = await pool.query(
      `SELECT ts.*,
              u.name as user_name, u.email as user_email,
              r.name as reviewer_name, r.email as reviewer_email,
              COALESCE(SUM(te.duration_minutes), 0) as total_minutes,
              COALESCE(SUM(CASE WHEN te.is_billable = 1 THEN te.duration_minutes ELSE 0 END), 0) as billable_minutes,
              COUNT(te.id) as entry_count
       FROM timesheets ts
       JOIN users u ON ts.user_id = u.id
       LEFT JOIN users r ON ts.reviewed_by = r.id
       LEFT JOIN time_entries te ON ts.id = te.timesheet_id AND te.deleted_at IS NULL
       ${whereSql}
       GROUP BY ts.id
       ORDER BY ts.period_start DESC, ts.id DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );

    return {
      timesheets: rows,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit))
      }
    };
  }

  /**
   * Retrieves a timesheet by ID along with its associated entries
   */
  static async getTimesheetById(timesheetId, user) {
    const [rows] = await pool.query(
      `SELECT ts.*,
              u.name as user_name, u.email as user_email,
              r.name as reviewer_name, r.email as reviewer_email
       FROM timesheets ts
       JOIN users u ON ts.user_id = u.id
       LEFT JOIN users r ON ts.reviewed_by = r.id
       WHERE ts.id = ?`,
      [timesheetId]
    );

    if (rows.length === 0) {
      const err = new Error('Timesheet not found');
      err.status = 404;
      throw err;
    }

    const timesheet = rows[0];

    const canViewTeam =
      this.isGlobalAdmin(user) ||
      user.permissions?.includes('timesheets.view_team') ||
      user.permissions?.includes('timesheets.manage_all');

    if (timesheet.user_id !== user.id && !canViewTeam) {
      const err = new Error('Access denied: You cannot view this timesheet');
      err.status = 403;
      throw err;
    }

    // Fetch linked time entries
    const [entries] = await pool.query(
      `SELECT te.*,
              t.title as task_title, t.task_code,
              p.name as project_name, p.project_code as project_code
       FROM time_entries te
       JOIN tasks t ON te.task_id = t.id
       JOIN projects p ON te.project_id = p.id
       WHERE te.timesheet_id = ? AND te.deleted_at IS NULL
       ORDER BY te.work_date ASC, te.id ASC`,
      [timesheetId]
    );

    let totalMinutes = 0;
    let billableMinutes = 0;
    entries.forEach((e) => {
      totalMinutes += Number(e.duration_minutes || 0);
      if (e.is_billable) billableMinutes += Number(e.duration_minutes || 0);
    });

    return {
      ...timesheet,
      totalMinutes,
      totalHours: Number((totalMinutes / 60).toFixed(2)),
      billableMinutes,
      billableHours: Number((billableMinutes / 60).toFixed(2)),
      nonBillableHours: Number(((totalMinutes - billableMinutes) / 60).toFixed(2)),
      entries
    };
  }

  /**
   * Creates a timesheet for a reporting period and links eligible draft time entries
   */
  static async createTimesheet(userId, { periodStart, periodEnd }, user, req = null) {
    // 1. Verify period doesn't overlap with existing timesheets for user
    const [overlap] = await pool.query(
      `SELECT id FROM timesheets
       WHERE user_id = ?
         AND (
           (period_start BETWEEN ? AND ?) OR
           (period_end BETWEEN ? AND ?) OR
           (? BETWEEN period_start AND period_end)
         )`,
      [userId, periodStart, periodEnd, periodStart, periodEnd, periodStart]
    );

    if (overlap.length > 0) {
      const err = new Error(
        `A timesheet already exists covering the dates ${periodStart} to ${periodEnd}`
      );
      err.status = 400;
      throw err;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 2. Insert timesheet
      const [res] = await conn.query(
        `INSERT INTO timesheets (user_id, period_start, period_end, status)
         VALUES (?, ?, ?, 'draft')`,
        [userId, periodStart, periodEnd]
      );
      const timesheetId = res.insertId;

      // 3. Associate eligible draft time entries in that period
      await conn.query(
        `UPDATE time_entries
         SET timesheet_id = ?
         WHERE user_id = ?
           AND work_date BETWEEN ? AND ?
           AND timesheet_id IS NULL
           AND deleted_at IS NULL`,
        [timesheetId, userId, periodStart, periodEnd]
      );

      await conn.commit();

      // 4. Audit log
      await AuditService.log({
        actorId: user.id,
        action: 'timesheet.created',
        entityType: 'timesheet',
        entityId: timesheetId,
        details: { periodStart, periodEnd },
        req
      });

      return this.getTimesheetById(timesheetId, user);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Submits a timesheet for manager review
   */
  static async submitTimesheet(timesheetId, user, req = null) {
    const [rows] = await pool.query('SELECT * FROM timesheets WHERE id = ?', [timesheetId]);
    if (rows.length === 0) {
      const err = new Error('Timesheet not found');
      err.status = 404;
      throw err;
    }

    const timesheet = rows[0];
    if (timesheet.user_id !== user.id && !this.isGlobalAdmin(user)) {
      const err = new Error('Access denied: You can only submit your own timesheets');
      err.status = 403;
      throw err;
    }

    if (!['draft', 'rejected'].includes(timesheet.status)) {
      const err = new Error(`Cannot submit a timesheet with status '${timesheet.status}'`);
      err.status = 400;
      throw err;
    }

    // Verify timesheet has logged work
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as count, SUM(duration_minutes) as total
       FROM time_entries
       WHERE timesheet_id = ? AND deleted_at IS NULL`,
      [timesheetId]
    );

    if (countRows[0].count === 0 || countRows[0].total === 0) {
      const err = new Error('Cannot submit an empty timesheet without any logged time entries');
      err.status = 400;
      throw err;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(
        `UPDATE timesheets
         SET status = 'submitted', submitted_at = NOW(), reviewer_comment = NULL
         WHERE id = ?`,
        [timesheetId]
      );

      await conn.query(
        `UPDATE time_entries
         SET approval_status = 'submitted'
         WHERE timesheet_id = ? AND deleted_at IS NULL`,
        [timesheetId]
      );

      await conn.commit();

      await AuditService.log({
        actorId: user.id,
        action: 'timesheet.submitted',
        entityType: 'timesheet',
        entityId: timesheetId,
        details: { periodStart: timesheet.period_start, periodEnd: timesheet.period_end },
        req
      });

      return this.getTimesheetById(timesheetId, user);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Approves a submitted timesheet
   */
  static async approveTimesheet(timesheetId, user, req = null) {
    const [rows] = await pool.query('SELECT * FROM timesheets WHERE id = ?', [timesheetId]);
    if (rows.length === 0) {
      const err = new Error('Timesheet not found');
      err.status = 404;
      throw err;
    }

    const timesheet = rows[0];

    // Self-approval prohibition: user cannot approve their own timesheet unless Owner
    if (timesheet.user_id === user.id && !this.isGlobalAdmin(user)) {
      const err = new Error(
        'Self-approval is prohibited: Another authorized manager must approve this timesheet'
      );
      err.status = 403;
      throw err;
    }

    if (timesheet.status !== 'submitted') {
      const err = new Error(`Cannot approve a timesheet with status '${timesheet.status}'. Must be 'submitted'.`);
      err.status = 400;
      throw err;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(
        `UPDATE timesheets
         SET status = 'approved', reviewed_by = ?, reviewed_at = NOW()
         WHERE id = ?`,
        [user.id, timesheetId]
      );

      await conn.query(
        `UPDATE time_entries
         SET approval_status = 'approved'
         WHERE timesheet_id = ? AND deleted_at IS NULL`,
        [timesheetId]
      );

      await conn.commit();

      // Audit log
      await AuditService.log({
        actorId: user.id,
        action: 'timesheet.approved',
        entityType: 'timesheet',
        entityId: timesheetId,
        details: { submittedBy: timesheet.user_id },
        req
      });

      // Notify submitter
      await NotificationsService.createNotification({
        recipientUserId: timesheet.user_id,
        actorUserId: user.id,
        type: 'approval_decision',
        title: 'Timesheet Approved',
        message: `Your timesheet for period ${timesheet.period_start.toISOString?.().slice(0, 10) || timesheet.period_start} to ${timesheet.period_end.toISOString?.().slice(0, 10) || timesheet.period_end} has been approved.`,
        entityType: 'timesheet',
        entityId: timesheetId,
        actionUrl: `/timesheets/${timesheetId}`
      });

      return this.getTimesheetById(timesheetId, user);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Rejects a submitted timesheet with explanation
   */
  static async rejectTimesheet(timesheetId, reviewerComment, user, req = null) {
    const [rows] = await pool.query('SELECT * FROM timesheets WHERE id = ?', [timesheetId]);
    if (rows.length === 0) {
      const err = new Error('Timesheet not found');
      err.status = 404;
      throw err;
    }

    const timesheet = rows[0];

    if (timesheet.status !== 'submitted') {
      const err = new Error(`Cannot reject a timesheet with status '${timesheet.status}'. Must be 'submitted'.`);
      err.status = 400;
      throw err;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(
        `UPDATE timesheets
         SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW(), reviewer_comment = ?
         WHERE id = ?`,
        [user.id, reviewerComment, timesheetId]
      );

      await conn.query(
        `UPDATE time_entries
         SET approval_status = 'rejected'
         WHERE timesheet_id = ? AND deleted_at IS NULL`,
        [timesheetId]
      );

      await conn.commit();

      // Audit log
      await AuditService.log({
        actorId: user.id,
        action: 'timesheet.rejected',
        entityType: 'timesheet',
        entityId: timesheetId,
        details: { submittedBy: timesheet.user_id, comment: reviewerComment },
        req
      });

      // Notify submitter
      await NotificationsService.createNotification({
        recipientUserId: timesheet.user_id,
        actorUserId: user.id,
        type: 'approval_decision',
        title: 'Timesheet Revisions Requested',
        message: `Your timesheet was rejected with feedback: "${reviewerComment}". Please correct the entries and resubmit.`,
        entityType: 'timesheet',
        entityId: timesheetId,
        actionUrl: `/timesheets/${timesheetId}`
      });

      return this.getTimesheetById(timesheetId, user);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // ==========================================
  // SUMMARIES & REPORTS
  // ==========================================

  /**
   * Generates aggregated time statistics (hours, billable, approval breakdown)
   */
  static async getSummary(query, user) {
    const { userId, projectId, startDate, endDate } = query;

    const where = ['te.deleted_at IS NULL'];
    const params = [];

    const canViewAll = this.isGlobalAdmin(user) || user.permissions?.includes('time_reports.view');
    if (!canViewAll) {
      where.push('te.user_id = ?');
      params.push(user.id);
    } else if (userId) {
      where.push('te.user_id = ?');
      params.push(userId);
    }

    if (projectId) {
      where.push('te.project_id = ?');
      params.push(projectId);
    }

    if (startDate) {
      where.push('te.work_date >= ?');
      params.push(startDate);
    }

    if (endDate) {
      where.push('te.work_date <= ?');
      params.push(endDate);
    }

    const whereSql = where.join(' AND ');

    const [rows] = await pool.query(
      `SELECT
         COALESCE(SUM(te.duration_minutes), 0) as total_minutes,
         COALESCE(SUM(CASE WHEN te.is_billable = 1 THEN te.duration_minutes ELSE 0 END), 0) as billable_minutes,
         COALESCE(SUM(CASE WHEN te.is_billable = 0 THEN te.duration_minutes ELSE 0 END), 0) as non_billable_minutes,
         COALESCE(SUM(CASE WHEN te.approval_status = 'approved' THEN te.duration_minutes ELSE 0 END), 0) as approved_minutes,
         COALESCE(SUM(CASE WHEN te.approval_status = 'submitted' THEN te.duration_minutes ELSE 0 END), 0) as submitted_minutes,
         COALESCE(SUM(CASE WHEN te.approval_status = 'draft' THEN te.duration_minutes ELSE 0 END), 0) as draft_minutes,
         COALESCE(SUM(CASE WHEN te.approval_status = 'rejected' THEN te.duration_minutes ELSE 0 END), 0) as rejected_minutes,
         COUNT(te.id) as total_entries
       FROM time_entries te
       WHERE ${whereSql}`,
      params
    );

    const stats = rows[0];
    const totalMinutes = Number(stats.total_minutes);
    const billableMinutes = Number(stats.billable_minutes);
    const nonBillableMinutes = Number(stats.non_billable_minutes);
    const approvedMinutes = Number(stats.approved_minutes);
    const submittedMinutes = Number(stats.submitted_minutes);
    const draftMinutes = Number(stats.draft_minutes);
    const rejectedMinutes = Number(stats.rejected_minutes);

    return {
      totalEntries: Number(stats.total_entries),
      totalMinutes,
      totalHours: Number((totalMinutes / 60).toFixed(2)),
      billableMinutes,
      billableHours: Number((billableMinutes / 60).toFixed(2)),
      nonBillableMinutes,
      nonBillableHours: Number((nonBillableMinutes / 60).toFixed(2)),
      approvedHours: Number((approvedMinutes / 60).toFixed(2)),
      submittedHours: Number((submittedMinutes / 60).toFixed(2)),
      draftHours: Number((draftMinutes / 60).toFixed(2)),
      rejectedHours: Number((rejectedMinutes / 60).toFixed(2))
    };
  }

  /**
   * Retrieves project-level effort and task time breakdown
   */
  static async getProjectTimeSummary(projectId, user) {
    const canAccess = await ProjectsPolicy.canAccessProject(projectId, user);
    if (!canAccess) {
      const err = new Error('Access denied: You do not have access to this project');
      err.status = 403;
      throw err;
    }

    // 1. Project overall stats
    const [summaryRows] = await pool.query(
      `SELECT
         COALESCE(SUM(te.duration_minutes), 0) as total_minutes,
         COALESCE(SUM(CASE WHEN te.is_billable = 1 THEN te.duration_minutes ELSE 0 END), 0) as billable_minutes,
         COALESCE(SUM(CASE WHEN te.is_billable = 0 THEN te.duration_minutes ELSE 0 END), 0) as non_billable_minutes,
         COALESCE(SUM(CASE WHEN te.approval_status = 'approved' THEN te.duration_minutes ELSE 0 END), 0) as approved_minutes,
         COALESCE(SUM(CASE WHEN te.approval_status = 'submitted' THEN te.duration_minutes ELSE 0 END), 0) as pending_minutes,
         COUNT(DISTINCT te.user_id) as contributor_count
       FROM time_entries te
       WHERE te.project_id = ? AND te.deleted_at IS NULL`,
      [projectId]
    );

    const stats = summaryRows[0];
    const totalMinutes = Number(stats.total_minutes);
    const billableMinutes = Number(stats.billable_minutes);
    const nonBillableMinutes = Number(stats.non_billable_minutes);

    // 2. Task breakdown
    const [taskBreakdown] = await pool.query(
      `SELECT t.id as task_id, t.title as task_title, t.task_code, t.status as task_status,
              t.estimated_minutes,
              COALESCE(SUM(te.duration_minutes), 0) as logged_minutes,
              COALESCE(SUM(CASE WHEN te.is_billable = 1 THEN te.duration_minutes ELSE 0 END), 0) as billable_minutes
       FROM tasks t
       LEFT JOIN time_entries te ON t.id = te.task_id AND te.deleted_at IS NULL
       WHERE t.project_id = ? AND t.is_archived = 0
       GROUP BY t.id
       ORDER BY logged_minutes DESC`,
      [projectId]
    );

    return {
      projectId: Number(projectId),
      totalMinutes,
      totalHours: Number((totalMinutes / 60).toFixed(2)),
      billableHours: Number((billableMinutes / 60).toFixed(2)),
      nonBillableHours: Number((nonBillableMinutes / 60).toFixed(2)),
      approvedHours: Number((Number(stats.approved_minutes) / 60).toFixed(2)),
      pendingHours: Number((Number(stats.pending_minutes) / 60).toFixed(2)),
      contributorCount: Number(stats.contributor_count),
      tasks: taskBreakdown.map((t) => ({
        taskId: t.task_id,
        taskCode: t.task_code,
        taskTitle: t.task_title,
        taskStatus: t.task_status,
        estimatedHours: t.estimated_minutes ? Number((t.estimated_minutes / 60).toFixed(2)) : 0,
        loggedHours: Number((Number(t.logged_minutes) / 60).toFixed(2)),
        billableHours: Number((Number(t.billable_minutes) / 60).toFixed(2))
      }))
    };
  }

  /**
   * Retrieves task-level time summary and recent entries
   */
  static async getTaskTimeSummary(taskId, user) {
    const [taskRows] = await pool.query(
      'SELECT id, title, task_code, project_id, estimated_minutes FROM tasks WHERE id = ?',
      [taskId]
    );

    if (taskRows.length === 0) {
      const err = new Error('Task not found');
      err.status = 404;
      throw err;
    }

    const task = taskRows[0];
    const canAccess = await ProjectsPolicy.canAccessProject(task.project_id, user);
    if (!canAccess) {
      const err = new Error('Access denied: You do not have access to this task');
      err.status = 403;
      throw err;
    }

    const [summaryRows] = await pool.query(
      `SELECT
         COALESCE(SUM(te.duration_minutes), 0) as total_minutes,
         COALESCE(SUM(CASE WHEN te.is_billable = 1 THEN te.duration_minutes ELSE 0 END), 0) as billable_minutes,
         COALESCE(SUM(CASE WHEN te.is_billable = 0 THEN te.duration_minutes ELSE 0 END), 0) as non_billable_minutes,
         COUNT(te.id) as entry_count
       FROM time_entries te
       WHERE te.task_id = ? AND te.deleted_at IS NULL`,
      [taskId]
    );

    const stats = summaryRows[0];
    const totalMinutes = Number(stats.total_minutes);
    const billableMinutes = Number(stats.billable_minutes);

    const [recentEntries] = await pool.query(
      `SELECT te.*, u.name as user_name
       FROM time_entries te
       JOIN users u ON te.user_id = u.id
       WHERE te.task_id = ? AND te.deleted_at IS NULL
       ORDER BY te.work_date DESC, te.id DESC
       LIMIT 10`,
      [taskId]
    );

    return {
      taskId: Number(taskId),
      taskTitle: task.title,
      taskCode: task.task_code,
      estimatedMinutes: task.estimated_minutes || 0,
      estimatedHours: task.estimated_minutes ? Number((task.estimated_minutes / 60).toFixed(2)) : 0,
      totalMinutes,
      totalHours: Number((totalMinutes / 60).toFixed(2)),
      billableHours: Number((billableMinutes / 60).toFixed(2)),
      entryCount: Number(stats.entry_count),
      recentEntries
    };
  }
}
