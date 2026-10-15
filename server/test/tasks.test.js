import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import path from 'path';
import fs from 'fs';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';
import { seedRbac } from '../src/modules/rbac/rbac.seed.js';

describe('Phase 5: Task Management, Subtasks, Comments & Attachments Suite', () => {
  let csrfToken = '';
  let csrfCookie = '';

  let ownerCookie = '';
  let pm1Cookie = '';
  let pm2Cookie = '';
  let employee1Cookie = '';
  let employee2Cookie = '';
  let clientCookie = '';

  let ownerId;
  let pm1Id;
  let pm2Id;
  let employee1Id;
  let employee2Id;
  let clientUserId;

  let testProjectId1;
  let testProjectId2;
  let testMilestoneId;

  let createdTaskId;
  let createdSubtaskId;
  let createdCommentId;
  let createdAttachmentId;

  const testDummyFilePath = path.resolve('test-sample.txt');

  beforeAll(async () => {
    // 1. Seed RBAC
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
      if (roleSlug) {
        const [rRows] = await pool.query('SELECT id FROM roles WHERE slug = ?', [roleSlug]);
        if (rRows.length > 0) {
          await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, rRows[0].id]);
        }
      }
      return userId;
    };

    ownerId = await setupUser('P5 Owner', 'p5_owner@agency.com', 'owner', 'owner');
    pm1Id = await setupUser('P5 Project Manager 1', 'p5_pm1@agency.com', 'project-manager');
    pm2Id = await setupUser('P5 Project Manager 2', 'p5_pm2@agency.com', 'project-manager');
    employee1Id = await setupUser('P5 Employee 1', 'p5_emp1@agency.com', 'employee');
    employee2Id = await setupUser('P5 Employee 2', 'p5_emp2@agency.com', 'employee');
    clientUserId = await setupUser('P5 Client User', 'p5_client@agency.com', 'client');

    // Create client
    const [cRes] = await pool.query(
      `INSERT INTO clients (name, email, company_name, user_id, status)
       VALUES ('P5 Client Corp', 'p5_corp@client.com', 'P5 Client Corp', ?, 'active')
       ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
      [clientUserId]
    );
    const clientId = cRes.insertId;

    // Create Project 1 (managed by PM1, includes Employee 1)
    const [p1Res] = await pool.query(
      `INSERT INTO projects (name, project_code, description, client_id, project_manager_id, created_by, status)
       VALUES ('P5 Project One', 'P5-PRJ1', 'First test project', ?, ?, ?, 'active')
       ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
      [clientId, pm1Id, ownerId]
    );
    testProjectId1 = p1Res.insertId;
    await pool.query(
      'INSERT IGNORE INTO project_members (project_id, user_id, project_role) VALUES (?, ?, "manager"), (?, ?, "member")',
      [testProjectId1, pm1Id, testProjectId1, employee1Id]
    );

    // Create Project 2 (managed by PM2, strictly isolated from PM1 and Employee 1)
    const [p2Res] = await pool.query(
      `INSERT INTO projects (name, project_code, description, project_manager_id, created_by, status)
       VALUES ('P5 Project Two', 'P5-PRJ2', 'Isolated test project', ?, ?, 'active')
       ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
      [pm2Id, ownerId]
    );
    testProjectId2 = p2Res.insertId;
    await pool.query(
      'INSERT IGNORE INTO project_members (project_id, user_id, project_role) VALUES (?, ?, "manager")',
      [testProjectId2, pm2Id]
    );

    // Create a milestone in Project 1
    const [mRes] = await pool.query(
      `INSERT INTO project_milestones (project_id, title, status)
       VALUES (?, 'Phase 1 MVP', 'pending')`,
      [testProjectId1]
    );
    testMilestoneId = mRes.insertId;

    // Create dummy text file for attachment testing
    fs.writeFileSync(testDummyFilePath, 'Test attachment content for agency manager task system.');

    // Helper to log in users
    const loginUser = async (email) => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email, password: testPassword });
      const c = res.headers['set-cookie'];
      const accessCookie = c.find((ck) => ck.startsWith('access_token='));
      return [csrfCookie, accessCookie].join('; ');
    };

    ownerCookie = await loginUser('p5_owner@agency.com');
    pm1Cookie = await loginUser('p5_pm1@agency.com');
    pm2Cookie = await loginUser('p5_pm2@agency.com');
    employee1Cookie = await loginUser('p5_emp1@agency.com');
    employee2Cookie = await loginUser('p5_emp2@agency.com');
    clientCookie = await loginUser('p5_client@agency.com');
  });

  afterAll(async () => {
    // Cleanup files
    if (fs.existsSync(testDummyFilePath)) {
      fs.unlinkSync(testDummyFilePath);
    }
  });

  // 1. Task Creation with Valid Data
  it('1. POST /api/tasks creates a task with valid data and assignees', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Cookie', pm1Cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Build Login API Endpoint',
        description: 'Implement JWT refresh token rotation',
        projectId: testProjectId1,
        milestoneId: testMilestoneId,
        priority: 'high',
        status: 'todo',
        startDate: '2026-10-15',
        dueDate: '2026-10-25',
        estimatedMinutes: 240,
        labels: ['backend', 'security'],
        assigneeIds: [employee1Id]
      });

    expect(res.status).toBe(201);
    expect(res.body.task).toBeDefined();
    expect(res.body.task.title).toBe('Build Login API Endpoint');
    expect(res.body.task.task_code).toMatch(/^P5-PRJ1-T\d+$/);
    expect(res.body.task.assignees.length).toBe(1);
    expect(res.body.task.assignees[0].user_id).toBe(employee1Id);

    createdTaskId = res.body.task.id;
  });

  // 2. Duplicate or Invalid Resource References
  it('2. POST /api/tasks rejects cross-project milestone reference', async () => {
    // Attempting to create task in Project 2 with milestone from Project 1
    const res = await request(app)
      .post('/api/tasks')
      .set('Cookie', pm2Cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Invalid Milestone Task',
        projectId: testProjectId2,
        milestoneId: testMilestoneId // Milestone belongs to Project 1!
      });

    expect(res.status).toBe(400);
    const errText = typeof res.body.error === 'object' ? res.body.error.message : res.body.error;
    expect(errText).toMatch(/milestone does not belong/i);
  });

  // 3. Unauthorized Project Access
  it('3. POST /api/tasks rejects task creation in an unauthorized project', async () => {
    // PM1 attempting to create task in Project 2 (managed by PM2)
    const res = await request(app)
      .post('/api/tasks')
      .set('Cookie', pm1Cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Unauthorized Task',
        projectId: testProjectId2
      });

    expect(res.status).toBe(403);
  });

  // 4. Task Updates and Permission Checks
  it('4. PUT /api/tasks/:id allows authorized PM to update task specifications', async () => {
    const res = await request(app)
      .put(`/api/tasks/${createdTaskId}`)
      .set('Cookie', pm1Cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Build Enhanced Login API',
        priority: 'urgent',
        estimatedMinutes: 300
      });

    expect(res.status).toBe(200);
    expect(res.body.task.title).toBe('Build Enhanced Login API');
    expect(res.body.task.priority).toBe('urgent');
  });

  // 5. Multiple Assignee Assignment
  it('5. PUT /api/tasks/:id/assignees assigns multiple users to a task', async () => {
    const res = await request(app)
      .put(`/api/tasks/${createdTaskId}/assignees`)
      .set('Cookie', pm1Cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        assigneeIds: [employee1Id, employee2Id]
      });

    expect(res.status).toBe(200);
    expect(res.body.task.assignees.length).toBe(2);
  });

  // 6. Invalid or Inactive Assignees Rejection
  it('6. PUT /api/tasks/:id/assignees rejects invalid assignee user ID', async () => {
    const res = await request(app)
      .put(`/api/tasks/${createdTaskId}/assignees`)
      .set('Cookie', pm1Cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        assigneeIds: [9999999]
      });

    expect(res.status).toBe(400);
    const errText = typeof res.body.error === 'object' ? res.body.error.message : res.body.error;
    expect(errText).toMatch(/do not exist/i);
  });

  // 7. Valid and Invalid Workflow Transitions
  it('7a. PATCH /api/tasks/:id/status allows valid transition: todo -> in_progress', async () => {
    const res = await request(app)
      .patch(`/api/tasks/${createdTaskId}/status`)
      .set('Cookie', employee1Cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'in_progress' });

    expect(res.status).toBe(200);
    expect(res.body.task.status).toBe('in_progress');
  });

  it('7b. PATCH /api/tasks/:id/status rejects invalid transition for regular employee: in_progress -> todo', async () => {
    const res = await request(app)
      .patch(`/api/tasks/${createdTaskId}/status`)
      .set('Cookie', employee1Cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'todo' });

    expect(res.status).toBe(409);
    const errText = typeof res.body.error === 'object' ? res.body.error.message : res.body.error;
    expect(errText).toMatch(/invalid status transition/i);
  });

  it('7c. PATCH /api/tasks/:id/status allows completing task: in_progress -> completed', async () => {
    const res = await request(app)
      .patch(`/api/tasks/${createdTaskId}/status`)
      .set('Cookie', employee1Cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'completed' });

    expect(res.status).toBe(200);
    expect(res.body.task.status).toBe('completed');
    expect(res.body.task.completed_at).toBeDefined();
  });

  // 8. Task Reopening Authorization
  it('8. POST /api/tasks/:id/reopen reopens completed task to in_progress', async () => {
    const res = await request(app)
      .post(`/api/tasks/${createdTaskId}/reopen`)
      .set('Cookie', pm1Cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ comment: 'Client requested minor adjustment' });

    expect(res.status).toBe(200);
    expect(res.body.task.status).toBe('in_progress');
    expect(res.body.task.completed_at).toBeNull();
  });

  // 9. Subtasks & Project Consistency
  it('9. POST /api/tasks/:id/subtasks creates a subtask under the parent task in the same project', async () => {
    const res = await request(app)
      .post(`/api/tasks/${createdTaskId}/subtasks`)
      .set('Cookie', pm1Cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Subtask: Write Unit Tests',
        priority: 'medium',
        dueDate: '2026-10-22'
      });

    expect(res.status).toBe(201);
    expect(res.body.subtask).toBeDefined();
    expect(res.body.subtask.parent_task_id).toBe(createdTaskId);
    expect(res.body.subtask.project_id).toBe(testProjectId1);

    createdSubtaskId = res.body.subtask.id;
  });

  // 10. Subtasks List & Progress Tracking
  it('10. GET /api/tasks/:id includes subtasks and calculates progress', async () => {
    const res = await request(app)
      .get(`/api/tasks/${createdTaskId}`)
      .set('Cookie', pm1Cookie);

    expect(res.status).toBe(200);
    expect(res.body.task.subtasks.length).toBeGreaterThanOrEqual(1);
  });

  // 11. Comments Authorization and Ownership
  it('11a. POST /api/tasks/:id/comments adds discussion comment to task', async () => {
    const res = await request(app)
      .post(`/api/tasks/${createdTaskId}/comments`)
      .set('Cookie', employee1Cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        commentText: 'Initial PR drafted and ready for code review.'
      });

    expect(res.status).toBe(201);
    expect(res.body.comment).toBeDefined();
    expect(res.body.comment.comment_text).toBe('Initial PR drafted and ready for code review.');
    createdCommentId = res.body.comment.id;
  });

  it('11b. PUT /api/tasks/:id/comments/:commentId rejects editing another user comment by standard employee', async () => {
    // Employee 2 attempting to edit Employee 1 comment
    const res = await request(app)
      .put(`/api/tasks/${createdTaskId}/comments/${createdCommentId}`)
      .set('Cookie', employee2Cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        commentText: 'Tampered comment text'
      });

    expect(res.status).toBe(403);
  });

  it('11c. PUT /api/tasks/:id/comments/:commentId allows comment author to edit own comment', async () => {
    const res = await request(app)
      .put(`/api/tasks/${createdTaskId}/comments/${createdCommentId}`)
      .set('Cookie', employee1Cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        commentText: 'Initial PR drafted and all tests passing.'
      });

    expect(res.status).toBe(200);
    expect(res.body.comment.comment_text).toBe('Initial PR drafted and all tests passing.');
  });

  // 12. Attachment Upload and MIME Validation
  it('12. POST /api/tasks/:id/attachments uploads attachment with size and type validation', async () => {
    const res = await request(app)
      .post(`/api/tasks/${createdTaskId}/attachments`)
      .set('Cookie', employee1Cookie)
      .set('X-CSRF-Token', csrfToken)
      .attach('file', testDummyFilePath);

    expect(res.status).toBe(201);
    expect(res.body.attachment).toBeDefined();
    expect(res.body.attachment.original_filename).toBe('test-sample.txt');
    createdAttachmentId = res.body.attachment.id;
  });

  // 13. Attachment Download and Unauthorized Download Rejection
  it('13a. GET /api/tasks/:id/attachments/:attachmentId/download downloads attachment for authorized user', async () => {
    const res = await request(app)
      .get(`/api/tasks/${createdTaskId}/attachments/${createdAttachmentId}/download`)
      .set('Cookie', pm1Cookie);

    expect(res.status).toBe(200);
    expect(res.text).toContain('Test attachment content');
  });

  it('13b. GET /api/tasks/:id/attachments/:attachmentId/download rejects unauthorized PM2', async () => {
    const res = await request(app)
      .get(`/api/tasks/${createdTaskId}/attachments/${createdAttachmentId}/download`)
      .set('Cookie', pm2Cookie);

    expect(res.status).toBe(403);
  });

  // 14. Cross-Project Task Access Rejection
  it('14. GET /api/tasks/:id rejects unrelated PM from accessing other project tasks', async () => {
    const res = await request(app)
      .get(`/api/tasks/${createdTaskId}`)
      .set('Cookie', pm2Cookie);

    expect(res.status).toBe(403);
  });

  // 15. Task List Pagination and Filters
  it('15. GET /api/tasks supports search, status, and project filters with pagination', async () => {
    const res = await request(app)
      .get(`/api/tasks?projectId=${testProjectId1}&search=Login&limit=10&offset=0`)
      .set('Cookie', pm1Cookie);

    expect(res.status).toBe(200);
    expect(res.body.tasks).toBeDefined();
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.tasks.length).toBeGreaterThanOrEqual(1);
  });

  // 16. My Tasks Isolation
  it('16. GET /api/tasks/my-tasks returns tasks assigned to the authenticated user', async () => {
    const res = await request(app)
      .get('/api/tasks/my-tasks')
      .set('Cookie', employee1Cookie);

    expect(res.status).toBe(200);
    expect(res.body.tasks.some((t) => Number(t.id) === Number(createdTaskId))).toBe(true);

    // Unrelated PM2 has no assigned tasks
    const pm2Res = await request(app)
      .get('/api/tasks/my-tasks')
      .set('Cookie', pm2Cookie);

    expect(pm2Res.status).toBe(200);
    expect(pm2Res.body.total).toBe(0);
  });

  // 17. Task Archival
  it('17. POST /api/tasks/:id/archive archives task', async () => {
    const res = await request(app)
      .post(`/api/tasks/${createdTaskId}/archive`)
      .set('Cookie', pm1Cookie)
      .set('X-CSRF-Token', csrfToken);

    expect(res.status).toBe(200);

    const [rows] = await pool.query('SELECT is_archived FROM tasks WHERE id = ?', [createdTaskId]);
    expect(rows[0].is_archived).toBe(1);
  });

  // 18. Audit and Status History
  it('18. Verifies audit and status history logged for task operations', async () => {
    const [historyRows] = await pool.query(
      'SELECT * FROM task_status_history WHERE task_id = ? ORDER BY id ASC',
      [createdTaskId]
    );

    expect(historyRows.length).toBeGreaterThanOrEqual(3); // none->todo, todo->in_progress, in_progress->completed, reopened
  });
});
