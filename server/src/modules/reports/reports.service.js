import { pool } from '../../config/db.js';
import { AuditService } from '../audit/audit.service.js';
import { generateCsvReport, generateXlsxReport } from './reports.export.js';

export class ReportsService {
  /**
   * Check if user is global admin or has reports.view_all permission
   */
  static isGlobalAdmin(user) {
    if (!user) return false;
    if (user.role === 'owner') return true;
    if (user.roles && Array.isArray(user.roles)) {
      if (user.roles.some((r) => ['owner', 'admin'].includes(r.slug))) return true;
    }
    if (user.permissions && Array.isArray(user.permissions)) {
      if (user.permissions.includes('reports.view_all')) return true;
    }
    return false;
  }

  /**
   * Resolves date range bounds based on period string or explicit dates
   */
  static resolveDateRange(period, startDate, endDate) {
    const now = new Date();
    let start = startDate;
    let end = endDate;

    if (period) {
      const todayStr = now.toISOString().slice(0, 10);
      switch (period) {
        case 'today':
          start = todayStr;
          end = todayStr;
          break;
        case 'last_7_days': {
          const d = new Date(now);
          d.setDate(d.getDate() - 7);
          start = d.toISOString().slice(0, 10);
          end = todayStr;
          break;
        }
        case 'last_30_days': {
          const d = new Date(now);
          d.setDate(d.getDate() - 30);
          start = d.toISOString().slice(0, 10);
          end = todayStr;
          break;
        }
        case 'this_month': {
          const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
          start = firstDay.toISOString().slice(0, 10);
          end = todayStr;
          break;
        }
        case 'previous_month': {
          const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
          start = firstDay.toISOString().slice(0, 10);
          end = lastDay.toISOString().slice(0, 10);
          break;
        }
        case 'custom':
        default:
          break;
      }
    }

    // Default to last 30 days if still undefined
    if (!start) {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      start = d.toISOString().slice(0, 10);
    }
    if (!end) {
      end = now.toISOString().slice(0, 10);
    }

    return {
      startDate: start,
      endDate: end,
      startDateTime: `${start} 00:00:00`,
      endDateTime: `${end} 23:59:59`
    };
  }

  /**
   * Fetches accessible project IDs for the user
   * Returns null if global admin (unrestricted), or array of project IDs.
   */
  static async getAccessibleProjectIds(user) {
    if (this.isGlobalAdmin(user)) {
      return null;
    }

    const [rows] = await pool.query(
      `SELECT DISTINCT p.id
       FROM projects p
       LEFT JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = ?
       LEFT JOIN project_teams pt ON p.id = pt.project_id
       LEFT JOIN team_members tm ON pt.team_id = tm.team_id AND tm.user_id = ?
       LEFT JOIN clients c ON p.client_id = c.id AND (c.user_id = ? OR c.email = ?)
       WHERE p.project_manager_id = ?
          OR pm.user_id IS NOT NULL
          OR tm.user_id IS NOT NULL
          OR c.id IS NOT NULL`,
      [user.id, user.id, user.id, user.email, user.id]
    );

    return rows.map((r) => r.id);
  }

  /**
   * Builds an IN clause for accessible projects
   */
  static buildProjectScopeClause(accessibleProjectIds, projectAlias = 'p.id') {
    if (accessibleProjectIds === null) {
      return { sql: '1=1', params: [] };
    }
    if (accessibleProjectIds.length === 0) {
      return { sql: '1=0', params: [] };
    }
    const placeholders = accessibleProjectIds.map(() => '?').join(',');
    return {
      sql: `${projectAlias} IN (${placeholders})`,
      params: [...accessibleProjectIds]
    };
  }

  // -------------------------------------------------------------
  // 1. DASHBOARD METRICS
  // -------------------------------------------------------------
  static async getDashboardMetrics(user, query = {}) {
    const { startDate, endDate, startDateTime, endDateTime } = this.resolveDateRange(
      query.period,
      query.startDate,
      query.endDate
    );

    const accessibleProjectIds = await this.getAccessibleProjectIds(user);
    const pScope = this.buildProjectScopeClause(accessibleProjectIds, 'p.id');
    const tScope = this.buildProjectScopeClause(accessibleProjectIds, 't.project_id');
    const teScope = this.buildProjectScopeClause(accessibleProjectIds, 'te.project_id');

    // 1. Project KPI Counts
    const [projectCounts] = await pool.query(
      `SELECT 
         COUNT(*) as totalProjects,
         SUM(CASE WHEN p.status = 'active' THEN 1 ELSE 0 END) as activeProjects,
         SUM(CASE WHEN p.status = 'completed' THEN 1 ELSE 0 END) as completedProjects,
         SUM(CASE WHEN p.status = 'on_hold' THEN 1 ELSE 0 END) as onHoldProjects,
         SUM(CASE WHEN p.status = 'planning' THEN 1 ELSE 0 END) as planningProjects
       FROM projects p
       WHERE ${pScope.sql}
         AND p.created_at <= ?`,
      [...pScope.params, endDateTime]
    );

    // 2. Task KPI Counts
    const [taskCounts] = await pool.query(
      `SELECT 
         COUNT(*) as totalTasks,
         SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completedTasks,
         SUM(CASE WHEN t.status = 'in_review' THEN 1 ELSE 0 END) as inReviewTasks,
         SUM(CASE WHEN t.status = 'in_progress' THEN 1 ELSE 0 END) as inProgressTasks,
         SUM(CASE WHEN t.status = 'todo' THEN 1 ELSE 0 END) as todoTasks,
         SUM(CASE WHEN t.status = 'blocked' THEN 1 ELSE 0 END) as blockedTasks,
         SUM(CASE WHEN t.status != 'completed' AND t.due_date IS NOT NULL AND t.due_date < CURDATE() THEN 1 ELSE 0 END) as overdueTasks
       FROM tasks t
       WHERE ${tScope.sql}
         AND t.created_at <= ?`,
      [...tScope.params, endDateTime]
    );

    // 3. Time KPI Totals (Minutes converted to Hours)
    const [timeTotals] = await pool.query(
      `SELECT 
         COALESCE(SUM(te.duration_minutes), 0) as totalMinutes,
         COALESCE(SUM(CASE WHEN te.approval_status = 'approved' THEN te.duration_minutes ELSE 0 END), 0) as approvedMinutes,
         COALESCE(SUM(CASE WHEN te.approval_status = 'approved' AND te.is_billable = 1 THEN te.duration_minutes ELSE 0 END), 0) as billableMinutes,
         COALESCE(SUM(CASE WHEN te.approval_status = 'approved' AND te.is_billable = 0 THEN te.duration_minutes ELSE 0 END), 0) as nonBillableMinutes,
         COALESCE(SUM(CASE WHEN te.approval_status = 'submitted' THEN te.duration_minutes ELSE 0 END), 0) as pendingMinutes
       FROM time_entries te
       WHERE ${teScope.sql}
         AND te.work_date >= ? AND te.work_date <= ?`,
      [...teScope.params, startDate, endDate]
    );

    // 4. Task Completion Trends (by day in the date range)
    const [completionTrends] = await pool.query(
      `SELECT 
         DATE(t.completed_at) as date,
         COUNT(*) as count
       FROM tasks t
       WHERE ${tScope.sql}
         AND t.status = 'completed'
         AND t.completed_at >= ? AND t.completed_at <= ?
       GROUP BY DATE(t.completed_at)
       ORDER BY DATE(t.completed_at) ASC`,
      [...tScope.params, startDateTime, endDateTime]
    );

    // 5. Team Workload (top teams)
    const [teamWorkload] = await pool.query(
      `SELECT 
         tm_team.id as teamId,
         tm_team.name as teamName,
         COUNT(DISTINCT ta.task_id) as assignedTasks,
         COALESCE(SUM(CASE WHEN te.approval_status = 'approved' THEN te.duration_minutes ELSE 0 END), 0) as approvedMinutes
       FROM teams tm_team
       JOIN team_members t_mem ON tm_team.id = t_mem.team_id
       LEFT JOIN task_assignees ta ON t_mem.user_id = ta.user_id
       LEFT JOIN tasks t ON ta.task_id = t.id AND ${tScope.sql}
       LEFT JOIN time_entries te ON t_mem.user_id = te.user_id AND te.work_date >= ? AND te.work_date <= ?
       GROUP BY tm_team.id, tm_team.name
       ORDER BY assignedTasks DESC
       LIMIT 6`,
      [...tScope.params, startDate, endDate]
    );

    // 6. Hours by Project (top 5 projects)
    const [hoursByProject] = await pool.query(
      `SELECT 
         p.id as projectId,
         p.name as projectName,
         p.project_code as projectCode,
         COALESCE(SUM(CASE WHEN te.approval_status = 'approved' THEN te.duration_minutes ELSE 0 END), 0) as approvedMinutes,
         COALESCE(SUM(CASE WHEN te.approval_status = 'approved' AND te.is_billable = 1 THEN te.duration_minutes ELSE 0 END), 0) as billableMinutes
       FROM projects p
       JOIN time_entries te ON p.id = te.project_id AND te.work_date >= ? AND te.work_date <= ?
       WHERE ${pScope.sql}
       GROUP BY p.id, p.name, p.project_code
       ORDER BY approvedMinutes DESC
       LIMIT 5`,
      [startDate, endDate, ...pScope.params]
    );

    // 7. Milestone Completion
    const [milestoneStats] = await pool.query(
      `SELECT 
         COUNT(*) as totalMilestones,
         SUM(CASE WHEN pm.status = 'completed' THEN 1 ELSE 0 END) as completedMilestones
       FROM project_milestones pm
       JOIN projects p ON pm.project_id = p.id
       WHERE ${pScope.sql}`,
      [...pScope.params]
    );

    const pk = projectCounts[0] || {};
    const tk = taskCounts[0] || {};
    const tt = timeTotals[0] || {};
    const ms = milestoneStats[0] || {};

    const totalHours = Number((tt.totalMinutes / 60).toFixed(1));
    const approvedHours = Number((tt.approvedMinutes / 60).toFixed(1));
    const billableHours = Number((tt.billableMinutes / 60).toFixed(1));
    const nonBillableHours = Number((tt.nonBillableMinutes / 60).toFixed(1));
    const pendingHours = Number((tt.pendingMinutes / 60).toFixed(1));

    return {
      dateRange: { startDate, endDate, period: query.period || 'custom' },
      kpis: {
        totalProjects: Number(pk.totalProjects || 0),
        activeProjects: Number(pk.activeProjects || 0),
        completedProjects: Number(pk.completedProjects || 0),
        onHoldProjects: Number(pk.onHoldProjects || 0),
        planningProjects: Number(pk.planningProjects || 0),

        totalTasks: Number(tk.totalTasks || 0),
        completedTasks: Number(tk.completedTasks || 0),
        inProgressTasks: Number(tk.inProgressTasks || 0),
        inReviewTasks: Number(tk.inReviewTasks || 0),
        overdueTasks: Number(tk.overdueTasks || 0),

        totalHours,
        approvedHours,
        billableHours,
        nonBillableHours,
        pendingHours
      },
      taskStatusDistribution: [
        { status: 'todo', label: 'To Do', count: Number(tk.todoTasks || 0) },
        { status: 'in_progress', label: 'In Progress', count: Number(tk.inProgressTasks || 0) },
        { status: 'in_review', label: 'In Review', count: Number(tk.inReviewTasks || 0) },
        { status: 'blocked', label: 'Blocked', count: Number(tk.blockedTasks || 0) },
        { status: 'completed', label: 'Completed', count: Number(tk.completedTasks || 0) }
      ],
      projectStatusDistribution: [
        { status: 'planning', label: 'Planning', count: Number(pk.planningProjects || 0) },
        { status: 'active', label: 'Active', count: Number(pk.activeProjects || 0) },
        { status: 'on_hold', label: 'On Hold', count: Number(pk.onHoldProjects || 0) },
        { status: 'completed', label: 'Completed', count: Number(pk.completedProjects || 0) }
      ],
      taskCompletionTrends: completionTrends.map((t) => ({
        date: t.date ? new Date(t.date).toISOString().slice(0, 10) : '',
        completedCount: Number(t.count)
      })),
      projectMilestoneCompletion: {
        totalMilestones: Number(ms.totalMilestones || 0),
        completedMilestones: Number(ms.completedMilestones || 0),
        rate: ms.totalMilestones > 0 ? Math.round((ms.completedMilestones / ms.totalMilestones) * 100) : 0
      },
      teamWorkload: teamWorkload.map((tw) => ({
        teamId: tw.teamId,
        teamName: tw.teamName,
        assignedTasks: Number(tw.assignedTasks),
        approvedHours: Number((tw.approvedMinutes / 60).toFixed(1))
      })),
      hoursByProject: hoursByProject.map((hp) => ({
        projectId: hp.projectId,
        projectName: hp.projectName,
        projectCode: hp.projectCode,
        approvedHours: Number((hp.approvedMinutes / 60).toFixed(1)),
        billableHours: Number((hp.billableMinutes / 60).toFixed(1))
      })),
      billableVsNonBillable: [
        { name: 'Billable', hours: billableHours },
        { name: 'Non-Billable', hours: nonBillableHours }
      ]
    };
  }

  // -------------------------------------------------------------
  // 2. PROJECT PERFORMANCE REPORTS
  // -------------------------------------------------------------
  static async getProjectReports(user, query = {}) {
    const { startDate, endDate, endDateTime } = this.resolveDateRange(
      query.period,
      query.startDate,
      query.endDate
    );

    const accessibleProjectIds = await this.getAccessibleProjectIds(user);
    const pScope = this.buildProjectScopeClause(accessibleProjectIds, 'p.id');

    let whereClause = `WHERE ${pScope.sql} AND p.created_at <= ?`;
    const params = [...pScope.params, endDateTime];

    if (query.clientId) {
      whereClause += ' AND p.client_id = ?';
      params.push(query.clientId);
    }
    if (query.managerId) {
      whereClause += ' AND p.project_manager_id = ?';
      params.push(query.managerId);
    }
    if (query.status) {
      whereClause += ' AND p.status = ?';
      params.push(query.status);
    }
    if (query.search) {
      whereClause += ' AND (p.name LIKE ? OR p.project_code LIKE ?)';
      params.push(`%${query.search}%`, `%${query.search}%`);
    }

    // Count Total
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total FROM projects p ${whereClause}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);

    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    // Aggregated Projects Query
    const [rows] = await pool.query(
      `SELECT 
         p.id,
         p.name,
         p.project_code,
         p.status,
         p.start_date,
         p.due_date,
         p.created_at,
         c.name as client_name,
         pm_user.name as manager_name,
         -- Task counts
         COUNT(DISTINCT t.id) as total_tasks,
         COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) as completed_tasks,
         COUNT(DISTINCT CASE WHEN t.status = 'in_progress' THEN t.id END) as in_progress_tasks,
         COUNT(DISTINCT CASE WHEN t.status = 'in_review' THEN t.id END) as in_review_tasks,
         COUNT(DISTINCT CASE WHEN t.status != 'completed' AND t.due_date IS NOT NULL AND t.due_date < CURDATE() THEN t.id END) as overdue_tasks,
         -- Milestone counts
         COUNT(DISTINCT m.id) as total_milestones,
         COUNT(DISTINCT CASE WHEN m.status = 'completed' THEN m.id END) as completed_milestones,
         -- Time Tracking (in minutes)
         COALESCE(SUM(DISTINCT CASE WHEN te.approval_status = 'approved' THEN te.duration_minutes ELSE 0 END), 0) as approved_minutes,
         COALESCE(SUM(DISTINCT CASE WHEN te.approval_status = 'approved' AND te.is_billable = 1 THEN te.duration_minutes ELSE 0 END), 0) as billable_minutes,
         COALESCE(SUM(DISTINCT CASE WHEN te.approval_status = 'approved' AND te.is_billable = 0 THEN te.duration_minutes ELSE 0 END), 0) as non_billable_minutes,
         COALESCE(SUM(DISTINCT te.duration_minutes), 0) as total_minutes
       FROM projects p
       LEFT JOIN clients c ON p.client_id = c.id
       LEFT JOIN users pm_user ON p.project_manager_id = pm_user.id
       LEFT JOIN tasks t ON p.id = t.project_id
       LEFT JOIN project_milestones m ON p.id = m.project_id
       LEFT JOIN time_entries te ON p.id = te.project_id AND te.work_date >= ? AND te.work_date <= ?
       ${whereClause}
       GROUP BY p.id, c.name, pm_user.name
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
      [startDate, endDate, ...params, limit, offset]
    );

    const projects = rows.map((r) => {
      const totalTasks = Number(r.total_tasks || 0);
      const completedTasks = Number(r.completed_tasks || 0);
      const totalMilestones = Number(r.total_milestones || 0);
      const completedMilestones = Number(r.completed_milestones || 0);

      const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      const milestoneCompletionRate = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

      return {
        id: r.id,
        name: r.name,
        project_code: r.project_code,
        status: r.status,
        start_date: r.start_date,
        due_date: r.due_date,
        created_at: r.created_at,
        client_name: r.client_name || 'None',
        manager_name: r.manager_name || 'Unassigned',
        total_tasks: totalTasks,
        completed_tasks: completedTasks,
        in_progress_tasks: Number(r.in_progress_tasks || 0),
        in_review_tasks: Number(r.in_review_tasks || 0),
        overdue_tasks: Number(r.overdue_tasks || 0),
        task_completion_rate: taskCompletionRate,
        total_milestones: totalMilestones,
        completed_milestones: completedMilestones,
        milestone_completion_rate: milestoneCompletionRate,
        approved_hours: Number((r.approved_minutes / 60).toFixed(1)),
        billable_hours: Number((r.billable_minutes / 60).toFixed(1)),
        non_billable_hours: Number((r.non_billable_minutes / 60).toFixed(1)),
        total_tracked_hours: Number((r.total_minutes / 60).toFixed(1))
      };
    });

    return {
      projects,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  static async getProjectReportById(projectId, user) {
    const accessibleProjectIds = await this.getAccessibleProjectIds(user);
    if (accessibleProjectIds !== null && !accessibleProjectIds.includes(Number(projectId))) {
      const error = new Error('You do not have access to this project report');
      error.status = 403;
      throw error;
    }

    const [projects] = await pool.query(
      `SELECT 
         p.*,
         c.name as client_name,
         c.company_name as client_company,
         pm.name as manager_name
       FROM projects p
       LEFT JOIN clients c ON p.client_id = c.id
       LEFT JOIN users pm ON p.project_manager_id = pm.id
       WHERE p.id = ?`,
      [projectId]
    );

    if (projects.length === 0) {
      const error = new Error('Project not found');
      error.status = 404;
      throw error;
    }

    const project = projects[0];

    // Milestones
    const [milestones] = await pool.query(
      `SELECT id, title, status, due_date, completed_at, display_order
       FROM project_milestones
       WHERE project_id = ?
       ORDER BY display_order ASC, due_date ASC`,
      [projectId]
    );

    // Tasks breakdown
    const [tasksSummary] = await pool.query(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
         SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
         SUM(CASE WHEN status = 'in_review' THEN 1 ELSE 0 END) as in_review,
         SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) as todo,
         SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked,
         SUM(CASE WHEN status != 'completed' AND due_date IS NOT NULL AND due_date < CURDATE() THEN 1 ELSE 0 END) as overdue
       FROM tasks
       WHERE project_id = ?`,
      [projectId]
    );

    // Time tracking breakdown
    const [timeSummary] = await pool.query(
      `SELECT 
         COALESCE(SUM(duration_minutes), 0) as total_minutes,
         COALESCE(SUM(CASE WHEN approval_status = 'approved' THEN duration_minutes ELSE 0 END), 0) as approved_minutes,
         COALESCE(SUM(CASE WHEN approval_status = 'approved' AND is_billable = 1 THEN duration_minutes ELSE 0 END), 0) as billable_minutes,
         COALESCE(SUM(CASE WHEN approval_status = 'approved' AND is_billable = 0 THEN duration_minutes ELSE 0 END), 0) as non_billable_minutes,
         COALESCE(SUM(CASE WHEN approval_status = 'submitted' THEN duration_minutes ELSE 0 END), 0) as pending_minutes
       FROM time_entries
       WHERE project_id = ?`,
      [projectId]
    );

    const ts = tasksSummary[0] || {};
    const tms = timeSummary[0] || {};

    return {
      project: {
        id: project.id,
        name: project.name,
        project_code: project.project_code,
        status: project.status,
        start_date: project.start_date,
        due_date: project.due_date,
        client_name: project.client_name,
        client_company: project.client_company,
        manager_name: project.manager_name
      },
      milestones,
      tasksBreakdown: {
        total: Number(ts.total || 0),
        completed: Number(ts.completed || 0),
        inProgress: Number(ts.in_progress || 0),
        inReview: Number(ts.in_review || 0),
        todo: Number(ts.todo || 0),
        blocked: Number(ts.blocked || 0),
        overdue: Number(ts.overdue || 0)
      },
      timeBreakdown: {
        totalHours: Number((tms.total_minutes / 60).toFixed(1)),
        approvedHours: Number((tms.approved_minutes / 60).toFixed(1)),
        billableHours: Number((tms.billable_minutes / 60).toFixed(1)),
        nonBillableHours: Number((tms.non_billable_minutes / 60).toFixed(1)),
        pendingHours: Number((tms.pending_minutes / 60).toFixed(1))
      }
    };
  }

  // -------------------------------------------------------------
  // 3. TASK PERFORMANCE REPORTS
  // -------------------------------------------------------------
  static async getTaskReports(user, query = {}) {
    const { startDateTime, endDateTime } = this.resolveDateRange(
      query.period,
      query.startDate,
      query.endDate
    );

    const accessibleProjectIds = await this.getAccessibleProjectIds(user);
    const tScope = this.buildProjectScopeClause(accessibleProjectIds, 't.project_id');

    let whereClause = `WHERE ${tScope.sql} AND t.created_at <= ?`;
    const params = [...tScope.params, endDateTime];

    if (query.projectId) {
      whereClause += ' AND t.project_id = ?';
      params.push(query.projectId);
    }
    if (query.status) {
      whereClause += ' AND t.status = ?';
      params.push(query.status);
    }
    if (query.priority) {
      whereClause += ' AND t.priority = ?';
      params.push(query.priority);
    }
    if (query.assigneeId) {
      whereClause += ' AND EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = ?)';
      params.push(query.assigneeId);
    }
    if (query.search) {
      whereClause += ' AND (t.title LIKE ? OR t.task_code LIKE ?)';
      params.push(`%${query.search}%`, `%${query.search}%`);
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total FROM tasks t ${whereClause}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);

    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    const [rows] = await pool.query(
      `SELECT 
         t.id,
         t.task_code,
         t.title,
         t.status,
         t.priority,
         t.due_date,
         t.created_at,
         t.completed_at,
         t.estimated_minutes,
         p.id as project_id,
         p.name as project_name,
         p.project_code,
         CASE 
           WHEN t.status != 'completed' AND t.due_date IS NOT NULL AND t.due_date < CURDATE() 
           THEN DATEDIFF(CURDATE(), t.due_date) 
           ELSE 0 
         END as days_overdue,
         CASE 
           WHEN t.status = 'completed' AND t.completed_at IS NOT NULL 
           THEN ROUND(TIMESTAMPDIFF(MINUTE, t.created_at, t.completed_at) / 60, 1) 
           ELSE NULL 
         END as completion_duration_hours,
         COALESCE(SUM(te.duration_minutes), 0) as total_tracked_minutes
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       LEFT JOIN time_entries te ON t.id = te.task_id
       ${whereClause}
       GROUP BY t.id, p.id, p.name, p.project_code
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    // Fetch assignees for each task
    const taskIds = rows.map((r) => r.id);
    let assigneesMap = {};
    if (taskIds.length > 0) {
      const placeholders = taskIds.map(() => '?').join(',');
      const [assignees] = await pool.query(
        `SELECT ta.task_id, u.id as user_id, u.name, u.email
         FROM task_assignees ta
         JOIN users u ON ta.user_id = u.id
         WHERE ta.task_id IN (${placeholders})`,
        taskIds
      );
      assignees.forEach((a) => {
        if (!assigneesMap[a.task_id]) assigneesMap[a.task_id] = [];
        assigneesMap[a.task_id].push({ id: a.user_id, name: a.name, email: a.email });
      });
    }

    const tasks = rows.map((r) => ({
      id: r.id,
      task_code: r.task_code,
      title: r.title,
      status: r.status,
      priority: r.priority,
      due_date: r.due_date,
      created_at: r.created_at,
      completed_at: r.completed_at,
      estimated_minutes: r.estimated_minutes,
      days_overdue: Number(r.days_overdue || 0),
      completion_duration_hours: r.completion_duration_hours !== null ? Number(r.completion_duration_hours) : null,
      tracked_hours: Number((r.total_tracked_minutes / 60).toFixed(1)),
      project_name: r.project_name,
      project_code: r.project_code,
      assignees: assigneesMap[r.id] || []
    }));

    return {
      tasks,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  static async getOverdueTasks(user, query = {}) {
    const accessibleProjectIds = await this.getAccessibleProjectIds(user);
    const tScope = this.buildProjectScopeClause(accessibleProjectIds, 't.project_id');

    const [rows] = await pool.query(
      `SELECT 
         t.id,
         t.task_code,
         t.title,
         t.status,
         t.priority,
         t.due_date,
         t.created_at,
         p.id as project_id,
         p.name as project_name,
         p.project_code,
         DATEDIFF(CURDATE(), t.due_date) as days_overdue
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       WHERE ${tScope.sql}
         AND t.status != 'completed'
         AND t.due_date IS NOT NULL
         AND t.due_date < CURDATE()
       ORDER BY days_overdue DESC, t.due_date ASC
       LIMIT 50`,
      [...tScope.params]
    );

    return rows.map((r) => ({
      ...r,
      days_overdue: Number(r.days_overdue || 0)
    }));
  }

  static async getTaskCompletionTrends(user, query = {}) {
    const { startDateTime, endDateTime } = this.resolveDateRange(
      query.period,
      query.startDate,
      query.endDate
    );

    const accessibleProjectIds = await this.getAccessibleProjectIds(user);
    const tScope = this.buildProjectScopeClause(accessibleProjectIds, 't.project_id');

    const [rows] = await pool.query(
      `SELECT 
         DATE(t.completed_at) as completion_date,
         COUNT(*) as completed_count,
         AVG(TIMESTAMPDIFF(HOUR, t.created_at, t.completed_at)) as avg_duration_hours
       FROM tasks t
       WHERE ${tScope.sql}
         AND t.status = 'completed'
         AND t.completed_at >= ? AND t.completed_at <= ?
       GROUP BY DATE(t.completed_at)
       ORDER BY DATE(t.completed_at) ASC`,
      [...tScope.params, startDateTime, endDateTime]
    );

    return rows.map((r) => ({
      date: r.completion_date ? new Date(r.completion_date).toISOString().slice(0, 10) : '',
      completedCount: Number(r.completed_count),
      avgDurationHours: r.avg_duration_hours !== null ? Number(Number(r.avg_duration_hours).toFixed(1)) : 0
    }));
  }

  // -------------------------------------------------------------
  // 4. TEAM WORKLOAD REPORTS
  // -------------------------------------------------------------
  static async getTeamReports(user, query = {}) {
    const { startDate, endDate } = this.resolveDateRange(
      query.period,
      query.startDate,
      query.endDate
    );

    const [teams] = await pool.query(
      `SELECT 
         tm.id,
         tm.name,
         tm.description,
         u_lead.name as leader_name,
         COUNT(DISTINCT t_mem.user_id) as member_count,
         COUNT(DISTINCT ta.task_id) as assigned_tasks,
         COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) as completed_tasks,
         COUNT(DISTINCT CASE WHEN t.status = 'in_progress' THEN t.id END) as in_progress_tasks,
         COUNT(DISTINCT CASE WHEN t.status != 'completed' AND t.due_date IS NOT NULL AND t.due_date < CURDATE() THEN t.id END) as overdue_tasks,
         COALESCE(SUM(CASE WHEN te.approval_status = 'approved' THEN te.duration_minutes ELSE 0 END), 0) as approved_minutes,
         COALESCE(SUM(CASE WHEN te.approval_status = 'approved' AND te.is_billable = 1 THEN te.duration_minutes ELSE 0 END), 0) as billable_minutes
       FROM teams tm
       LEFT JOIN users u_lead ON tm.leader_id = u_lead.id
       LEFT JOIN team_members t_mem ON tm.id = t_mem.team_id
       LEFT JOIN task_assignees ta ON t_mem.user_id = ta.user_id
       LEFT JOIN tasks t ON ta.task_id = t.id
       LEFT JOIN time_entries te ON t_mem.user_id = te.user_id AND te.work_date >= ? AND te.work_date <= ?
       GROUP BY tm.id, tm.name, tm.description, u_lead.name
       ORDER BY tm.name ASC`,
      [startDate, endDate]
    );

    return teams.map((tm) => ({
      id: tm.id,
      name: tm.name,
      description: tm.description,
      leader_name: tm.leader_name || 'None',
      member_count: Number(tm.member_count || 0),
      assigned_tasks: Number(tm.assigned_tasks || 0),
      completed_tasks: Number(tm.completed_tasks || 0),
      in_progress_tasks: Number(tm.in_progress_tasks || 0),
      overdue_tasks: Number(tm.overdue_tasks || 0),
      approved_hours: Number((tm.approved_minutes / 60).toFixed(1)),
      billable_hours: Number((tm.billable_minutes / 60).toFixed(1))
    }));
  }

  static async getTeamReportById(teamId, user, query = {}) {
    const { startDate, endDate } = this.resolveDateRange(
      query.period,
      query.startDate,
      query.endDate
    );

    const [teams] = await pool.query(
      `SELECT tm.*, u.name as leader_name 
       FROM teams tm 
       LEFT JOIN users u ON tm.leader_id = u.id 
       WHERE tm.id = ?`,
      [teamId]
    );

    if (teams.length === 0) {
      const error = new Error('Team not found');
      error.status = 404;
      throw error;
    }

    const team = teams[0];

    // Member workload
    const [members] = await pool.query(
      `SELECT 
         u.id as user_id,
         u.name,
         u.email,
         t_mem.team_role,
         COUNT(DISTINCT ta.task_id) as assigned_tasks,
         COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) as completed_tasks,
         COUNT(DISTINCT CASE WHEN t.status != 'completed' AND t.due_date IS NOT NULL AND t.due_date < CURDATE() THEN t.id END) as overdue_tasks,
         COALESCE(SUM(CASE WHEN te.approval_status = 'approved' THEN te.duration_minutes ELSE 0 END), 0) as approved_minutes,
         COALESCE(SUM(CASE WHEN te.approval_status = 'approved' AND te.is_billable = 1 THEN te.duration_minutes ELSE 0 END), 0) as billable_minutes
       FROM team_members t_mem
       JOIN users u ON t_mem.user_id = u.id
       LEFT JOIN task_assignees ta ON u.id = ta.user_id
       LEFT JOIN tasks t ON ta.task_id = t.id
       LEFT JOIN time_entries te ON u.id = te.user_id AND te.work_date >= ? AND te.work_date <= ?
       WHERE t_mem.team_id = ?
       GROUP BY u.id, u.name, u.email, t_mem.team_role
       ORDER BY u.name ASC`,
      [startDate, endDate, teamId]
    );

    return {
      team: {
        id: team.id,
        name: team.name,
        leader_name: team.leader_name
      },
      members: members.map((m) => ({
        id: m.user_id,
        name: m.name,
        email: m.email,
        role: m.team_role,
        assigned_tasks: Number(m.assigned_tasks || 0),
        completed_tasks: Number(m.completed_tasks || 0),
        overdue_tasks: Number(m.overdue_tasks || 0),
        approved_hours: Number((m.approved_minutes / 60).toFixed(1)),
        billable_hours: Number((m.billable_minutes / 60).toFixed(1))
      }))
    };
  }

  // -------------------------------------------------------------
  // 5. TIME AND TIMESHEET REPORTS
  // -------------------------------------------------------------
  static async getTimeSummaryReport(user, query = {}) {
    const { startDate, endDate } = this.resolveDateRange(
      query.period,
      query.startDate,
      query.endDate
    );

    const accessibleProjectIds = await this.getAccessibleProjectIds(user);
    const teScope = this.buildProjectScopeClause(accessibleProjectIds, 'te.project_id');

    let whereClause = `WHERE ${teScope.sql} AND te.work_date >= ? AND te.work_date <= ?`;
    const params = [...teScope.params, startDate, endDate];

    if (query.projectId) {
      whereClause += ' AND te.project_id = ?';
      params.push(query.projectId);
    }
    if (query.userId) {
      whereClause += ' AND te.user_id = ?';
      params.push(query.userId);
    }
    if (query.isBillable !== undefined) {
      whereClause += ' AND te.is_billable = ?';
      params.push(['true', '1'].includes(query.isBillable) ? 1 : 0);
    }
    if (query.approvalStatus) {
      whereClause += ' AND te.approval_status = ?';
      params.push(query.approvalStatus);
    }

    const [rows] = await pool.query(
      `SELECT 
         COALESCE(SUM(te.duration_minutes), 0) as total_minutes,
         COALESCE(SUM(CASE WHEN te.approval_status = 'approved' THEN te.duration_minutes ELSE 0 END), 0) as approved_minutes,
         COALESCE(SUM(CASE WHEN te.approval_status = 'submitted' THEN te.duration_minutes ELSE 0 END), 0) as pending_minutes,
         COALESCE(SUM(CASE WHEN te.approval_status = 'rejected' THEN te.duration_minutes ELSE 0 END), 0) as rejected_minutes,
         COALESCE(SUM(CASE WHEN te.approval_status = 'draft' THEN te.duration_minutes ELSE 0 END), 0) as draft_minutes,
         COALESCE(SUM(CASE WHEN te.is_billable = 1 THEN te.duration_minutes ELSE 0 END), 0) as billable_minutes,
         COALESCE(SUM(CASE WHEN te.is_billable = 0 THEN te.duration_minutes ELSE 0 END), 0) as non_billable_minutes
       FROM time_entries te
       ${whereClause}`,
      params
    );

    const r = rows[0] || {};
    return {
      dateRange: { startDate, endDate },
      totalHours: Number((r.total_minutes / 60).toFixed(1)),
      approvedHours: Number((r.approved_minutes / 60).toFixed(1)),
      pendingHours: Number((r.pending_minutes / 60).toFixed(1)),
      rejectedHours: Number((r.rejected_minutes / 60).toFixed(1)),
      draftHours: Number((r.draft_minutes / 60).toFixed(1)),
      billableHours: Number((r.billable_minutes / 60).toFixed(1)),
      nonBillableHours: Number((r.non_billable_minutes / 60).toFixed(1))
    };
  }

  static async getProjectHoursReport(user, query = {}) {
    const { startDate, endDate } = this.resolveDateRange(
      query.period,
      query.startDate,
      query.endDate
    );

    const accessibleProjectIds = await this.getAccessibleProjectIds(user);
    const teScope = this.buildProjectScopeClause(accessibleProjectIds, 'te.project_id');

    const [rows] = await pool.query(
      `SELECT 
         p.id as project_id,
         p.name as project_name,
         p.project_code,
         COALESCE(SUM(te.duration_minutes), 0) as total_minutes,
         COALESCE(SUM(CASE WHEN te.approval_status = 'approved' THEN te.duration_minutes ELSE 0 END), 0) as approved_minutes,
         COALESCE(SUM(CASE WHEN te.approval_status = 'submitted' THEN te.duration_minutes ELSE 0 END), 0) as pending_minutes,
         COALESCE(SUM(CASE WHEN te.is_billable = 1 THEN te.duration_minutes ELSE 0 END), 0) as billable_minutes,
         COALESCE(SUM(CASE WHEN te.is_billable = 0 THEN te.duration_minutes ELSE 0 END), 0) as non_billable_minutes
       FROM projects p
       JOIN time_entries te ON p.id = te.project_id
       WHERE ${teScope.sql}
         AND te.work_date >= ? AND te.work_date <= ?
       GROUP BY p.id, p.name, p.project_code
       ORDER BY total_minutes DESC`,
      [...teScope.params, startDate, endDate]
    );

    return rows.map((r) => ({
      projectId: r.project_id,
      projectName: r.project_name,
      projectCode: r.project_code,
      totalHours: Number((r.total_minutes / 60).toFixed(1)),
      approvedHours: Number((r.approved_minutes / 60).toFixed(1)),
      pendingHours: Number((r.pending_minutes / 60).toFixed(1)),
      billableHours: Number((r.billable_minutes / 60).toFixed(1)),
      nonBillableHours: Number((r.non_billable_minutes / 60).toFixed(1))
    }));
  }

  static async getEmployeeHoursReport(user, query = {}) {
    const { startDate, endDate } = this.resolveDateRange(
      query.period,
      query.startDate,
      query.endDate
    );

    const isGlobal = this.isGlobalAdmin(user);
    let userFilter = '1=1';
    const params = [startDate, endDate];

    // If regular employee without team/all report permission, can only see own hours
    if (!isGlobal && !user.permissions?.includes('reports.view_teams')) {
      userFilter = 'u.id = ?';
      params.push(user.id);
    }

    const [rows] = await pool.query(
      `SELECT 
         u.id as user_id,
         u.name,
         u.email,
         COALESCE(SUM(te.duration_minutes), 0) as total_minutes,
         COALESCE(SUM(CASE WHEN te.approval_status = 'approved' THEN te.duration_minutes ELSE 0 END), 0) as approved_minutes,
         COALESCE(SUM(CASE WHEN te.approval_status = 'submitted' THEN te.duration_minutes ELSE 0 END), 0) as pending_minutes,
         COALESCE(SUM(CASE WHEN te.is_billable = 1 THEN te.duration_minutes ELSE 0 END), 0) as billable_minutes,
         COALESCE(SUM(CASE WHEN te.is_billable = 0 THEN te.duration_minutes ELSE 0 END), 0) as non_billable_minutes
       FROM users u
       JOIN time_entries te ON u.id = te.user_id
       WHERE te.work_date >= ? AND te.work_date <= ?
         AND ${userFilter}
       GROUP BY u.id, u.name, u.email
       ORDER BY total_minutes DESC`,
      params
    );

    return rows.map((r) => ({
      userId: r.user_id,
      name: r.name,
      email: r.email,
      totalHours: Number((r.total_minutes / 60).toFixed(1)),
      approvedHours: Number((r.approved_minutes / 60).toFixed(1)),
      pendingHours: Number((r.pending_minutes / 60).toFixed(1)),
      billableHours: Number((r.billable_minutes / 60).toFixed(1)),
      nonBillableHours: Number((r.non_billable_minutes / 60).toFixed(1))
    }));
  }

  // -------------------------------------------------------------
  // 6. CLIENT REPORTS
  // -------------------------------------------------------------
  static async getClientReports(user, query = {}) {
    const isGlobal = this.isGlobalAdmin(user);
    let clientFilter = '1=1';
    const params = [];

    // Client user isolation: if user is client, only see their client record
    const isClient = user.role === 'client' || (user.roles && user.roles.some((r) => r.slug === 'client'));
    if (!isGlobal && isClient) {
      clientFilter = '(c.user_id = ? OR c.email = ?)';
      params.push(user.id, user.email);
    }

    const [rows] = await pool.query(
      `SELECT 
         c.id,
         c.name,
         c.company_name,
         c.email,
         COUNT(DISTINCT p.id) as total_projects,
         COUNT(DISTINCT CASE WHEN p.status = 'active' THEN p.id END) as active_projects,
         COUNT(DISTINCT CASE WHEN p.status = 'completed' THEN p.id END) as completed_projects,
         COUNT(DISTINCT CASE WHEN p.status != 'completed' AND p.due_date IS NOT NULL AND p.due_date < CURDATE() THEN p.id END) as overdue_projects,
         COUNT(DISTINCT t.id) as total_tasks,
         COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) as completed_tasks,
         COUNT(DISTINCT pm.id) as total_milestones,
         COUNT(DISTINCT CASE WHEN pm.status = 'completed' THEN pm.id END) as completed_milestones,
         COALESCE(SUM(CASE WHEN te.approval_status = 'approved' THEN te.duration_minutes ELSE 0 END), 0) as approved_minutes
       FROM clients c
       LEFT JOIN projects p ON c.id = p.client_id
       LEFT JOIN tasks t ON p.id = t.project_id
       LEFT JOIN project_milestones pm ON p.id = pm.project_id
       LEFT JOIN time_entries te ON p.id = te.project_id
       WHERE ${clientFilter}
       GROUP BY c.id, c.name, c.company_name, c.email
       ORDER BY c.name ASC`,
      params
    );

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      company_name: r.company_name,
      email: r.email,
      total_projects: Number(r.total_projects || 0),
      active_projects: Number(r.active_projects || 0),
      completed_projects: Number(r.completed_projects || 0),
      overdue_projects: Number(r.overdue_projects || 0),
      total_tasks: Number(r.total_tasks || 0),
      completed_tasks: Number(r.completed_tasks || 0),
      total_milestones: Number(r.total_milestones || 0),
      completed_milestones: Number(r.completed_milestones || 0),
      approved_hours: Number((r.approved_minutes / 60).toFixed(1))
    }));
  }

  // -------------------------------------------------------------
  // 7. EXPORT ENGINE
  // -------------------------------------------------------------
  static async exportReport(user, options = {}, reqInfo = {}) {
    const { reportType, format = 'csv' } = options;
    const { startDate, endDate } = this.resolveDateRange(
      options.period,
      options.startDate,
      options.endDate
    );

    let title = '';
    let columns = [];
    let data = [];

    switch (reportType) {
      case 'projects': {
        title = 'Projects Performance Report';
        columns = [
          { header: 'Project Code', key: 'project_code' },
          { header: 'Project Name', key: 'name' },
          { header: 'Status', key: 'status' },
          { header: 'Client', key: 'client_name' },
          { header: 'Project Manager', key: 'manager_name' },
          { header: 'Start Date', key: 'start_date' },
          { header: 'Due Date', key: 'due_date' },
          { header: 'Total Tasks', key: 'total_tasks' },
          { header: 'Completed Tasks', key: 'completed_tasks' },
          { header: 'Task Progress %', key: 'task_completion_rate' },
          { header: 'Milestones %', key: 'milestone_completion_rate' },
          { header: 'Approved Hours', key: 'approved_hours' },
          { header: 'Billable Hours', key: 'billable_hours' }
        ];
        const res = await this.getProjectReports(user, { ...options, limit: 1000 });
        data = res.projects;
        break;
      }

      case 'tasks': {
        title = 'Task Performance Report';
        columns = [
          { header: 'Task Code', key: 'task_code' },
          { header: 'Title', key: 'title' },
          { header: 'Project', key: 'project_name' },
          { header: 'Priority', key: 'priority' },
          { header: 'Status', key: 'status' },
          { header: 'Due Date', key: 'due_date' },
          { header: 'Days Overdue', key: 'days_overdue' },
          { header: 'Tracked Hours', key: 'tracked_hours' },
          { header: 'Completion Hours', key: 'completion_duration_hours' }
        ];
        const res = await this.getTaskReports(user, { ...options, limit: 1000 });
        data = res.tasks;
        break;
      }

      case 'overdue_tasks': {
        title = 'Overdue Tasks Report';
        columns = [
          { header: 'Task Code', key: 'task_code' },
          { header: 'Title', key: 'title' },
          { header: 'Project', key: 'project_name' },
          { header: 'Priority', key: 'priority' },
          { header: 'Status', key: 'status' },
          { header: 'Due Date', key: 'due_date' },
          { header: 'Days Overdue', key: 'days_overdue' }
        ];
        data = await this.getOverdueTasks(user, options);
        break;
      }

      case 'teams': {
        title = 'Team Workload Report';
        columns = [
          { header: 'Team Name', key: 'name' },
          { header: 'Team Leader', key: 'leader_name' },
          { header: 'Active Members', key: 'member_count' },
          { header: 'Assigned Tasks', key: 'assigned_tasks' },
          { header: 'Completed Tasks', key: 'completed_tasks' },
          { header: 'Overdue Tasks', key: 'overdue_tasks' },
          { header: 'Approved Hours', key: 'approved_hours' },
          { header: 'Billable Hours', key: 'billable_hours' }
        ];
        data = await this.getTeamReports(user, options);
        break;
      }

      case 'project_hours': {
        title = 'Project Hours Report';
        columns = [
          { header: 'Project Code', key: 'projectCode' },
          { header: 'Project Name', key: 'projectName' },
          { header: 'Total Tracked Hours', key: 'totalHours' },
          { header: 'Approved Hours', key: 'approvedHours' },
          { header: 'Pending Hours', key: 'pendingHours' },
          { header: 'Billable Hours', key: 'billableHours' },
          { header: 'Non-Billable Hours', key: 'nonBillableHours' }
        ];
        data = await this.getProjectHoursReport(user, options);
        break;
      }

      case 'employee_hours': {
        title = 'Employee Hours Report';
        columns = [
          { header: 'Employee Name', key: 'name' },
          { header: 'Email', key: 'email' },
          { header: 'Total Hours', key: 'totalHours' },
          { header: 'Approved Hours', key: 'approvedHours' },
          { header: 'Pending Hours', key: 'pendingHours' },
          { header: 'Billable Hours', key: 'billableHours' },
          { header: 'Non-Billable Hours', key: 'nonBillableHours' }
        ];
        data = await this.getEmployeeHoursReport(user, options);
        break;
      }

      case 'clients': {
        title = 'Client Performance Report';
        columns = [
          { header: 'Client Name', key: 'name' },
          { header: 'Company', key: 'company_name' },
          { header: 'Email', key: 'email' },
          { header: 'Total Projects', key: 'total_projects' },
          { header: 'Active Projects', key: 'active_projects' },
          { header: 'Completed Projects', key: 'completed_projects' },
          { header: 'Overdue Projects', key: 'overdue_projects' },
          { header: 'Total Tasks', key: 'total_tasks' },
          { header: 'Approved Hours', key: 'approved_hours' }
        ];
        data = await this.getClientReports(user, options);
        break;
      }

      default: {
        const error = new Error(`Unsupported report type: ${reportType}`);
        error.status = 400;
        throw error;
      }
    }

    const metadata = {
      'Generated By': user.name || 'System User',
      'Generated At': new Date().toISOString(),
      'Reporting Period': `${startDate} to ${endDate}`,
      'Total Records': data.length
    };

    const sanitizedFilename = `report_${reportType}_${new Date().toISOString().slice(0, 10)}.${format}`;

    let fileBuffer;
    let contentType;

    if (format === 'xlsx') {
      fileBuffer = await generateXlsxReport({ title, metadata, columns, data });
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else {
      const csvStr = generateCsvReport({ title, metadata, columns, data });
      fileBuffer = Buffer.from(csvStr, 'utf-8');
      contentType = 'text/csv; charset=utf-8';
    }

    // Save record to report_exports
    await pool.query(
      `INSERT INTO report_exports 
       (user_id, report_type, format, status, filters, filename, row_count, file_size, completed_at)
       VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, NOW())`,
      [
        user.id,
        reportType,
        format,
        JSON.stringify(options),
        sanitizedFilename,
        data.length,
        fileBuffer.length
      ]
    );

    // Audit Logging
    await AuditService.log({
      actorId: user.id,
      action: 'report_exported',
      entityType: 'reports',
      entityId: reportType,
      details: {
        reportType,
        format,
        rowCount: data.length,
        period: `${startDate} to ${endDate}`,
        filename: sanitizedFilename
      },
      req: reqInfo.req
    });

    return {
      fileBuffer,
      contentType,
      filename: sanitizedFilename,
      rowCount: data.length
    };
  }
}
