import { pool } from '../../config/db.js';
import { AuditService } from '../audit/audit.service.js';
import { ProjectsPolicy } from '../projects/projects.policy.js';
import { WorkflowEngineService } from '../automation/workflow-engine.service.js';

export class MilestonesService {
  /**
   * Retrieves all milestones for a project
   */
  static async listMilestones(projectId, actorUser) {
    await ProjectsPolicy.enforceAccess(projectId, actorUser);

    const [milestones] = await pool.query(
      `SELECT m.id, m.project_id, m.title, m.description, m.due_date,
              m.status, m.display_order, m.completed_at, m.created_at, m.updated_at,
              u.name as creator_name
       FROM project_milestones m
       LEFT JOIN users u ON m.created_by = u.id
       WHERE m.project_id = ?
       ORDER BY m.display_order ASC, m.due_date ASC, m.id ASC`,
      [projectId]
    );

    return milestones;
  }

  /**
   * Creates a new milestone for a project
   */
  static async createMilestone(projectId, data, actorUser, req = null) {
    await ProjectsPolicy.enforceManage(projectId, actorUser);

    // Auto-compute display order if not specified
    let displayOrder = data.displayOrder;
    if (displayOrder === undefined || displayOrder === null) {
      const [maxRow] = await pool.query(
        'SELECT COALESCE(MAX(display_order), 0) as max_order FROM project_milestones WHERE project_id = ?',
        [projectId]
      );
      displayOrder = (maxRow[0]?.max_order || 0) + 1;
    }

    const isCompleted = data.status === 'completed';
    const completedAt = isCompleted ? new Date() : null;

    const [result] = await pool.query(
      `INSERT INTO project_milestones (
        project_id, title, description, due_date, status, display_order, completed_at, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        projectId,
        data.title.trim(),
        data.description || null,
        data.dueDate || null,
        data.status || 'pending',
        displayOrder,
        completedAt,
        actorUser.id
      ]
    );

    const newMilestoneId = result.insertId;

    await AuditService.log({
      actorId: actorUser.id,
      action: 'milestone.created',
      entityType: 'milestone',
      entityId: newMilestoneId,
      details: {
        projectId: Number(projectId),
        title: data.title.trim(),
        dueDate: data.dueDate,
        status: data.status
      },
      req
    });

    const [rows] = await pool.query(
      'SELECT * FROM project_milestones WHERE id = ?',
      [newMilestoneId]
    );
    return rows[0];
  }

  /**
   * Updates an existing milestone
   */
  static async updateMilestone(projectId, milestoneId, data, actorUser, req = null) {
    await ProjectsPolicy.enforceManage(projectId, actorUser);

    const [existing] = await pool.query(
      'SELECT * FROM project_milestones WHERE id = ? AND project_id = ?',
      [milestoneId, projectId]
    );
    if (existing.length === 0) {
      const error = new Error('Milestone not found in this project');
      error.status = 404;
      error.code = 'MILESTONE_NOT_FOUND';
      throw error;
    }

    const current = existing[0];
    const newTitle = data.title !== undefined ? data.title.trim() : current.title;
    const newDesc = data.description !== undefined ? data.description : current.description;
    const newDue = data.dueDate !== undefined ? data.dueDate : current.due_date;
    const newOrder = data.displayOrder !== undefined ? data.displayOrder : current.display_order;
    const newStatus = data.status || current.status;

    let newCompletedAt = current.completed_at;
    if (newStatus === 'completed' && current.status !== 'completed') {
      newCompletedAt = new Date();
    } else if (newStatus !== 'completed' && current.status === 'completed') {
      newCompletedAt = null;
    }

    await pool.query(
      `UPDATE project_milestones
       SET title = ?, description = ?, due_date = ?, status = ?,
           display_order = ?, completed_at = ?
       WHERE id = ? AND project_id = ?`,
      [newTitle, newDesc, newDue, newStatus, newOrder, newCompletedAt, milestoneId, projectId]
    );

    await AuditService.log({
      actorId: actorUser.id,
      action: 'milestone.updated',
      entityType: 'milestone',
      entityId: milestoneId,
      details: {
        projectId: Number(projectId),
        previousStatus: current.status,
        newStatus
      },
      req
    });

    // Trigger C — Milestone Activation
    if (newStatus === 'in_progress' && current.status !== 'in_progress') {
      try {
        await WorkflowEngineService.onMilestoneActivated(milestoneId, actorUser, req);
      } catch (autoErr) {
        console.error('Trigger C milestone workflow activation error:', autoErr);
      }
    }

    const [updatedRows] = await pool.query(
      'SELECT * FROM project_milestones WHERE id = ?',
      [milestoneId]
    );
    return updatedRows[0];
  }

  /**
   * Changes milestone status
   */
  static async changeMilestoneStatus(projectId, milestoneId, newStatus, actorUser, req = null) {
    return this.updateMilestone(projectId, milestoneId, { status: newStatus }, actorUser, req);
  }

  /**
   * Deletes a milestone
   */
  static async deleteMilestone(projectId, milestoneId, actorUser, req = null) {
    await ProjectsPolicy.enforceManage(projectId, actorUser);

    const [existing] = await pool.query(
      'SELECT id, title FROM project_milestones WHERE id = ? AND project_id = ?',
      [milestoneId, projectId]
    );
    if (existing.length === 0) {
      const error = new Error('Milestone not found in this project');
      error.status = 404;
      error.code = 'MILESTONE_NOT_FOUND';
      throw error;
    }

    await pool.query('DELETE FROM project_milestones WHERE id = ? AND project_id = ?', [
      milestoneId,
      projectId
    ]);

    await AuditService.log({
      actorId: actorUser.id,
      action: 'milestone.deleted',
      entityType: 'milestone',
      entityId: milestoneId,
      details: { projectId: Number(projectId), title: existing[0].title },
      req
    });

    return true;
  }

  /**
   * Reorders milestones transactionally
   */
  static async reorderMilestones(projectId, orders, actorUser, req = null) {
    await ProjectsPolicy.enforceManage(projectId, actorUser);

    const milestoneIds = orders.map((o) => o.id);
    const [existingRows] = await pool.query(
      'SELECT id FROM project_milestones WHERE project_id = ? AND id IN (?)',
      [projectId, milestoneIds]
    );

    if (existingRows.length !== milestoneIds.length) {
      const error = new Error('One or more milestones do not belong to this project');
      error.status = 400;
      error.code = 'INVALID_MILESTONE_REORDER';
      throw error;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      for (const item of orders) {
        await connection.query(
          'UPDATE project_milestones SET display_order = ? WHERE id = ? AND project_id = ?',
          [item.displayOrder, item.id, projectId]
        );
      }

      await AuditService.log({
        db: connection,
        actorId: actorUser.id,
        action: 'milestone.reordered',
        entityType: 'project',
        entityId: projectId,
        details: { count: orders.length },
        req
      });

      await connection.commit();
      return this.listMilestones(projectId, actorUser);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }
}
