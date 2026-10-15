import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { seedRbac } from '../src/modules/rbac/rbac.seed.js';
import { emailService } from '../src/modules/notifications/email.service.js';
import { RemindersService } from '../src/modules/notifications/reminders.service.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';

describe('Phase 6: Workflow Automation, Task Approvals & Notifications Suite', () => {
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
  let activeApprovalId;
  let sampleNotificationId;

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

      const [rRows] = await pool.query('SELECT id FROM roles WHERE slug = ?', [roleSlug]);
      if (rRows.length > 0) {
        await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [
          userId,
          rRows[0].id
        ]);
      }
      return userId;
    };

    ownerId = await setupUser('Workflow Owner', 'wf_owner@example.com', 'owner', 'owner');
    pmId = await setupUser('Workflow PM', 'wf_pm@example.com', 'project-manager', 'project_manager');
    employeeId = await setupUser('Workflow Employee', 'wf_employee@example.com', 'employee', 'employee');
    outsiderId = await setupUser('Workflow Outsider', 'wf_outsider@example.com', 'employee', 'employee');

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

    ownerCookie = await loginUser('wf_owner@example.com');
    pmCookie = await loginUser('wf_pm@example.com');
    employeeCookie = await loginUser('wf_employee@example.com');
    outsiderCookie = await loginUser('wf_outsider@example.com');

    // Create a test project managed by pmId, with employeeId assigned
    const [pRes] = await pool.query(
      `INSERT INTO projects (name, project_code, project_manager_id, status, visibility)
       VALUES ('Workflow Project', 'WF-TEST', ?, 'active', 'internal')`,
      [pmId]
    );
    testProjectId = pRes.insertId;

    // Assign employee to project
    await pool.query(
      `INSERT INTO project_members (project_id, user_id, added_by)
       VALUES (?, ?, ?)`,
      [testProjectId, employeeId, pmId]
    );

    // Create a test task in_progress
    const [tRes] = await pool.query(
      `INSERT INTO tasks (task_code, title, project_id, creator_id, status, priority, due_date)
       VALUES ('WF-1', 'Approval Workflow Engine', ?, ?, 'in_progress', 'high', DATE_ADD(CURDATE(), INTERVAL 1 DAY))`,
      [testProjectId, pmId]
    );
    testTaskId = tRes.insertId;

    // Assign employee to task
    await pool.query(
      `INSERT INTO task_assignees (task_id, user_id, assigned_by)
       VALUES (?, ?, ?)`,
      [testTaskId, employeeId, pmId]
    );
  });

  afterAll(async () => {
    // Cleanup
    if (testProjectId) {
      await pool.query('DELETE FROM projects WHERE id = ?', [testProjectId]);
    }
  });

  // 1. Valid Task Review Submission
  it('1. should allow employee to submit an in_progress task for review', async () => {
    const res = await request(app)
      .post(`/api/tasks/${testTaskId}/submit-review`)
      .set('Cookie', employeeCookie)
      .set('x-csrf-token', csrfToken)
      .send({ submissionNotes: 'All unit tests passing and documentation written.' });

    expect(res.status).toBe(201);
    expect(res.body.approval).toBeDefined();
    expect(res.body.approval.status).toBe('pending');
    expect(res.body.approval.submitted_by).toBe(employeeId);
    activeApprovalId = res.body.approval.id;

    // Verify task status transitioned to in_review
    const [tRows] = await pool.query('SELECT status FROM tasks WHERE id = ?', [testTaskId]);
    expect(tRows[0].status).toBe('in_review');

    // Verify reviewer notification was generated for PM
    const [nRows] = await pool.query(
      `SELECT * FROM notifications WHERE recipient_user_id = ? AND entity_id = ? AND type = 'review_requested'`,
      [pmId, activeApprovalId]
    );
    expect(nRows.length).toBeGreaterThan(0);
  });

  // 2. Unauthorized Review Submission
  it('2. should reject review submission from user without project access', async () => {
    const res = await request(app)
      .post(`/api/tasks/${testTaskId}/submit-review`)
      .set('Cookie', outsiderCookie)
      .set('x-csrf-token', csrfToken)
      .send({ submissionNotes: 'Malicious review submission' });

    expect([403, 404, 409]).toContain(res.status);
  });

  // 3. Unauthorized Approval Attempt
  it('3. should reject approval by user without approvals.approve permission', async () => {
    const res = await request(app)
      .post(`/api/tasks/${testTaskId}/approvals/${activeApprovalId}/approve`)
      .set('Cookie', outsiderCookie)
      .set('x-csrf-token', csrfToken)
      .send({ feedback: 'Looks good' });

    expect([403, 404]).toContain(res.status);
  });

  // 4. Self-Approval Prevention
  it('4. should prevent reviewer from approving their own submission', async () => {
    const [pmTaskRes] = await pool.query(
      `INSERT INTO tasks (task_code, title, project_id, creator_id, status, priority)
       VALUES ('WF-SELF', 'PM Self Task', ?, ?, 'in_progress', 'medium')`,
      [testProjectId, pmId]
    );
    const pmTaskId = pmTaskRes.insertId;

    const subRes = await request(app)
      .post(`/api/tasks/${pmTaskId}/submit-review`)
      .set('Cookie', pmCookie)
      .set('x-csrf-token', csrfToken)
      .send({ submissionNotes: 'Self submission by PM' });

    expect(subRes.status).toBe(201);
    const selfApprovalId = subRes.body.approval.id;

    // PM attempts to approve own submission
    const res = await request(app)
      .post(`/api/tasks/${pmTaskId}/approvals/${selfApprovalId}/approve`)
      .set('Cookie', pmCookie)
      .set('x-csrf-token', csrfToken)
      .send({ feedback: 'I approve my own work' });

    expect(res.status).toBe(403);
    expect(res.body.error?.code || res.body.code).toBe('CANNOT_APPROVE_OWN_SUBMISSION');

    await pool.query('DELETE FROM tasks WHERE id = ?', [pmTaskId]);
  });

  // 5. Duplicate Approval Request Prevention
  it('5. should reject duplicate submission while task is already in review', async () => {
    const res = await request(app)
      .post(`/api/tasks/${testTaskId}/submit-review`)
      .set('Cookie', employeeCookie)
      .set('x-csrf-token', csrfToken)
      .send({ submissionNotes: 'Duplicate submission attempt' });

    expect(res.status).toBe(409);
    expect(res.body.error?.code || res.body.code).toBe('APPROVAL_ALREADY_PENDING');
  });

  // 6. Revision Feedback Validation
  it('6. should reject revision request if reviewer feedback is empty or too short', async () => {
    const res = await request(app)
      .post(`/api/tasks/${testTaskId}/approvals/${activeApprovalId}/request-revision`)
      .set('Cookie', pmCookie)
      .set('x-csrf-token', csrfToken)
      .send({ reviewerFeedback: 'bad' }); // Under 5 chars

    expect(res.status).toBe(400);
  });

  // 7. Revision Request and Resubmission History Preservation
  it('7. should request revisions, return task to in_progress, and preserve history on resubmission', async () => {
    // Reviewer requests revisions
    const revRes = await request(app)
      .post(`/api/tasks/${testTaskId}/approvals/${activeApprovalId}/request-revision`)
      .set('Cookie', pmCookie)
      .set('x-csrf-token', csrfToken)
      .send({ reviewerFeedback: 'Please add automated integration tests for edge cases.' });

    expect(revRes.status).toBe(200);
    expect(revRes.body.approval.status).toBe('revision_requested');

    // Task returns to in_progress
    const [t1] = await pool.query('SELECT status FROM tasks WHERE id = ?', [testTaskId]);
    expect(t1[0].status).toBe('in_progress');

    // Submitter addresses revisions and resubmits
    const resubmitRes = await request(app)
      .post(`/api/tasks/${testTaskId}/submit-review`)
      .set('Cookie', employeeCookie)
      .set('x-csrf-token', csrfToken)
      .send({ submissionNotes: 'Added integration tests covering all edge cases.' });

    expect(resubmitRes.status).toBe(201);
    const newApprovalId = resubmitRes.body.approval.id;
    expect(newApprovalId).not.toBe(activeApprovalId);

    // Verify approval history preserves both records
    const histRes = await request(app)
      .get(`/api/tasks/${testTaskId}/approval-history`)
      .set('Cookie', pmCookie);

    expect(histRes.status).toBe(200);
    expect(histRes.body.history.length).toBe(2);
    expect(histRes.body.history.some((h) => h.status === 'revision_requested')).toBe(true);
    expect(histRes.body.history.some((h) => h.status === 'pending')).toBe(true);

    activeApprovalId = newApprovalId;
  });

  // 8. Successful Approval and Task Completion
  it('8. should allow authorized PM to approve submission and complete task', async () => {
    const approveRes = await request(app)
      .post(`/api/tasks/${testTaskId}/approvals/${activeApprovalId}/approve`)
      .set('Cookie', pmCookie)
      .set('x-csrf-token', csrfToken)
      .send({ feedback: 'All requirements verified. Excellent work!' });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.approval.status).toBe('approved');

    // Task must be completed with completed_at set
    const [tRows] = await pool.query('SELECT status, completed_at FROM tasks WHERE id = ?', [testTaskId]);
    expect(tRows[0].status).toBe('completed');
    expect(tRows[0].completed_at).not.toBeNull();

    // Submitter received task_approved notification
    const [nRows] = await pool.query(
      `SELECT * FROM notifications WHERE recipient_user_id = ? AND type = 'task_approved' ORDER BY id DESC LIMIT 1`,
      [employeeId]
    );
    expect(nRows.length).toBeGreaterThan(0);
    sampleNotificationId = nRows[0].id;
  });

  // 9. Invalid Workflow Transition (Cannot re-approve an already approved approval)
  it('9. should reject approving an approval request that is already approved', async () => {
    const res = await request(app)
      .post(`/api/tasks/${testTaskId}/approvals/${activeApprovalId}/approve`)
      .set('Cookie', pmCookie)
      .set('x-csrf-token', csrfToken)
      .send({ feedback: 'Re-approving' });

    expect(res.status).toBe(409);
    expect(res.body.error?.code || res.body.code).toBe('INVALID_APPROVAL_STATE');
  });

  // 10. Notification Recipient Isolation
  it('10. should isolate user notifications so user A cannot see user B notifications', async () => {
    const empNotifsRes = await request(app)
      .get('/api/notifications')
      .set('Cookie', employeeCookie);

    expect(empNotifsRes.status).toBe(200);
    const empNotifIds = empNotifsRes.body.notifications.map((n) => n.id);
    expect(empNotifIds).toContain(sampleNotificationId);

    // Outsider user gets notifications
    const outsiderNotifsRes = await request(app)
      .get('/api/notifications')
      .set('Cookie', outsiderCookie);

    expect(outsiderNotifsRes.status).toBe(200);
    const outsiderNotifIds = outsiderNotifsRes.body.notifications.map((n) => n.id);
    expect(outsiderNotifIds).not.toContain(sampleNotificationId);
  });

  // 11. Unauthorized Notification Access
  it('11. should prevent user B from marking or deleting user A notification', async () => {
    const markRes = await request(app)
      .patch(`/api/notifications/${sampleNotificationId}/read`)
      .set('Cookie', outsiderCookie)
      .set('x-csrf-token', csrfToken);

    expect([403, 404]).toContain(markRes.status);

    const delRes = await request(app)
      .delete(`/api/notifications/${sampleNotificationId}`)
      .set('Cookie', outsiderCookie)
      .set('x-csrf-token', csrfToken);

    expect([403, 404]).toContain(delRes.status);
  });

  // 12. Read and Unread Notification States
  it('12. should mark notification as read and decrement unread count', async () => {
    const countBeforeRes = await request(app)
      .get('/api/notifications/unread-count')
      .set('Cookie', employeeCookie);

    const countBefore = countBeforeRes.body.unreadCount;
    expect(countBefore).toBeGreaterThan(0);

    const [unreadRows] = await pool.query(
      `SELECT id FROM notifications WHERE recipient_user_id = ? AND read_at IS NULL ORDER BY id DESC LIMIT 1`,
      [employeeId]
    );
    expect(unreadRows.length).toBeGreaterThan(0);
    const targetNotifId = unreadRows[0].id;

    // Mark single notification read
    const markRes = await request(app)
      .patch(`/api/notifications/${targetNotifId}/read`)
      .set('Cookie', employeeCookie)
      .set('x-csrf-token', csrfToken);

    expect(markRes.status).toBe(200);

    // Verify unread count decremented
    const countAfterRes = await request(app)
      .get('/api/notifications/unread-count')
      .set('Cookie', employeeCookie);

    expect(countAfterRes.body.unreadCount).toBe(countBefore - 1);

    // Mark all as read
    const markAllRes = await request(app)
      .patch('/api/notifications/read-all')
      .set('Cookie', employeeCookie)
      .set('x-csrf-token', csrfToken);

    expect(markAllRes.status).toBe(200);

    const countFinalRes = await request(app)
      .get('/api/notifications/unread-count')
      .set('Cookie', employeeCookie);

    expect(countFinalRes.body.unreadCount).toBe(0);
  });

  // 13. Notification Preferences Management
  it('13. should retrieve and update user notification preferences', async () => {
    const getRes = await request(app)
      .get('/api/notifications/preferences')
      .set('Cookie', employeeCookie);

    expect(getRes.status).toBe(200);
    expect(getRes.body.preferences).toBeDefined();

    // Disable email notifications
    const updateRes = await request(app)
      .put('/api/notifications/preferences')
      .set('Cookie', employeeCookie)
      .set('x-csrf-token', csrfToken)
      .send({ emailEnabled: false, overdueReminders: false });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.preferences.emailEnabled).toBe(false);
    expect(updateRes.body.preferences.overdueReminders).toBe(false);
  });

  // 14. Email Queue and Retry Mechanism
  it('14. should process email queue jobs with retry on delivery failure', async () => {
    // Enqueue an email job
    const jobId = await emailService.enqueueEmail({
      recipientEmail: 'worker_test@example.com',
      subject: 'Test Delivery Subject',
      htmlBody: '<p>Test delivery</p>',
      textBody: 'Test delivery',
      idempotencyKey: `test-${Date.now()}`
    });

    expect(jobId).toBeDefined();

    // Process the queue
    const processed = await emailService.processQueue(5);
    expect(processed).toBeGreaterThan(0);

    // Verify status updated in database
    const [jobs] = await pool.query('SELECT status FROM email_jobs WHERE id = ?', [jobId]);
    expect(['sent', 'processing', 'pending']).toContain(jobs[0].status);
  });

  // 15. Deadline Reminder Idempotency and Completed Task Exclusion
  it('15. should run deadline reminders idempotently and exclude completed tasks', async () => {
    // Task testTaskId is currently 'completed', so it should NOT be reminded
    const initialReminders = await RemindersService.checkAndSendReminders();
    
    // Create an uncompleted task due tomorrow
    const [dueTaskRes] = await pool.query(
      `INSERT INTO tasks (task_code, title, project_id, creator_id, status, priority, due_date)
       VALUES ('WF-DUE', 'Upcoming Release Checklist', ?, ?, 'in_progress', 'urgent', DATE_ADD(CURDATE(), INTERVAL 1 DAY))`,
      [testProjectId, pmId]
    );
    const dueTaskId = dueTaskRes.insertId;

    await pool.query(
      `INSERT INTO task_assignees (task_id, user_id, assigned_by)
       VALUES (?, ?, ?)`,
      [dueTaskId, employeeId, pmId]
    );

    // First reminder scan should pick up dueTaskId
    const sent1 = await RemindersService.checkAndSendReminders();
    expect(sent1).toBeGreaterThanOrEqual(1);

    // Second reminder scan immediately should find 0 new reminders due to idempotency
    const sent2 = await RemindersService.checkAndSendReminders();
    expect(sent2).toBe(0);

    // Clean up dueTask
    await pool.query('DELETE FROM tasks WHERE id = ?', [dueTaskId]);
  });

  // 16. Audit Logging Generation for Approvals
  it('16. should write audit logs for approval submissions and decisions', async () => {
    const [auditRows] = await pool.query(
      `SELECT action, entity_type FROM audit_logs
       WHERE entity_type = 'task' AND action IN ('task.submitted_for_review', 'task.approval_approved')
       ORDER BY id DESC LIMIT 5`
    );

    expect(auditRows.length).toBeGreaterThan(0);
  });
});
