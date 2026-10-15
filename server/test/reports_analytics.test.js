import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';
import { seedRbac } from '../src/modules/rbac/rbac.seed.js';

describe('Phase 8: Advanced Reports, Analytics & Data Export Suite', () => {
  let csrfToken = '';
  let csrfCookie = '';

  let ownerCookie = '';
  let pmCookie = '';
  let employeeCookie = '';
  let clientCookie = '';
  let outsiderCookie = '';

  let ownerId;
  let pmId;
  let employeeId;
  let clientUserId;
  let outsiderId;

  let testClientId;
  let testProjectId;
  let testTeamId;
  let task1Id;
  let task2Id;
  let overdueTaskId;

  beforeAll(async () => {
    // 1. Seed RBAC permissions
    await seedRbac();

    // 2. Fetch CSRF token
    const csrfRes = await request(app).get('/api/auth/csrf-token');
    csrfToken = csrfRes.body.csrfToken;
    const cookies = csrfRes.headers['set-cookie'];
    csrfCookie = cookies.find((c) => c.startsWith('xsrf_token='));

    const testPassword = 'Password123!';
    const passwordHash = await bcrypt.hash(testPassword, 10);

    const setupUser = async (name, email, roleSlug, systemRole = 'member') => {
      await pool.query(
        `INSERT INTO users (name, email, password_hash, role, status)
         VALUES (?, ?, ?, ?, 'active')
         ON DUPLICATE KEY UPDATE password_hash = ?, status = 'active'`,
        [name, email, passwordHash, systemRole, passwordHash]
      );
      const [uRows] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
      const userId = uRows[0].id;

      const [rRows] = await pool.query('SELECT id FROM roles WHERE slug = ?', [roleSlug]);
      if (rRows.length > 0) {
        await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [
          userId,
          rRows[0].id
        ]);
      }
      return userId;
    };

    ownerId = await setupUser('Report Owner', 'owner_rep@example.com', 'admin', 'owner');
    pmId = await setupUser('Report PM', 'pm_rep@example.com', 'project-manager');
    employeeId = await setupUser('Report Emp', 'emp_rep@example.com', 'employee');
    clientUserId = await setupUser('Report Client', 'client_rep@example.com', 'client', 'client');
    outsiderId = await setupUser('Report Outsider', 'outsider_rep@example.com', 'project-manager');

    // Login each to capture cookies
    const login = async (email) => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Cookie', [csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ email, password: testPassword });
      const c = res.headers['set-cookie'];
      const accessCookie = c.find((x) => x.startsWith('access_token='));
      return accessCookie;
    };

    ownerCookie = await login('owner_rep@example.com');
    pmCookie = await login('pm_rep@example.com');
    employeeCookie = await login('emp_rep@example.com');
    clientCookie = await login('client_rep@example.com');
    outsiderCookie = await login('outsider_rep@example.com');

    // 3. Setup Client, Team, Project, Milestones, and Tasks
    const [cRes] = await pool.query(
      `INSERT INTO clients (name, company_name, email, user_id)
       VALUES ('Apex Corp', 'Apex Technologies', 'client_rep@example.com', ?)`,
      [clientUserId]
    );
    testClientId = cRes.insertId;

    const [tRes] = await pool.query(
      `INSERT INTO teams (name, description, leader_id)
       VALUES ('Analytics Alpha', 'Data Analytics and BI Team', ?)`,
      [pmId]
    );
    testTeamId = tRes.insertId;
    await pool.query('INSERT IGNORE INTO team_members (team_id, user_id, team_role) VALUES (?, ?, ?)', [
      testTeamId,
      employeeId,
      'member'
    ]);

    const [pRes] = await pool.query(
      `INSERT INTO projects (name, project_code, description, status, client_id, project_manager_id, start_date, due_date)
       VALUES ('Project Analytics Portal', 'P-ANALYTICS', 'Advanced BI Portal', 'active', ?, ?, '2026-01-01', '2026-12-31')`,
      [testClientId, pmId]
    );
    testProjectId = pRes.insertId;

    await pool.query('INSERT IGNORE INTO project_members (project_id, user_id, project_role) VALUES (?, ?, ?)', [
      testProjectId,
      employeeId,
      'member'
    ]);

    // Milestones
    await pool.query(
      `INSERT INTO project_milestones (project_id, title, status, due_date, display_order)
       VALUES (?, 'Phase 1 MVP Deliverable', 'completed', '2026-06-01', 1),
              (?, 'Phase 2 Scale Deliverable', 'pending', '2026-12-01', 2)`,
      [testProjectId, testProjectId]
    );

    // Tasks (1 completed, 1 in progress, 1 overdue)
    const [task1] = await pool.query(
      `INSERT INTO tasks (project_id, creator_id, task_code, title, status, priority, due_date, completed_at)
       VALUES (?, ?, 'P-ANALYTICS-1', 'Build ETL pipelines', 'completed', 'high', '2026-05-01', NOW())`,
      [testProjectId, pmId]
    );
    task1Id = task1.insertId;

    const [task2] = await pool.query(
      `INSERT INTO tasks (project_id, creator_id, task_code, title, status, priority, due_date)
       VALUES (?, ?, 'P-ANALYTICS-2', 'Dashboard UI', 'in_progress', 'medium', '2026-11-01')`,
      [testProjectId, pmId]
    );
    task2Id = task2.insertId;

    const [task3] = await pool.query(
      `INSERT INTO tasks (project_id, creator_id, task_code, title, status, priority, due_date)
       VALUES (?, ?, 'P-ANALYTICS-3', 'Overdue Task item', 'todo', 'urgent', '2025-01-01')`,
      [testProjectId, pmId]
    );
    overdueTaskId = task3.insertId;

    await pool.query(
      `INSERT IGNORE INTO task_assignees (task_id, user_id) VALUES (?, ?), (?, ?)`,
      [task1Id, employeeId, task2Id, employeeId]
    );

    // Time entries (Approved billable, approved non-billable, pending/submitted)
    await pool.query(
      `INSERT INTO time_entries (user_id, project_id, task_id, work_date, duration_minutes, is_billable, approval_status, description)
       VALUES (?, ?, ?, CURDATE(), 180, 1, 'approved', 'Completed ETL data pipeline transformations'),
              (?, ?, ?, CURDATE(), 60, 0, 'approved', 'Internal sync meeting non-billable'),
              (?, ?, ?, CURDATE(), 120, 1, 'submitted', 'Draft UI wireframes pending approval')`,
      [employeeId, testProjectId, task1Id, employeeId, testProjectId, task2Id, employeeId, testProjectId, task2Id]
    );
  });

  afterAll(async () => {
    try {
      if (testProjectId) {
        await pool.query('DELETE FROM time_entries WHERE project_id = ?', [testProjectId]);
        await pool.query('DELETE FROM tasks WHERE project_id = ?', [testProjectId]);
        await pool.query('DELETE FROM project_milestones WHERE project_id = ?', [testProjectId]);
        await pool.query('DELETE FROM project_members WHERE project_id = ?', [testProjectId]);
        await pool.query('DELETE FROM projects WHERE id = ?', [testProjectId]);
      }
      if (testTeamId) {
        await pool.query('DELETE FROM team_members WHERE team_id = ?', [testTeamId]);
        await pool.query('DELETE FROM teams WHERE id = ?', [testTeamId]);
      }
      if (testClientId) {
        await pool.query('DELETE FROM clients WHERE id = ?', [testClientId]);
      }
      await pool.query("DELETE FROM users WHERE email LIKE '%_rep@example.com'");
    } catch {
      // Cleanup best effort
    }
  });

  // 1. Dashboard Aggregations
  it('1. should return accurate dashboard KPI metrics and distributions', async () => {
    const res = await request(app)
      .get('/api/reports/dashboard?period=last_30_days')
      .set('Cookie', [ownerCookie]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const { kpis, taskStatusDistribution, projectStatusDistribution, projectMilestoneCompletion } = res.body.data;

    expect(kpis.totalProjects).toBeGreaterThanOrEqual(1);
    expect(kpis.totalTasks).toBeGreaterThanOrEqual(3);
    expect(kpis.overdueTasks).toBeGreaterThanOrEqual(1);
    expect(kpis.approvedHours).toBeGreaterThanOrEqual(4.0); // 180 + 60 = 240 min = 4.0 hrs
    expect(kpis.billableHours).toBeGreaterThanOrEqual(3.0); // 180 min = 3.0 hrs
    expect(kpis.nonBillableHours).toBeGreaterThanOrEqual(1.0); // 60 min = 1.0 hr

    expect(Array.isArray(taskStatusDistribution)).toBe(true);
    expect(Array.isArray(projectStatusDistribution)).toBe(true);
    expect(projectMilestoneCompletion.totalMilestones).toBeGreaterThanOrEqual(2);
  });

  // 2. Date Range Filtering
  it('2. should correctly filter dashboard metrics by date range', async () => {
    const res = await request(app)
      .get('/api/reports/dashboard?period=today')
      .set('Cookie', [ownerCookie]);

    expect(res.status).toBe(200);
    expect(res.body.data.dateRange.period).toBe('today');
  });

  // 3. Timezone / Boundary Handling
  it('3. should reject invalid date range where startDate is after endDate', async () => {
    const res = await request(app)
      .get('/api/reports/projects?startDate=2026-12-31&endDate=2026-01-01')
      .set('Cookie', [ownerCookie]);

    // Error handler or validation should return 400
    expect([400, 422]).toContain(res.status);
  });

  // 4. Project Report Authorization Scoping
  it('4. should respect project authorization scoping for non-admin users', async () => {
    const resOutsider = await request(app)
      .get('/api/reports/projects')
      .set('Cookie', [outsiderCookie]);

    expect(resOutsider.status).toBe(200);
    // Outsider is not a member of testProjectId
    const found = resOutsider.body.data.projects.find((p) => p.id === testProjectId);
    expect(found).toBeUndefined();

    const resPM = await request(app)
      .get('/api/reports/projects')
      .set('Cookie', [pmCookie]);

    expect(resPM.status).toBe(200);
    const pmFound = resPM.body.data.projects.find((p) => p.id === testProjectId);
    expect(pmFound).toBeDefined();
    expect(pmFound.name).toBe('Project Analytics Portal');
  });

  // 5. Client Report Isolation
  it('5. should restrict client users to only their authorized client reports', async () => {
    const resClient = await request(app)
      .get('/api/reports/clients')
      .set('Cookie', [clientCookie]);

    expect(resClient.status).toBe(200);
    expect(Array.isArray(resClient.body.data)).toBe(true);
    resClient.body.data.forEach((c) => {
      expect(c.id).toBe(testClientId);
    });
  });

  // 6. Project Details Report Deep Dive
  it('6. should provide detailed milestone and task breakdown for a project', async () => {
    const res = await request(app)
      .get(`/api/reports/projects/${testProjectId}`)
      .set('Cookie', [pmCookie]);

    expect(res.status).toBe(200);
    const { project, milestones, tasksBreakdown, timeBreakdown } = res.body.data;
    expect(project.id).toBe(testProjectId);
    expect(milestones.length).toBeGreaterThanOrEqual(2);
    expect(tasksBreakdown.total).toBeGreaterThanOrEqual(3);
    expect(timeBreakdown.approvedHours).toBeGreaterThanOrEqual(4.0);
  });

  // 7. Overdue Tasks Report
  it('7. should list overdue tasks with calculated days overdue', async () => {
    const res = await request(app)
      .get('/api/reports/overdue-tasks')
      .set('Cookie', [ownerCookie]);

    expect(res.status).toBe(200);
    const overdue = res.body.data.find((t) => t.id === overdueTaskId);
    expect(overdue).toBeDefined();
    expect(overdue.days_overdue).toBeGreaterThan(0);
  });

  // 8. Task Performance Report & Assignees
  it('8. should return task report with status, priority, and assignees', async () => {
    const res = await request(app)
      .get(`/api/reports/tasks?projectId=${testProjectId}`)
      .set('Cookie', [pmCookie]);

    expect(res.status).toBe(200);
    expect(res.body.data.tasks.length).toBeGreaterThanOrEqual(3);
    const t1 = res.body.data.tasks.find((t) => t.id === task1Id);
    expect(t1).toBeDefined();
    expect(t1.status).toBe('completed');
    expect(t1.assignees.length).toBeGreaterThanOrEqual(1);
  });

  // 9. Task Completion Trends
  it('9. should return task completion trends and average duration', async () => {
    const res = await request(app)
      .get('/api/reports/task-completion?period=last_30_days')
      .set('Cookie', [ownerCookie]);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  // 10. Team Workload Reports
  it('10. should return team workload summary with tasks and hours', async () => {
    const res = await request(app)
      .get('/api/reports/teams')
      .set('Cookie', [ownerCookie]);

    expect(res.status).toBe(200);
    const team = res.body.data.find((t) => t.id === testTeamId);
    expect(team).toBeDefined();
    expect(team.name).toBe('Analytics Alpha');
    expect(team.member_count).toBeGreaterThanOrEqual(1);
  });

  // 11. Team Workload Deep Dive
  it('11. should return team drill-down with individual member workloads', async () => {
    const res = await request(app)
      .get(`/api/reports/teams/${testTeamId}`)
      .set('Cookie', [pmCookie]);

    expect(res.status).toBe(200);
    const { team, members } = res.body.data;
    expect(team.id).toBe(testTeamId);
    expect(members.length).toBeGreaterThanOrEqual(1);
    const emp = members.find((m) => m.id === employeeId);
    expect(emp).toBeDefined();
    expect(emp.assigned_tasks).toBeGreaterThanOrEqual(2);
  });

  // 12. Time Summary Report (Approved vs Unapproved Separation)
  it('12. should clearly distinguish approved, pending, billable, and non-billable hours', async () => {
    const res = await request(app)
      .get(`/api/reports/time-summary?projectId=${testProjectId}`)
      .set('Cookie', [ownerCookie]);

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.approvedHours).toBeGreaterThanOrEqual(4.0);
    expect(data.pendingHours).toBeGreaterThanOrEqual(2.0); // 120 min = 2.0 hrs
    expect(data.billableHours).toBeGreaterThanOrEqual(5.0); // (180 + 120) / 60 = 5.0 hrs
    expect(data.nonBillableHours).toBeGreaterThanOrEqual(1.0); // 60 min = 1.0 hr
  });

  // 13. Project Hours Aggregation
  it('13. should aggregate tracked hours grouped by project', async () => {
    const res = await request(app)
      .get('/api/reports/project-hours')
      .set('Cookie', [ownerCookie]);

    expect(res.status).toBe(200);
    const p = res.body.data.find((x) => x.projectId === testProjectId);
    expect(p).toBeDefined();
    expect(p.totalHours).toBeGreaterThanOrEqual(6.0); // 180 + 60 + 120 = 360 min = 6.0 hrs
  });

  // 14. Employee Hours Scoping
  it('14. should scope employee hours for employees without view_teams permission', async () => {
    const res = await request(app)
      .get('/api/reports/employee-hours')
      .set('Cookie', [employeeCookie]);

    expect(res.status).toBe(200);
    // Employee can only see own hours
    expect(res.body.data.every((e) => e.userId === employeeId)).toBe(true);
  });

  // 15. CSV Export Generation
  it('15. should export project reports to CSV format with safe headers and records', async () => {
    const res = await request(app)
      .post('/api/reports/exports')
      .set('Cookie', [csrfCookie, ownerCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        reportType: 'projects',
        format: 'csv',
        period: 'last_30_days'
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('.csv');
    expect(res.text).toContain('Project Code');
    expect(res.text).toContain('P-ANALYTICS');
  });

  // 16. XLSX Export Generation
  it('16. should export task reports to Excel XLSX format', async () => {
    const res = await request(app)
      .post('/api/reports/exports')
      .set('Cookie', [csrfCookie, ownerCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        reportType: 'tasks',
        format: 'xlsx',
        period: 'last_30_days'
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toContain('.xlsx');
    expect(res.headers['content-length']).toBeDefined();
  });

  // 17. Formula Injection Protection
  it('17. should neutralize spreadsheet formula injection payloads (=, +, -, @)', async () => {
    const { sanitizeCellValue } = await import('../src/modules/reports/reports.export.js');
    expect(sanitizeCellValue('=1+1')).toBe("'=1+1");
    expect(sanitizeCellValue('+cmd|')).toBe("'+cmd|");
    expect(sanitizeCellValue('-2+3')).toBe("'-2+3");
    expect(sanitizeCellValue('@SUM(A1:A10)')).toBe("'@SUM(A1:A10)");
    expect(sanitizeCellValue('\tTAB_INJECT')).toBe("'\tTAB_INJECT");
    expect(sanitizeCellValue('Safe Project')).toBe('Safe Project');
    expect(sanitizeCellValue(100)).toBe(100);
  });

  // 18. Export Permission Enforcement
  it('18. should reject export requests from users without reports.export permission', async () => {
    const res = await request(app)
      .post('/api/reports/exports')
      .set('Cookie', [csrfCookie, clientCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        reportType: 'projects',
        format: 'csv'
      });

    expect(res.status).toBe(403);
  });

  // 19. Export Security Audit Logging
  it('19. should record audit log entries when an export is executed', async () => {
    await request(app)
      .post('/api/reports/exports')
      .set('Cookie', [csrfCookie, pmCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        reportType: 'teams',
        format: 'csv'
      });

    const [logs] = await pool.query(
      `SELECT * FROM audit_logs 
       WHERE actor_id = ? AND action = 'report_exported' 
       ORDER BY id DESC LIMIT 1`,
      [pmId]
    );

    expect(logs.length).toBe(1);
    expect(logs[0].action).toBe('report_exported');
    const detailsStr = typeof logs[0].details === 'string' ? logs[0].details : JSON.stringify(logs[0].details);
    expect(detailsStr).toContain('teams');
  });

  // 20. Empty Report Handling Gracefully
  it('20. should handle empty reports gracefully without crashing', async () => {
    const res = await request(app)
      .get('/api/reports/projects?status=cancelled')
      .set('Cookie', [ownerCookie]);

    expect(res.status).toBe(200);
    expect(res.body.data.projects).toBeDefined();
    expect(res.body.data.pagination.total).toBeDefined();
  });
});
