import { pool } from '../../config/db.js';
import { AuditService } from '../audit/audit.service.js';
import { ProjectsPolicy } from './projects.policy.js';
import { WorkflowEngineService } from '../automation/workflow-engine.service.js';

export class ProjectsService {
  /**
   * Builds the WHERE clause restricting projects to those accessible by the actorUser
   */
  static getAccessFilterSql(actorUser, tableAlias = 'p') {
    if (ProjectsPolicy.isGlobalAdmin(actorUser)) {
      return { clause: '1=1', params: [] };
    }

    const clause = `(
      ${tableAlias}.project_manager_id = ?
      OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = ${tableAlias}.id AND pm.user_id = ?)
      OR EXISTS (SELECT 1 FROM project_teams pt JOIN team_members tm ON pt.team_id = tm.team_id WHERE pt.project_id = ${tableAlias}.id AND tm.user_id = ?)
      OR EXISTS (SELECT 1 FROM clients c WHERE c.id = ${tableAlias}.client_id AND (c.user_id = ? OR c.email = ? OR c.id = ?))
    )`;

    return {
      clause,
      params: [actorUser.id, actorUser.id, actorUser.id, actorUser.id, actorUser.email, actorUser.client_id || 0]
    };
  }

  /**
   * Retrieves paginated projects list with filters and access scoping
   */
  static async listProjects(
    {
      search = '',
      status = '',
      priority = '',
      clientId = '',
      managerId = '',
      teamId = '',
      isArchived = false,
      sortBy = 'created_at',
      sortOrder = 'desc',
      limit = 20,
      offset = 0
    },
    actorUser
  ) {
    const access = this.getAccessFilterSql(actorUser, 'p');
    const whereClauses = [access.clause];
    const params = [...access.params];

    // Archive filter
    whereClauses.push('p.is_archived = ?');
    params.push(isArchived === 'true' || isArchived === true ? 1 : 0);

    if (search.trim()) {
      whereClauses.push('(p.name LIKE ? OR p.project_code LIKE ? OR p.description LIKE ?)');
      params.push(`%${search.trim()}%`, `%${search.trim()}%`, `%${search.trim()}%`);
    }

    if (status.trim()) {
      whereClauses.push('p.status = ?');
      params.push(status.trim());
    }

    if (priority.trim()) {
      whereClauses.push('p.priority = ?');
      params.push(priority.trim());
    }

    if (clientId) {
      whereClauses.push('p.client_id = ?');
      params.push(Number(clientId));
    }

    if (managerId) {
      whereClauses.push('p.project_manager_id = ?');
      params.push(Number(managerId));
    }

    if (teamId) {
      whereClauses.push('EXISTS (SELECT 1 FROM project_teams pt WHERE pt.project_id = p.id AND pt.team_id = ?)');
      params.push(Number(teamId));
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

    // Total count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total FROM projects p ${whereSql}`,
      params
    );
    const total = Number(countRows[0].total);

    // Sorting safe whitelist
    const sortFieldMap = {
      name: 'p.name',
      due_date: 'p.due_date',
      created_at: 'p.created_at',
      priority: 'FIELD(p.priority, "urgent", "high", "medium", "low")'
    };
    const orderCol = sortFieldMap[sortBy] || 'p.created_at';
    const direction = String(sortOrder).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Fetch projects
    const [projects] = await pool.query(
      `SELECT p.id, p.name, p.project_code, p.description, p.status, p.priority,
              p.visibility, p.start_date, p.due_date, p.completed_at, p.is_archived,
              p.created_at, p.updated_at,
              c.id as client_id, c.name as client_name, c.company_name as client_company,
              u.id as manager_id, u.name as manager_name, u.email as manager_email,
              COUNT(DISTINCT pt.team_id) as team_count,
              COUNT(DISTINCT pm.user_id) as member_count,
              COUNT(DISTINCT pms.id) as total_milestones,
              SUM(CASE WHEN pms.status = 'completed' THEN 1 ELSE 0 END) as completed_milestones
       FROM projects p
       LEFT JOIN clients c ON p.client_id = c.id
       LEFT JOIN users u ON p.project_manager_id = u.id
       LEFT JOIN project_teams pt ON p.id = pt.project_id
       LEFT JOIN project_members pm ON p.id = pm.project_id
       LEFT JOIN project_milestones pms ON p.id = pms.project_id
       ${whereSql}
       GROUP BY p.id
       ORDER BY ${orderCol} ${direction}
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );

    // Compute health indicator & milestone completion percentage for each project
    const now = new Date();
    const formattedProjects = projects.map((proj) => {
      const totalM = Number(proj.total_milestones || 0);
      const compM = Number(proj.completed_milestones || 0);
      const milestoneProgress = totalM > 0 ? Math.round((compM / totalM) * 100) : 0;

      let health = 'on_track';
      if (proj.status === 'completed') {
        health = 'completed';
      } else if (proj.status === 'cancelled') {
        health = 'cancelled';
      } else if (proj.due_date) {
        const dueDate = new Date(proj.due_date);
        const diffDays = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
          health = 'delayed';
        } else if (diffDays <= 7 && milestoneProgress < 80) {
          health = 'at_risk';
        }
      }

      return {
        ...proj,
        team_count: Number(proj.team_count),
        member_count: Number(proj.member_count),
        total_milestones: totalM,
        completed_milestones: compM,
        milestone_progress: milestoneProgress,
        health
      };
    });

    return {
      projects: formattedProjects,
      total,
      limit: Number(limit),
      offset: Number(offset)
    };
  }

  /**
   * Retrieves single project with all relations and authorization check
   */
  static async getProjectById(projectId, actorUser) {
    const [rows] = await pool.query(
      `SELECT p.id, p.name, p.project_code, p.project_manager_id, p.client_id,
              p.workflow_preset_id, p.workflow_preset_version_id, p.service_instance_id,
              p.description, p.status, p.priority,
              p.visibility, p.start_date, p.due_date, p.completed_at, p.is_archived,
              p.archived_at, p.objectives, p.notes, p.created_at, p.updated_at,
              c.id as client_id, c.name as client_name, c.company_name as client_company, c.email as client_email,
              u.id as manager_id, u.name as manager_name, u.email as manager_email,
              wp.name as workflow_preset_name, wp.preset_code as workflow_preset_code,
              wpv.version_number as workflow_preset_version_number
       FROM projects p
       LEFT JOIN clients c ON p.client_id = c.id
       LEFT JOIN users u ON p.project_manager_id = u.id
       LEFT JOIN workflow_presets wp ON p.workflow_preset_id = wp.id
       LEFT JOIN workflow_preset_versions wpv ON p.workflow_preset_version_id = wpv.id
       WHERE p.id = ?`,
      [projectId]
    );

    if (rows.length === 0) {
      const error = new Error('Project not found');
      error.status = 404;
      error.code = 'PROJECT_NOT_FOUND';
      throw error;
    }

    const project = rows[0];

    // Enforce resource-level authorization
    await ProjectsPolicy.enforceAccess(projectId, actorUser);

    // Fetch assigned teams
    const [teams] = await pool.query(
      `SELECT t.id, t.name, t.description, t.status, t.leader_id,
              u.name as leader_name,
              COUNT(DISTINCT tm.user_id) as member_count
       FROM project_teams pt
       JOIN teams t ON pt.team_id = t.id
       LEFT JOIN users u ON t.leader_id = u.id
       LEFT JOIN team_members tm ON t.id = tm.team_id
       WHERE pt.project_id = ?
       GROUP BY t.id
       ORDER BY t.name ASC`,
      [projectId]
    );

    // Fetch members
    const [members] = await pool.query(
      `SELECT pm.user_id, pm.project_role, pm.joined_at,
              u.name, u.email, u.status as user_status, u.role as primary_role
       FROM project_members pm
       JOIN users u ON pm.user_id = u.id
       WHERE pm.project_id = ?
       ORDER BY (pm.project_role = 'manager') DESC, u.name ASC`,
      [projectId]
    );

    // Fetch milestone summary
    const [milestones] = await pool.query(
      `SELECT id, title, status, due_date, display_order, completed_at
       FROM project_milestones
       WHERE project_id = ?
       ORDER BY display_order ASC, due_date ASC`,
      [projectId]
    );

    const totalMilestones = milestones.length;
    const completedMilestones = milestones.filter((m) => m.status === 'completed').length;
    const milestoneProgress = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

    return {
      ...project,
      teams: teams.map((t) => ({ ...t, member_count: Number(t.member_count) })),
      members,
      milestones,
      total_milestones: totalMilestones,
      completed_milestones: completedMilestones,
      milestone_progress: milestoneProgress
    };
  }

  /**
   * Creates a project transactionally with team and member assignments
   */
  static async createProject(data, actorUser, req = null) {
    const trimmedCode = data.projectCode.trim().toUpperCase();
    const trimmedName = data.name.trim();

    // Verify unique project code
    const [codeExists] = await pool.query(
      'SELECT id FROM projects WHERE UPPER(project_code) = ?',
      [trimmedCode]
    );
    if (codeExists.length > 0) {
      const error = new Error(`Project code '${trimmedCode}' is already in use`);
      error.status = 409;
      error.code = 'PROJECT_CODE_EXISTS';
      throw error;
    }

    // Verify project manager is an active user
    const [pmRows] = await pool.query(
      'SELECT id, name, status FROM users WHERE id = ?',
      [data.projectManagerId]
    );
    if (pmRows.length === 0) {
      const error = new Error('Project manager user not found');
      error.status = 400;
      error.code = 'INVALID_PROJECT_MANAGER';
      throw error;
    }
    if (pmRows[0].status !== 'active') {
      const error = new Error('Project manager must be an active user');
      error.status = 400;
      error.code = 'INACTIVE_PROJECT_MANAGER';
      throw error;
    }

    // Verify client exists if specified
    if (data.clientId) {
      const [clientRows] = await pool.query(
        'SELECT id, status FROM clients WHERE id = ?',
        [data.clientId]
      );
      if (clientRows.length === 0) {
        const error = new Error('Assigned client does not exist');
        error.status = 400;
        error.code = 'INVALID_CLIENT';
        throw error;
      }
    }

    // Verify teamIds if specified
    if (data.teamIds && data.teamIds.length > 0) {
      const [teamRows] = await pool.query(
        'SELECT id FROM teams WHERE id IN (?)',
        [data.teamIds]
      );
      if (teamRows.length !== data.teamIds.length) {
        const error = new Error('One or more selected teams do not exist');
        error.status = 400;
        error.code = 'INVALID_TEAMS';
        throw error;
      }
    }

    // Verify memberIds if specified
    if (data.memberIds && data.memberIds.length > 0) {
      const [userRows] = await pool.query(
        'SELECT id, status FROM users WHERE id IN (?)',
        [data.memberIds]
      );
      if (userRows.length !== data.memberIds.length) {
        const error = new Error('One or more selected project members do not exist');
        error.status = 400;
        error.code = 'INVALID_MEMBERS';
        throw error;
      }
      const hasInactive = userRows.some((u) => u.status !== 'active');
      if (hasInactive) {
        const error = new Error('Cannot assign inactive users as project members');
        error.status = 400;
        error.code = 'INACTIVE_MEMBER_ASSIGNED';
        throw error;
      }
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Insert project
      const [projResult] = await connection.query(
        `INSERT INTO projects (
          name, project_code, description, client_id, project_manager_id,
          workflow_preset_id, workflow_preset_version_id, service_instance_id,
          created_by, status, priority, visibility, start_date, due_date,
          objectives, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          trimmedName,
          trimmedCode,
          data.description || null,
          data.clientId || null,
          data.projectManagerId,
          data.workflowPresetId || null,
          data.workflowPresetVersionId || null,
          data.serviceInstanceId || null,
          actorUser.id,
          data.status || 'planning',
          data.priority || 'medium',
          data.visibility || 'internal',
          data.startDate || null,
          data.dueDate || null,
          data.objectives || null,
          data.notes || null
        ]
      );

      const newProjectId = projResult.insertId;

      // Always add project manager to project_members as 'manager'
      await connection.query(
        `INSERT INTO project_members (project_id, user_id, project_role, added_by)
         VALUES (?, ?, 'manager', ?)`,
        [newProjectId, data.projectManagerId, actorUser.id]
      );

      // Add other initial members (excluding PM to prevent duplicates)
      const otherMemberIds = (data.memberIds || []).filter((id) => Number(id) !== Number(data.projectManagerId));
      for (const mId of otherMemberIds) {
        await connection.query(
          `INSERT INTO project_members (project_id, user_id, project_role, added_by)
           VALUES (?, ?, 'member', ?)`,
          [newProjectId, mId, actorUser.id]
        );
      }

      // Add initial teams
      for (const tId of (data.teamIds || [])) {
        await connection.query(
          `INSERT INTO project_teams (project_id, team_id, assigned_by)
           VALUES (?, ?, ?)`,
          [newProjectId, tId, actorUser.id]
        );
      }

      // Audit Log
      await AuditService.log({
        db: connection,
        actorId: actorUser.id,
        action: 'project.created',
        entityType: 'project',
        entityId: newProjectId,
        details: {
          name: trimmedName,
          code: trimmedCode,
          managerId: data.projectManagerId,
          clientId: data.clientId,
          memberCount: otherMemberIds.length + 1,
          teamCount: (data.teamIds || []).length
        },
        req
      });

      await connection.commit();
      return this.getProjectById(newProjectId, actorUser);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Updates project metadata with authorization checks
   */
  static async updateProject(projectId, data, actorUser, req = null) {
    const project = await this.getProjectById(projectId, actorUser);
    await ProjectsPolicy.enforceManage(projectId, actorUser);

    const newName = data.name !== undefined ? data.name.trim() : project.name;
    const newDesc = data.description !== undefined ? data.description : project.description;
    const newPriority = data.priority || project.priority;
    const newVisibility = data.visibility || project.visibility;
    const newStartDate = data.startDate !== undefined ? data.startDate : project.start_date;
    const newDueDate = data.dueDate !== undefined ? data.dueDate : project.due_date;
    const newObjectives = data.objectives !== undefined ? data.objectives : project.objectives;
    const newNotes = data.notes !== undefined ? data.notes : project.notes;
    const newClientId = data.clientId !== undefined ? data.clientId : project.client_id;
    let newManagerId = project.project_manager_id;

    if (data.projectManagerId && Number(data.projectManagerId) !== Number(project.project_manager_id)) {
      const [pmRows] = await pool.query('SELECT id, status FROM users WHERE id = ?', [data.projectManagerId]);
      if (pmRows.length === 0 || pmRows[0].status !== 'active') {
        const error = new Error('Selected project manager is invalid or inactive');
        error.status = 400;
        error.code = 'INVALID_PROJECT_MANAGER';
        throw error;
      }
      newManagerId = Number(data.projectManagerId);
    }

    if (newClientId && Number(newClientId) !== Number(project.client_id)) {
      const [clientRows] = await pool.query('SELECT id FROM clients WHERE id = ?', [newClientId]);
      if (clientRows.length === 0) {
        const error = new Error('Selected client does not exist');
        error.status = 400;
        error.code = 'INVALID_CLIENT';
        throw error;
      }
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const newPresetId = data.workflowPresetId !== undefined ? data.workflowPresetId : project.workflow_preset_id;
      const newPresetVerId = data.workflowPresetVersionId !== undefined ? data.workflowPresetVersionId : project.workflow_preset_version_id;
      const newServiceInstId = data.serviceInstanceId !== undefined ? data.serviceInstanceId : project.service_instance_id;

      await connection.query(
        `UPDATE projects
         SET name = ?, description = ?, client_id = ?, project_manager_id = ?,
             workflow_preset_id = ?, workflow_preset_version_id = ?, service_instance_id = ?,
             priority = ?, visibility = ?, start_date = ?, due_date = ?,
             objectives = ?, notes = ?
         WHERE id = ?`,
        [
          newName,
          newDesc,
          newClientId || null,
          newManagerId,
          newPresetId || null,
          newPresetVerId || null,
          newServiceInstId || null,
          newPriority,
          newVisibility,
          newStartDate || null,
          newDueDate || null,
          newObjectives || null,
          newNotes || null,
          projectId
        ]
      );

      // If manager changed, ensure new manager is in project_members as 'manager'
      if (newManagerId !== project.project_manager_id) {
        await connection.query(
          `INSERT INTO project_members (project_id, user_id, project_role, added_by)
           VALUES (?, ?, 'manager', ?)
           ON DUPLICATE KEY UPDATE project_role = 'manager'`,
          [projectId, newManagerId, actorUser.id]
        );
      }

      await AuditService.log({
        db: connection,
        actorId: actorUser.id,
        action: 'project.updated',
        entityType: 'project',
        entityId: projectId,
        details: {
          previous: { name: project.name, priority: project.priority, managerId: project.project_manager_id },
          updated: { name: newName, priority: newPriority, managerId: newManagerId }
        },
        req
      });

      await connection.commit();
      return this.getProjectById(projectId, actorUser);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Transitions project status with rules
   */
  static async changeProjectStatus(projectId, newStatus, actorUser, req = null) {
    const project = await this.getProjectById(projectId, actorUser);
    await ProjectsPolicy.enforceManage(projectId, actorUser);

    const oldStatus = project.status;
    if (oldStatus === newStatus) {
      return project;
    }

    let completedAt = project.completed_at;
    if (newStatus === 'completed') {
      completedAt = new Date();
    } else if (oldStatus === 'completed') {
      completedAt = null;
    }

    await pool.query(
      'UPDATE projects SET status = ?, completed_at = ? WHERE id = ?',
      [newStatus, completedAt, projectId]
    );

    await AuditService.log({
      actorId: actorUser.id,
      action: 'project.status_changed',
      entityType: 'project',
      entityId: projectId,
      details: { previousStatus: oldStatus, newStatus },
      req
    });

    // Trigger B — Project Start
    if (newStatus === 'active' && project.workflow_preset_id) {
      try {
        await WorkflowEngineService.onProjectStarted(projectId, actorUser, req);
      } catch (autoErr) {
        console.error('Trigger B project workflow initialization error:', autoErr);
      }
    }

    return this.getProjectById(projectId, actorUser);
  }

  /**
   * Archives a project
   */
  static async archiveProject(projectId, actorUser, req = null) {
    const project = await this.getProjectById(projectId, actorUser);
    await ProjectsPolicy.enforceManage(projectId, actorUser);

    await pool.query(
      'UPDATE projects SET is_archived = TRUE, archived_at = NOW() WHERE id = ?',
      [projectId]
    );

    await AuditService.log({
      actorId: actorUser.id,
      action: 'project.archived',
      entityType: 'project',
      entityId: projectId,
      details: { code: project.project_code, name: project.name },
      req
    });

    return true;
  }

  /**
   * Replaces project members transactionally
   */
  static async updateProjectMembers(projectId, memberList, actorUser, req = null) {
    const project = await this.getProjectById(projectId, actorUser);
    await ProjectsPolicy.enforceManage(projectId, actorUser);

    // Validate all userIds are active
    const userIds = memberList.map((m) => m.userId);
    if (userIds.length > 0) {
      const [userRows] = await pool.query('SELECT id, status FROM users WHERE id IN (?)', [userIds]);
      if (userRows.length !== userIds.length) {
        const error = new Error('One or more selected users do not exist');
        error.status = 400;
        error.code = 'INVALID_USERS';
        throw error;
      }
      const hasInactive = userRows.some((u) => u.status !== 'active');
      if (hasInactive) {
        const error = new Error('Cannot assign inactive users to a project');
        error.status = 400;
        error.code = 'INACTIVE_USER_ASSIGNED';
        throw error;
      }
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Clear existing members
      await connection.query('DELETE FROM project_members WHERE project_id = ?', [projectId]);

      // Always ensure designated project manager is in members as 'manager'
      await connection.query(
        `INSERT INTO project_members (project_id, user_id, project_role, added_by)
         VALUES (?, ?, 'manager', ?)`,
        [projectId, project.project_manager_id, actorUser.id]
      );

      // Insert others
      for (const m of memberList) {
        if (Number(m.userId) !== Number(project.project_manager_id)) {
          await connection.query(
            `INSERT INTO project_members (project_id, user_id, project_role, added_by)
             VALUES (?, ?, ?, ?)`,
            [projectId, m.userId, m.projectRole || 'member', actorUser.id]
          );
        }
      }

      await AuditService.log({
        db: connection,
        actorId: actorUser.id,
        action: 'project.members_updated',
        entityType: 'project',
        entityId: projectId,
        details: { memberCount: memberList.length + 1 },
        req
      });

      await connection.commit();
      return this.getProjectMembers(projectId, actorUser);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Retrieves project members
   */
  static async getProjectMembers(projectId, actorUser) {
    await ProjectsPolicy.enforceAccess(projectId, actorUser);

    const [members] = await pool.query(
      `SELECT pm.user_id, pm.project_role, pm.joined_at,
              u.name, u.email, u.status as user_status, u.role as primary_role
       FROM project_members pm
       JOIN users u ON pm.user_id = u.id
       WHERE pm.project_id = ?
       ORDER BY (pm.project_role = 'manager') DESC, u.name ASC`,
      [projectId]
    );

    return members;
  }

  /**
   * Replaces participating teams transactionally
   */
  static async updateProjectTeams(projectId, teamIds, actorUser, req = null) {
    await this.getProjectById(projectId, actorUser);
    await ProjectsPolicy.enforceManage(projectId, actorUser);

    if (teamIds.length > 0) {
      const [teamRows] = await pool.query('SELECT id FROM teams WHERE id IN (?)', [teamIds]);
      if (teamRows.length !== teamIds.length) {
        const error = new Error('One or more selected teams do not exist');
        error.status = 400;
        error.code = 'INVALID_TEAMS';
        throw error;
      }
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query('DELETE FROM project_teams WHERE project_id = ?', [projectId]);

      for (const tId of teamIds) {
        await connection.query(
          `INSERT INTO project_teams (project_id, team_id, assigned_by)
           VALUES (?, ?, ?)`,
          [projectId, tId, actorUser.id]
        );
      }

      await AuditService.log({
        db: connection,
        actorId: actorUser.id,
        action: 'project.teams_updated',
        entityType: 'project',
        entityId: projectId,
        details: { teamCount: teamIds.length },
        req
      });

      await connection.commit();
      return this.getProjectTeams(projectId, actorUser);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Retrieves assigned teams for a project
   */
  static async getProjectTeams(projectId, actorUser) {
    await ProjectsPolicy.enforceAccess(projectId, actorUser);

    const [teams] = await pool.query(
      `SELECT t.id, t.name, t.description, t.status, t.leader_id,
              u.name as leader_name,
              COUNT(DISTINCT tm.user_id) as member_count
       FROM project_teams pt
       JOIN teams t ON pt.team_id = t.id
       LEFT JOIN users u ON t.leader_id = u.id
       LEFT JOIN team_members tm ON t.id = tm.team_id
       WHERE pt.project_id = ?
       GROUP BY t.id
       ORDER BY t.name ASC`,
      [projectId]
    );

    return teams.map((t) => ({ ...t, member_count: Number(t.member_count) }));
  }

  /**
   * Retrieves project activity history from audit_logs
   */
  static async getProjectActivity(projectId, actorUser) {
    await ProjectsPolicy.enforceAccess(projectId, actorUser);

    const [logs] = await pool.query(
      `SELECT al.id, al.action, al.entity_type, al.entity_id, al.details, al.created_at,
              u.name as actor_name, u.email as actor_email
       FROM audit_logs al
       LEFT JOIN users u ON al.actor_id = u.id
       WHERE (al.entity_type = 'project' AND al.entity_id = ?)
          OR (al.entity_type = 'milestone' AND JSON_EXTRACT(al.details, '$.projectId') = ?)
       ORDER BY al.created_at DESC
       LIMIT 50`,
      [String(projectId), Number(projectId)]
    );

    return logs;
  }

  /**
   * Retrieves real database-derived metrics scoped strictly to accessible projects
   */
  static async getDashboardMetrics(actorUser) {
    const access = this.getAccessFilterSql(actorUser, 'p');

    // Total counts by status
    const [statusCounts] = await pool.query(
      `SELECT
        COUNT(*) as total_projects,
        SUM(CASE WHEN p.status = 'active' AND p.is_archived = FALSE THEN 1 ELSE 0 END) as active_projects,
        SUM(CASE WHEN p.status = 'on_hold' AND p.is_archived = FALSE THEN 1 ELSE 0 END) as on_hold_projects,
        SUM(CASE WHEN p.status = 'completed' THEN 1 ELSE 0 END) as completed_projects,
        SUM(CASE WHEN p.status = 'planning' AND p.is_archived = FALSE THEN 1 ELSE 0 END) as planning_projects,
        SUM(CASE WHEN p.due_date < CURDATE() AND p.status NOT IN ('completed', 'cancelled') AND p.is_archived = FALSE THEN 1 ELSE 0 END) as overdue_projects
       FROM projects p
       WHERE ${access.clause}`,
      access.params
    );

    // Upcoming milestones in next 14 days for accessible projects
    const [upcomingMilestones] = await pool.query(
      `SELECT pm.id, pm.title, pm.due_date, pm.status, pm.project_id,
              p.name as project_name, p.project_code
       FROM project_milestones pm
       JOIN projects p ON pm.project_id = p.id
       WHERE ${access.clause}
         AND pm.status != 'completed'
         AND pm.due_date >= CURDATE()
         AND pm.due_date <= DATE_ADD(CURDATE(), INTERVAL 14 DAY)
       ORDER BY pm.due_date ASC
       LIMIT 5`,
      access.params
    );

    const stats = statusCounts[0] || {};
    return {
      totalProjects: Number(stats.total_projects || 0),
      activeProjects: Number(stats.active_projects || 0),
      onHoldProjects: Number(stats.on_hold_projects || 0),
      completedProjects: Number(stats.completed_projects || 0),
      planningProjects: Number(stats.planning_projects || 0),
      overdueProjects: Number(stats.overdue_projects || 0),
      upcomingMilestones
    };
  }
}
