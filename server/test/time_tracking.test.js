import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';
import { seedRbac } from '../src/modules/rbac/rbac.seed.js';

describe('Phase 7: Time Tracking, Timesheets & Work Logs Suite', () => {
  let csrfToken = '';
  let csrfCookie = '';

  let ownerCookie = '';
  let pmCookie = '';
  let employeeCookie = '';
  let outsiderCookie = '';

  let ownerId;
  let pmId;
  let employeeId;
  let outsiderId;

  let testProjectId;
  let testTaskId;
  let activeTimerId;
  let manualEntryId;
  let timerEntryId;
  let testTimesheetId;

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

    ownerId = await setupUser('Time Owner', 'time_owner@example.com', 'owner', 'owner');
    pmId = await setupUser('Time PM', 'time_pm@example.com', 'project-manager', 'project_manager');
    employeeId = await setupUser('Time Employee', 'time_employee@example.com', 'employee', 'employee');
    outsiderId = await setupUser('Time Outsider', 'time_outsider@example.com', 'employee', 'employee');

    const loginUser = async (email) => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Cookie', csrfCookie)
        .set('x-csrf-token', csrfToken)
        .send({ email, password: testPassword });

      const setCookies = res.headers['set-cookie'] || [];
      const accessCookie = setCookies.find((c) => c.startsWith('access_token='));
      return `${csrfCookie}; ${accessCookie}`;
    };

    ownerCookie = await loginUser('time_owner@example.com');
    pmCookie = await loginUser('time_pm@example.com');
    employeeCookie = await loginUser('time_employee@example.com');
    outsiderCookie = await loginUser('time_outsider@example.com');

    // Create a project managed by pmId, with employeeId added as a member
    const [pRes] = await pool.query(
      `INSERT INTO projects (name, project_code, project_manager_id, status, visibility)
       VALUES ('Time Tracking Project', 'TIME-PROJ', ?, 'active', 'internal')
       ON DUPLICATE KEY UPDATE project_manager_id = ?`,
      [pmId, pmId]
    );
    testProjectId = pRes.insertId || (await pool.query('SELECT id FROM projects WHERE project_code = "TIME-PROJ"'))[0][0].id;

    // Add employee to project members
    await pool.query(
      'INSERT IGNORE INTO project_members (project_id, user_id, project_role) VALUES (?, ?, "member")',
      [testProjectId, employeeId]
    );

    // Create task assigned to employee
    const [tRes] = await pool.query(
      `INSERT INTO tasks (project_id, task_code, title, status, priority, creator_id, estimated_minutes)
       VALUES (?, 'TIME-101', 'Time Tracking Task', 'in_progress', 'high', ?, 120)`,
      [testProjectId, pmId]
    );
    testTaskId = tRes.insertId;

    await pool.query(
      'INSERT IGNORE INTO task_assignees (task_id, user_id) VALUES (?, ?)',
      [testTaskId, employeeId]
    );
  });

  afterAll(async () => {
    // Clean up test data
    if (testTaskId) {
      await pool.query('DELETE FROM active_timers WHERE task_id = ?', [testTaskId]);
      await pool.query('DELETE FROM time_entries WHERE task_id = ?', [testTaskId]);
      await pool.query('DELETE FROM task_assignees WHERE task_id = ?', [testTaskId]);
      await pool.query('DELETE FROM tasks WHERE id = ?', [testTaskId]);
    }
    if (testProjectId) {
      await pool.query('DELETE FROM timesheets WHERE user_id IN (?, ?, ?, ?)', [ownerId, pmId, employeeId, outsiderId]);
      await pool.query('DELETE FROM project_members WHERE project_id = ?', [testProjectId]);
      await pool.query('DELETE FROM projects WHERE id = ?', [testProjectId]);
    }
  });

  // ==========================================
  // 1. TIMERS
  // ==========================================

  it('1. should start a task timer successfully', async () => {
    const res = await request(app)
      .post('/api/timers/start')
      .set('Cookie', employeeCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        taskId: testTaskId,
        description: 'Working on phase 7 implementation'
      });

    expect(res.status).toBe(201);
    expect(res.body.timer).toBeDefined();
    expect(res.body.timer.taskId).toBe(testTaskId);
    expect(res.body.timer.status).toBe('running');
    activeTimerId = res.body.timer.id;
  });

  it('2. should reject starting a second timer for the same user (concurrency safeguard)', async () => {
    const res = await request(app)
      .post('/api/timers/start')
      .set('Cookie', employeeCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        taskId: testTaskId,
        description: 'Trying concurrent timer'
      });

    expect(res.status).toBe(400);
    expect(res.body.message || res.body.error?.message).toMatch(/already have an active timer running/i);
  });

  it('3. should retrieve the current running active timer with server elapsed seconds', async () => {
    const res = await request(app)
      .get('/api/timers/active')
      .set('Cookie', employeeCookie);

    expect(res.status).toBe(200);
    expect(res.body.timer).not.toBeNull();
    expect(res.body.timer.id).toBe(activeTimerId);
    expect(res.body.timer.elapsedSeconds).toBeGreaterThanOrEqual(0);
    expect(res.body.timer.taskTitle).toBe('Time Tracking Task');
  });

  it('4. should reject an unauthorized user from accessing another’s running timer', async () => {
    const res = await request(app)
      .get(`/api/timers/${activeTimerId}`)
      .set('Cookie', outsiderCookie);

    expect(res.status).toBe(403);
  });

  it('5. should stop the running timer and record a draft time entry', async () => {
    const res = await request(app)
      .post(`/api/timers/${activeTimerId}/stop`)
      .set('Cookie', employeeCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        description: 'Completed unit of work',
        isBillable: true
      });

    expect(res.status).toBe(200);
    expect(res.body.timeEntry).toBeDefined();
    expect(res.body.timeEntry.entryType).toBe('timer');
    expect(res.body.timeEntry.approvalStatus).toBe('draft');
    expect(res.body.timeEntry.durationMinutes).toBeGreaterThanOrEqual(1);
    expect(res.body.timeEntry.isBillable).toBe(true);

    timerEntryId = res.body.timeEntry.id;

    // Verify active timer was deleted from database
    const [timerRows] = await pool.query('SELECT * FROM active_timers WHERE id = ?', [activeTimerId]);
    expect(timerRows.length).toBe(0);
  });

  // ==========================================
  // 2. MANUAL TIME ENTRIES
  // ==========================================

  it('6. should reject manual time entry on an inaccessible task', async () => {
    const res = await request(app)
      .post('/api/time-entries')
      .set('Cookie', outsiderCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        taskId: testTaskId,
        workDate: '2026-10-10',
        durationMinutes: 60,
        description: 'Unauthorized work'
      });

    expect(res.status).toBe(403);
  });

  it('7. should reject manual time entry with invalid duration limits (<= 0 or > 1440)', async () => {
    const resZero = await request(app)
      .post('/api/time-entries')
      .set('Cookie', employeeCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        taskId: testTaskId,
        workDate: '2026-10-10',
        durationMinutes: 0
      });

    expect(resZero.status).toBe(400);

    const resTooLarge = await request(app)
      .post('/api/time-entries')
      .set('Cookie', employeeCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        taskId: testTaskId,
        workDate: '2026-10-10',
        durationMinutes: 2000
      });

    expect(resTooLarge.status).toBe(400);
  });

  it('8. should create a valid manual time entry for employee', async () => {
    const res = await request(app)
      .post('/api/time-entries')
      .set('Cookie', employeeCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        taskId: testTaskId,
        workDate: '2026-10-10',
        durationMinutes: 90,
        description: 'Manual log for feature development',
        isBillable: true
      });

    expect(res.status).toBe(201);
    expect(res.body.entry).toBeDefined();
    expect(res.body.entry.duration_minutes).toBe(90);
    expect(res.body.entry.entry_type).toBe('manual');
    expect(res.body.entry.approval_status).toBe('draft');
    manualEntryId = res.body.entry.id;
  });

  it('9. should allow employee to edit their own draft time entry', async () => {
    const res = await request(app)
      .put(`/api/time-entries/${manualEntryId}`)
      .set('Cookie', employeeCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        durationMinutes: 120,
        description: 'Updated description after review'
      });

    expect(res.status).toBe(200);
    expect(res.body.entry.duration_minutes).toBe(120);
    expect(res.body.entry.description).toBe('Updated description after review');
  });

  it('10. should prevent another user from modifying employee’s time entry', async () => {
    const res = await request(app)
      .put(`/api/time-entries/${manualEntryId}`)
      .set('Cookie', outsiderCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        durationMinutes: 45
      });

    expect(res.status).toBe(403);
  });

  // ==========================================
  // 3. TIMESHEETS WORKFLOW
  // ==========================================

  it('11. should prepare a timesheet for a reporting period with linked draft work entries', async () => {
    const res = await request(app)
      .post('/api/timesheets')
      .set('Cookie', employeeCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        periodStart: '2026-10-05',
        periodEnd: '2026-10-11'
      });

    expect(res.status).toBe(201);
    expect(res.body.timesheet).toBeDefined();
    expect(res.body.timesheet.status).toBe('draft');
    expect(res.body.timesheet.entries.length).toBeGreaterThan(0);
    expect(res.body.timesheet.totalMinutes).toBeGreaterThan(0);
    testTimesheetId = res.body.timesheet.id;
  });

  it('12. should reject duplicate / overlapping timesheets for the same user period', async () => {
    const res = await request(app)
      .post('/api/timesheets')
      .set('Cookie', employeeCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        periodStart: '2026-10-05',
        periodEnd: '2026-10-11'
      });

    expect(res.status).toBe(400);
    expect(res.body.message || res.body.error?.message).toMatch(/already exists covering the dates/i);
  });

  it('13. should submit timesheet for review and lock entries to submitted status', async () => {
    const res = await request(app)
      .post(`/api/timesheets/${testTimesheetId}/submit`)
      .set('Cookie', employeeCookie)
      .set('x-csrf-token', csrfToken)
      .send();

    expect(res.status).toBe(200);
    expect(res.body.timesheet.status).toBe('submitted');

    // Verify time entries are now 'submitted'
    const [entryRows] = await pool.query(
      'SELECT approval_status FROM time_entries WHERE id = ?',
      [manualEntryId]
    );
    expect(entryRows[0].approval_status).toBe('submitted');
  });

  it('14. should prevent modifying time entries once submitted', async () => {
    const res = await request(app)
      .put(`/api/time-entries/${manualEntryId}`)
      .set('Cookie', employeeCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        durationMinutes: 180
      });

    expect(res.status).toBe(400);
    expect(res.body.message || res.body.error?.message).toMatch(/Cannot edit a submitted time entry/i);
  });

  it('15. should prevent self-approval on timesheets (self-approval prevention)', async () => {
    // 1. Employee without approve permission is rejected
    const empRes = await request(app)
      .post(`/api/timesheets/${testTimesheetId}/approve`)
      .set('Cookie', employeeCookie)
      .set('x-csrf-token', csrfToken)
      .send();

    expect(empRes.status).toBe(403);

    // 2. PM who has timesheets.approve permission cannot approve their own timesheet
    const pmEntryRes = await request(app)
      .post('/api/time-entries')
      .set('Cookie', pmCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        taskId: testTaskId,
        workDate: '2026-10-02',
        durationMinutes: 60,
        description: 'PM work entry'
      });
    expect(pmEntryRes.status).toBe(201);

    const pmSheetRes = await request(app)
      .post('/api/timesheets')
      .set('Cookie', pmCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        periodStart: '2026-10-01',
        periodEnd: '2026-10-04'
      });
    expect(pmSheetRes.status).toBe(201);
    const pmSheetId = pmSheetRes.body.timesheet.id;

    await request(app)
      .post(`/api/timesheets/${pmSheetId}/submit`)
      .set('Cookie', pmCookie)
      .set('x-csrf-token', csrfToken)
      .send();

    const selfApproveRes = await request(app)
      .post(`/api/timesheets/${pmSheetId}/approve`)
      .set('Cookie', pmCookie)
      .set('x-csrf-token', csrfToken)
      .send();

    expect(selfApproveRes.status).toBe(403);
    expect(selfApproveRes.body.message || selfApproveRes.body.error?.message).toMatch(/Self-approval is prohibited/i);
  });

  it('16. should allow authorized manager to reject timesheet with required explanation', async () => {
    const res = await request(app)
      .post(`/api/timesheets/${testTimesheetId}/reject`)
      .set('Cookie', pmCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        reviewerComment: 'Please split the 120-minute development entry into more descriptive subtask items.'
      });

    expect(res.status).toBe(200);
    expect(res.body.timesheet.status).toBe('rejected');
    expect(res.body.timesheet.reviewer_comment).toContain('Please split');

    // Verify time entries were unlocked to rejected
    const [entryRows] = await pool.query(
      'SELECT approval_status FROM time_entries WHERE id = ?',
      [manualEntryId]
    );
    expect(entryRows[0].approval_status).toBe('rejected');
  });

  it('17. should allow employee to re-edit entry after rejection and resubmit timesheet', async () => {
    // Edit entry
    const editRes = await request(app)
      .put(`/api/time-entries/${manualEntryId}`)
      .set('Cookie', employeeCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        description: 'Detailed: API routes and database schema integration'
      });
    expect(editRes.status).toBe(200);

    // Resubmit timesheet
    const submitRes = await request(app)
      .post(`/api/timesheets/${testTimesheetId}/submit`)
      .set('Cookie', employeeCookie)
      .set('x-csrf-token', csrfToken)
      .send();
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.timesheet.status).toBe('submitted');
  });

  it('18. should allow authorized manager to approve timesheet and lock entries to approved', async () => {
    const res = await request(app)
      .post(`/api/timesheets/${testTimesheetId}/approve`)
      .set('Cookie', pmCookie)
      .set('x-csrf-token', csrfToken)
      .send();

    expect(res.status).toBe(200);
    expect(res.body.timesheet.status).toBe('approved');
    expect(res.body.timesheet.reviewed_by).toBe(pmId);

    // Entries locked to approved
    const [entryRows] = await pool.query(
      'SELECT approval_status FROM time_entries WHERE id = ?',
      [manualEntryId]
    );
    expect(entryRows[0].approval_status).toBe('approved');
  });

  it('19. should strictly prevent deleting or editing approved entries', async () => {
    const delRes = await request(app)
      .delete(`/api/time-entries/${manualEntryId}`)
      .set('Cookie', employeeCookie)
      .set('x-csrf-token', csrfToken);

    expect(delRes.status).toBe(400);
    expect(delRes.body.message || delRes.body.error?.message).toMatch(/Cannot delete a approved time entry/i);
  });

  // ==========================================
  // 4. REPORTS & SUMMARIES
  // ==========================================

  it('20. should return correct aggregated billable and non-billable summary stats', async () => {
    const res = await request(app)
      .get('/api/time-reports/summary')
      .set('Cookie', pmCookie);

    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    expect(res.body.summary.totalHours).toBeGreaterThan(0);
    expect(res.body.summary.billableHours).toBeGreaterThan(0);
    expect(res.body.summary.approvedHours).toBeGreaterThan(0);
  });

  it('21. should return task-wise time breakdown in project time summary', async () => {
    const res = await request(app)
      .get(`/api/projects/${testProjectId}/time-summary`)
      .set('Cookie', pmCookie);

    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    expect(res.body.summary.projectId).toBe(testProjectId);
    expect(res.body.summary.tasks.length).toBeGreaterThan(0);
    const targetTask = res.body.summary.tasks.find((t) => t.taskId === testTaskId);
    expect(targetTask).toBeDefined();
    expect(targetTask.loggedHours).toBeGreaterThan(0);
  });

  it('22. should return task time summary with estimated vs logged hours', async () => {
    const res = await request(app)
      .get(`/api/tasks/${testTaskId}/time-summary`)
      .set('Cookie', employeeCookie);

    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    expect(res.body.summary.taskId).toBe(testTaskId);
    expect(res.body.summary.estimatedHours).toBe(2); // 120 minutes = 2 hours
    expect(res.body.summary.totalHours).toBeGreaterThan(0);
    expect(res.body.summary.recentEntries.length).toBeGreaterThan(0);
  });
});
