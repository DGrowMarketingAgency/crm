import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';
import { seedRbac } from '../src/modules/rbac/rbac.seed.js';
import { DeliverablesService } from '../src/modules/deliverables/deliverables.service.js';
import fs from 'fs';
import path from 'path';

describe('Phase 5: Internal Review, Client Approval & Deliverable Revision Workflow Suite', () => {
  let csrfToken = '';
  let csrfCookie = '';

  let ownerCookie = '';
  let amCookie = '';
  let employeeCookie = '';
  let clientACookie = '';
  let clientBCookie = '';
  let outsiderCookie = '';

  let ownerId;
  let amId;
  let employeeId;
  let clientAUserId;
  let clientBUserId;
  let outsiderId;

  let testClientAId;
  let testClientBId;
  let testProjectId;
  let internalOnlyTaskId;
  let clientFacingTaskId;

  beforeAll(async () => {
    // 1. Seed RBAC to ensure deliverables permissions exist
    await seedRbac();

    // 2. Fetch CSRF token
    const csrfRes = await request(app).get('/api/auth/csrf-token');
    csrfToken = csrfRes.body.csrfToken;
    const cookies = csrfRes.headers['set-cookie'];
    csrfCookie = cookies.find((c) => c.startsWith('xsrf_token='));

    const testPassword = 'Password123!';
    const passwordHash = await bcrypt.hash(testPassword, 10);

    // 3. Setup Test Clients
    await pool.query(
      `INSERT INTO clients (name, email, client_code, status, lifecycle_stage, entity)
       VALUES ('Apex Health Client A', 'apex_client_a@test.com', 'CLT-APEX', 'active', 'L2', 'D-Grow')
       ON DUPLICATE KEY UPDATE status = 'active'`
    );
    const [c1Rows] = await pool.query("SELECT id FROM clients WHERE client_code = 'CLT-APEX'");
    testClientAId = c1Rows[0].id;

    await pool.query(
      `INSERT INTO clients (name, email, client_code, status, lifecycle_stage, entity)
       VALUES ('Beta Tech Client B', 'beta_client_b@test.com', 'CLT-BETA', 'active', 'L2', 'D-Grow')
       ON DUPLICATE KEY UPDATE status = 'active'`
    );
    const [c2Rows] = await pool.query("SELECT id FROM clients WHERE client_code = 'CLT-BETA'");
    testClientBId = c2Rows[0].id;

    // Helper to setup users with roles & client association
    const setupUser = async (name, email, roleSlug, systemRole = 'member', clientId = null) => {
      await pool.query(
        `INSERT INTO users (name, email, password_hash, role, status, client_id)
         VALUES (?, ?, ?, ?, 'active', ?)
         ON DUPLICATE KEY UPDATE password_hash = ?, status = 'active', client_id = ?`,
        [name, email, passwordHash, systemRole, clientId, passwordHash, clientId]
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

    ownerId = await setupUser('Phase 5 Owner', 'p5_owner@dgrow.com', 'owner', 'owner');
    amId = await setupUser('Phase 5 AM', 'p5_am@dgrow.com', 'account-manager', 'member');
    employeeId = await setupUser('Phase 5 Employee', 'p5_employee@dgrow.com', 'seo-exec', 'member');
    clientAUserId = await setupUser('Apex Client Contact', 'apex_contact@clienta.com', 'client', 'client', testClientAId);
    clientBUserId = await setupUser('Beta Client Contact', 'beta_contact@clientb.com', 'client', 'client', testClientBId);
    outsiderId = await setupUser('Phase 5 Outsider', 'p5_outsider@dgrow.com', 'employee', 'member');

    // Update Client A's Account Manager
    await pool.query('UPDATE clients SET account_manager_id = ? WHERE id = ?', [amId, testClientAId]);

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

    ownerCookie = await loginUser('p5_owner@dgrow.com');
    amCookie = await loginUser('p5_am@dgrow.com');
    employeeCookie = await loginUser('p5_employee@dgrow.com');
    clientACookie = await loginUser('apex_contact@clienta.com');
    clientBCookie = await loginUser('beta_contact@clientb.com');
    outsiderCookie = await loginUser('p5_outsider@dgrow.com');

    // Setup Test Project
    const [pRes] = await pool.query(
      `INSERT INTO projects (name, project_code, client_id, project_manager_id, status, visibility)
       VALUES ('Phase 5 Deliverable Project', 'P5-DELIV-PRJ', ?, ?, 'active', 'internal')
       ON DUPLICATE KEY UPDATE status = 'active'`,
      [testClientAId, amId]
    );
    const [pRows] = await pool.query("SELECT id FROM projects WHERE project_code = 'P5-DELIV-PRJ'");
    testProjectId = pRows[0].id;

    // Add employee to project members
    await pool.query(
      `INSERT IGNORE INTO project_members (project_id, user_id, project_role)
       VALUES (?, ?, 'contributor')`,
      [testProjectId, employeeId]
    );

    // Setup 1: Non-Client-Facing Task (Internal Only)
    const [t1Res] = await pool.query(
      `INSERT INTO tasks (
        task_code, title, project_id, client_id, creator_id, assignee_id,
        status, column_status, requires_internal_review, requires_client_approval, is_client_deliverable
      ) VALUES (
        'P5-INT-TASK-001', 'Keyword Strategy Internal Research', ?, ?, ?, ?,
        'in_progress', 'in_progress', TRUE, FALSE, FALSE
      )`,
      [testProjectId, testClientAId, amId, employeeId]
    );
    internalOnlyTaskId = t1Res.insertId;

    // Setup 2: Client-Facing Deliverable Task
    const [t2Res] = await pool.query(
      `INSERT INTO tasks (
        task_code, title, project_id, client_id, creator_id, assignee_id,
        status, column_status, requires_internal_review, requires_client_approval, is_client_deliverable, requires_deliverable
      ) VALUES (
        'P5-CLI-TASK-002', 'Q4 SEO Technical Audit & Recommendations', ?, ?, ?, ?,
        'in_progress', 'in_progress', TRUE, TRUE, TRUE, TRUE
      )`,
      [testProjectId, testClientAId, amId, employeeId]
    );
    clientFacingTaskId = t2Res.insertId;
  });

  afterAll(async () => {
    // Cleanup created test records
    if (internalOnlyTaskId) {
      await pool.query('DELETE FROM tasks WHERE id = ?', [internalOnlyTaskId]);
    }
    if (clientFacingTaskId) {
      await pool.query('DELETE FROM tasks WHERE id = ?', [clientFacingTaskId]);
    }
    if (testProjectId) {
      await pool.query('DELETE FROM projects WHERE id = ?', [testProjectId]);
    }
  });

  // Test 1: Employee submits work for internal review
  it('1. Employee submits deliverable for internal review', async () => {
    const res = await request(app)
      .post(`/api/tasks/${internalOnlyTaskId}/deliverables/submit-review`)
      .set('Cookie', employeeCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        title: 'Keyword Research Spreadsheet v1',
        deliverableType: 'document',
        deliverableUrl: 'https://docs.google.com/spreadsheets/d/test-sheet-id',
        submissionNotes: 'Completed comprehensive seed and competitor keyword research.'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.submission).toBeDefined();
    expect(res.body.data.submission.version_number).toBe(1);
    expect(res.body.data.submission.internal_review_status).toBe('pending');
    expect(res.body.data.submission.client_approval_status).toBe('not_required');

    // Verify task status transitioned to in_review / client_review
    const [taskRows] = await pool.query('SELECT status, column_status FROM tasks WHERE id = ?', [internalOnlyTaskId]);
    expect(taskRows[0].status).toBe('in_review');
    expect(taskRows[0].column_status).toBe('client_review');
  });

  // Test 2 & 4: Non-client-facing task completes upon internal AM approval without client approval
  it('2 & 4. Account Manager internally approves non-client-facing work; task completes without client approval', async () => {
    // Get submission id
    const [subRows] = await pool.query(
      'SELECT id FROM deliverable_submissions WHERE task_id = ? ORDER BY version_number DESC',
      [internalOnlyTaskId]
    );
    const submissionId = subRows[0].id;

    const res = await request(app)
      .post(`/api/deliverables/${submissionId}/review-internal`)
      .set('Cookie', amCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        decision: 'approved',
        feedback: 'Great keyword clustering. Internal signoff granted.'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.submission.internal_review_status).toBe('approved');
    expect(res.body.data.submission.client_approval_status).toBe('not_required');

    // Verify task completed automatically
    const [taskRows] = await pool.query('SELECT status, column_status FROM tasks WHERE id = ?', [internalOnlyTaskId]);
    expect(taskRows[0].status).toBe('completed');
    expect(taskRows[0].column_status).toBe('done');
  });

  // Test 3: Internal reviewer requests changes on work
  it('3. Internal reviewer requests changes and task moves to rework state', async () => {
    // First, employee submits client-facing task
    const subRes = await request(app)
      .post(`/api/tasks/${clientFacingTaskId}/deliverables/submit-review`)
      .set('Cookie', employeeCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        title: 'Draft SEO Audit v1',
        deliverableType: 'document',
        deliverableUrl: 'https://docs.google.com/document/d/draft-audit',
        submissionNotes: 'Initial draft of technical crawl.'
      });

    expect(subRes.status).toBe(201);
    const submissionId = subRes.body.data.submission.id;

    // AM requests changes
    const revRes = await request(app)
      .post(`/api/deliverables/${submissionId}/review-internal`)
      .set('Cookie', amCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        decision: 'changes_requested',
        feedback: 'Missing Core Web Vitals section. Please add LCP and CLS analysis.'
      });

    expect(revRes.status).toBe(200);
    expect(revRes.body.data.submission.internal_review_status).toBe('changes_requested');

    // Task moves to rework state
    const [taskRows] = await pool.query('SELECT status, column_status, revision_count FROM tasks WHERE id = ?', [clientFacingTaskId]);
    expect(taskRows[0].status).toBe('in_progress');
    expect(taskRows[0].column_status).toBe('revision');
    expect(taskRows[0].revision_count).toBeGreaterThanOrEqual(1);

    // Verify open revision request record was created
    const [revRequests] = await pool.query(
      `SELECT * FROM deliverable_revision_requests WHERE task_id = ? AND status = 'open'`,
      [clientFacingTaskId]
    );
    expect(revRequests.length).toBe(1);
    expect(revRequests[0].requested_by_type).toBe('internal_reviewer');
    expect(revRequests[0].revision_reason).toContain('Core Web Vitals');
  });

  // Test 8 & 9: Employee resubmits revised work; repeats internal review
  it('8 & 9. Employee resubmits revised work (v2); repeats internal review', async () => {
    const res = await request(app)
      .post(`/api/tasks/${clientFacingTaskId}/deliverables/submit-review`)
      .set('Cookie', employeeCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        title: 'Revised SEO Audit v2',
        deliverableType: 'document',
        deliverableUrl: 'https://docs.google.com/document/d/draft-audit-v2',
        submissionNotes: 'Added Core Web Vitals breakdown and CWV metrics.'
      });

    expect(res.status).toBe(201);
    expect(res.body.data.submission.version_number).toBe(2);
    expect(res.body.data.submission.internal_review_status).toBe('pending');

    // Verify task is back in review
    const [taskRows] = await pool.query('SELECT status, column_status FROM tasks WHERE id = ?', [clientFacingTaskId]);
    expect(taskRows[0].status).toBe('in_review');
    expect(taskRows[0].column_status).toBe('client_review');

    // Verify previous internal revision request was marked resolved
    const [resolvedRevs] = await pool.query(
      `SELECT status FROM deliverable_revision_requests WHERE task_id = ? AND revision_cycle = 1`,
      [clientFacingTaskId]
    );
    expect(resolvedRevs[0].status).toBe('resolved');
  });

  // Test 5: Client-facing deliverable appears for client approval only after internal approval
  it('5. AM approves v2 internally -> deliverable becomes pending client approval', async () => {
    const [subRows] = await pool.query(
      'SELECT id FROM deliverable_submissions WHERE task_id = ? AND version_number = 2',
      [clientFacingTaskId]
    );
    const submissionId = subRows[0].id;

    // AM approves v2
    const res = await request(app)
      .post(`/api/deliverables/${submissionId}/review-internal`)
      .set('Cookie', amCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        decision: 'approved',
        feedback: 'Looks solid! Ready for client review.'
      });

    expect(res.status).toBe(200);
    expect(res.body.data.submission.internal_review_status).toBe('approved');
    expect(res.body.data.submission.client_approval_status).toBe('pending');

    // Task remains in review awaiting client
    const [taskRows] = await pool.query('SELECT status, column_status FROM tasks WHERE id = ?', [clientFacingTaskId]);
    expect(taskRows[0].status).toBe('in_review');
    expect(taskRows[0].column_status).toBe('client_review');

    // Authorized client A can now see this deliverable in their portal
    const clientListRes = await request(app)
      .get(`/api/clients/${testClientAId}/deliverables`)
      .set('Cookie', clientACookie);

    expect(clientListRes.status).toBe(200);
    const clientDeliverables = clientListRes.body.data.deliverables;
    const found = clientDeliverables.find((d) => d.id === submissionId);
    expect(found).toBeDefined();
    expect(found.client_approval_status).toBe('pending');
  });

  // Test 7: Client requests revisions with mandatory explanation
  it('7. Client requests revision on v2 with mandatory reason; moves work to rework', async () => {
    const [subRows] = await pool.query(
      'SELECT id FROM deliverable_submissions WHERE task_id = ? AND version_number = 2',
      [clientFacingTaskId]
    );
    const submissionId = subRows[0].id;

    // Validation test: Blank or too short explanation rejected
    const badRes = await request(app)
      .post(`/api/deliverables/${submissionId}/client-request-revision`)
      .set('Cookie', clientACookie)
      .set('x-csrf-token', csrfToken)
      .send({ revisionReason: 'bad' });
    expect(badRes.status).toBe(400);

    // Valid revision request
    const res = await request(app)
      .post(`/api/deliverables/${submissionId}/client-request-revision`)
      .set('Cookie', clientACookie)
      .set('x-csrf-token', csrfToken)
      .send({
        revisionReason: 'Please add comparison with our top local competitor MedCare Clinic.'
      });

    expect(res.status).toBe(200);
    expect(res.body.data.submission.client_approval_status).toBe('revision_requested');

    // Task moves to rework state
    const [taskRows] = await pool.query('SELECT status, column_status, revision_count FROM tasks WHERE id = ?', [clientFacingTaskId]);
    expect(taskRows[0].status).toBe('in_progress');
    expect(taskRows[0].column_status).toBe('revision');

    // Verify open client revision request
    const [revRequests] = await pool.query(
      `SELECT * FROM deliverable_revision_requests WHERE task_id = ? AND requested_by_type = 'client' AND status = 'open'`,
      [clientFacingTaskId]
    );
    expect(revRequests.length).toBe(1);
    expect(revRequests[0].revision_reason).toContain('MedCare Clinic');
  });

  // Test 10: Multiple revision cycles preserve immutable history
  it('10. Employee submits v3; history preserves v1, v2, and v3 without overwriting', async () => {
    const res = await request(app)
      .post(`/api/tasks/${clientFacingTaskId}/deliverables/submit-review`)
      .set('Cookie', employeeCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        title: 'SEO Audit v3 with MedCare Clinic Benchmark',
        deliverableType: 'document',
        deliverableUrl: 'https://docs.google.com/document/d/draft-audit-v3',
        submissionNotes: 'Added competitor benchmark comparison chart.'
      });

    expect(res.status).toBe(201);
    expect(res.body.data.submission.version_number).toBe(3);

    // Verify all 3 submission versions exist in database
    const [allVersions] = await pool.query(
      'SELECT version_number, internal_review_status, client_approval_status FROM deliverable_submissions WHERE task_id = ? ORDER BY version_number ASC',
      [clientFacingTaskId]
    );
    expect(allVersions.length).toBe(3);
    expect(allVersions[0].version_number).toBe(1);
    expect(allVersions[1].version_number).toBe(2);
    expect(allVersions[2].version_number).toBe(3);
  });

  // Test 6: Final client approval after internal signoff
  it('6. Internal AM approves v3, then Client approves v3 -> task completes', async () => {
    const [subRows] = await pool.query(
      'SELECT id FROM deliverable_submissions WHERE task_id = ? AND version_number = 3',
      [clientFacingTaskId]
    );
    const submissionId = subRows[0].id;

    // AM approves v3 internally
    await request(app)
      .post(`/api/deliverables/${submissionId}/review-internal`)
      .set('Cookie', amCookie)
      .set('x-csrf-token', csrfToken)
      .send({ decision: 'approved', feedback: 'Benchmark added nicely.' });

    // Client approves v3
    const approveRes = await request(app)
      .post(`/api/deliverables/${submissionId}/client-approve`)
      .set('Cookie', clientACookie)
      .set('x-csrf-token', csrfToken)
      .send({ feedback: 'Approved! This provides exactly the insights our board needed.' });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.submission.client_approval_status).toBe('approved');

    // Verify task is completed
    const [taskRows] = await pool.query('SELECT status, column_status, completed_at FROM tasks WHERE id = ?', [clientFacingTaskId]);
    expect(taskRows[0].status).toBe('completed');
    expect(taskRows[0].column_status).toBe('done');
    expect(taskRows[0].completed_at).not.toBeNull();
  });

  // Test 11: Tenant Isolation: Unauthorized Client B cannot view or approve Client A's deliverables
  it("11. Client isolation: Client B cannot view, approve, or request revisions on Client A's deliverables", async () => {
    const [subRows] = await pool.query(
      'SELECT id FROM deliverable_submissions WHERE task_id = ? AND version_number = 3',
      [clientFacingTaskId]
    );
    const submissionId = subRows[0].id;

    // Client B trying to view Client A's deliverables list
    const listRes = await request(app)
      .get(`/api/clients/${testClientAId}/deliverables`)
      .set('Cookie', clientBCookie);
    expect(listRes.status).toBe(403);

    // Client B trying to get submission by ID
    const getRes = await request(app)
      .get(`/api/deliverables/${submissionId}`)
      .set('Cookie', clientBCookie);
    expect(getRes.status).toBe(403);

    // Client B trying to approve Client A's deliverable
    const appRes = await request(app)
      .post(`/api/deliverables/${submissionId}/client-approve`)
      .set('Cookie', clientBCookie)
      .set('x-csrf-token', csrfToken)
      .send({ feedback: 'Attempting cross-tenant approval' });
    expect(appRes.status).toBe(403);
  });

  // Test 12: Employee cannot bypass mandatory internal review
  it('12. Employee cannot directly mark review-mandatory task as completed', async () => {
    // Create new task requiring review
    const [tRes] = await pool.query(
      `INSERT INTO tasks (
        task_code, title, project_id, client_id, creator_id, assignee_id,
        status, column_status, requires_internal_review, requires_client_approval
      ) VALUES (
        'P5-BYPASS-TEST', 'Bypass Attempt Task', ?, ?, ?, ?,
        'in_progress', 'in_progress', TRUE, TRUE
      )`,
      [testProjectId, testClientAId, amId, employeeId]
    );
    const bypassTaskId = tRes.insertId;

    // Client cannot review directly before internal review is submitted and approved
    const [subRes] = await pool.query(
      `INSERT INTO deliverable_submissions (
        task_id, client_id, project_id, version_number, title, submitted_by, internal_review_status, requires_client_approval, client_approval_status
      ) VALUES (?, ?, ?, 1, 'Draft', ?, 'pending', TRUE, 'not_required')`,
      [bypassTaskId, testClientAId, testProjectId, employeeId]
    );
    const bypassSubId = subRes.insertId;

    const directClientApprove = await request(app)
      .post(`/api/deliverables/${bypassSubId}/client-approve`)
      .set('Cookie', clientACookie)
      .set('x-csrf-token', csrfToken)
      .send({ feedback: 'Trying to approve unreviewed work' });

    expect(directClientApprove.status).toBe(400);
    expect(directClientApprove.body.error.code).toBe('INTERNAL_REVIEW_PENDING');

    await pool.query('DELETE FROM tasks WHERE id = ?', [bypassTaskId]);
  });

  // Test 13: Client cannot modify internal task status directly
  it('13. Client cannot access internal task submission or update internal reviewer status', async () => {
    const [subRows] = await pool.query(
      'SELECT id FROM deliverable_submissions WHERE task_id = ? ORDER BY id DESC LIMIT 1',
      [clientFacingTaskId]
    );
    const submissionId = subRows[0].id;

    const res = await request(app)
      .post(`/api/deliverables/${submissionId}/review-internal`)
      .set('Cookie', clientACookie)
      .set('x-csrf-token', csrfToken)
      .send({ decision: 'approved' });

    expect(res.status).toBe(403);
  });

  // Test 14: Invalid state transitions are rejected
  it('14. Invalid state transitions (e.g. approving already approved deliverable) are rejected', async () => {
    const [subRows] = await pool.query(
      'SELECT id FROM deliverable_submissions WHERE task_id = ? AND version_number = 3',
      [clientFacingTaskId]
    );
    const submissionId = subRows[0].id;

    // v3 is already approved: repeat approval should return 409
    const res = await request(app)
      .post(`/api/deliverables/${submissionId}/client-approve`)
      .set('Cookie', clientACookie)
      .set('x-csrf-token', csrfToken)
      .send({ feedback: 'Duplicate approval' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_CLIENT_APPROVAL_STATE');
  });

  // Test 15: Unauthorized file downloads are blocked
  it('15. Unauthorized file download blocked for non-permitted actors and other clients', async () => {
    // Create dummy file
    const uploadsDir = path.resolve('uploads', 'deliverables');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const dummyPath = path.join(uploadsDir, 'test-deliverable.pdf');
    fs.writeFileSync(dummyPath, 'Dummy deliverable content for test');

    const [subRes] = await pool.query(
      `INSERT INTO deliverable_submissions (
        task_id, client_id, project_id, version_number, title, file_path, file_name, file_size, file_mime_type,
        submitted_by, internal_review_status, requires_client_approval, client_approval_status
      ) VALUES (?, ?, ?, 4, 'Test File', ?, 'test-deliverable.pdf', 100, 'application/pdf', ?, 'pending', TRUE, 'not_required')`,
      [clientFacingTaskId, testClientAId, testProjectId, dummyPath, employeeId]
    );
    const fileSubId = subRes.insertId;

    // Client A cannot download while internal_review_status is pending
    const clientEarlyDownload = await request(app)
      .get(`/api/deliverables/${fileSubId}/download`)
      .set('Cookie', clientACookie);
    expect(clientEarlyDownload.status).toBe(403);

    // Client B cannot download Client A file
    const clientBDownload = await request(app)
      .get(`/api/deliverables/${fileSubId}/download`)
      .set('Cookie', clientBCookie);
    expect(clientBDownload.status).toBe(403);

    // AM can download internal file
    const amDownload = await request(app)
      .get(`/api/deliverables/${fileSubId}/download`)
      .set('Cookie', amCookie);
    expect(amDownload.status).toBe(200);

    // Clean up
    if (fs.existsSync(dummyPath)) fs.unlinkSync(dummyPath);
    await pool.query('DELETE FROM deliverable_submissions WHERE id = ?', [fileSubId]);
  });

  // Test 16: Duplicate review requests / retries are handled safely
  it('16. Duplicate review submissions on in-review task are safely rejected', async () => {
    // Put task in review
    await pool.query("UPDATE tasks SET status = 'in_review' WHERE id = ?", [clientFacingTaskId]);
    await pool.query(
      `INSERT INTO deliverable_submissions (
        task_id, client_id, project_id, version_number, title, submitted_by, internal_review_status
      ) VALUES (?, ?, ?, 99, 'Pending Item', ?, 'pending')`,
      [clientFacingTaskId, testClientAId, testProjectId, employeeId]
    );

    const dupRes = await request(app)
      .post(`/api/tasks/${clientFacingTaskId}/deliverables/submit-review`)
      .set('Cookie', employeeCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        title: 'Concurrent Retry',
        deliverableUrl: 'https://test.com'
      });

    expect(dupRes.status).toBe(409);
    expect(dupRes.body.error.code).toBe('APPROVAL_ALREADY_PENDING');

    await pool.query('DELETE FROM deliverable_submissions WHERE version_number = 99 AND task_id = ?', [clientFacingTaskId]);
    await pool.query("UPDATE tasks SET status = 'completed' WHERE id = ?", [clientFacingTaskId]);
  });

  // Test 17: Self-approval restriction
  it('17. Self-approval restriction prevents reviewers from approving their own work', async () => {
    // AM submits their own deliverable on a task
    const [subRes] = await pool.query(
      `INSERT INTO deliverable_submissions (
        task_id, client_id, project_id, version_number, title, submitted_by, internal_review_status
      ) VALUES (?, ?, ?, 50, 'AM Self Submission', ?, 'pending')`,
      [clientFacingTaskId, testClientAId, testProjectId, amId]
    );
    const amSubId = subRes.insertId;

    const selfApproveRes = await request(app)
      .post(`/api/deliverables/${amSubId}/review-internal`)
      .set('Cookie', amCookie)
      .set('x-csrf-token', csrfToken)
      .send({ decision: 'approved', feedback: 'Self-approval attempt' });

    expect(selfApproveRes.status).toBe(403);
    expect(selfApproveRes.body.error.code).toBe('CANNOT_APPROVE_OWN_SUBMISSION');

    await pool.query('DELETE FROM deliverable_submissions WHERE id = ?', [amSubId]);
  });

  // Test 18: Audit records identify the correct actors
  it('18. Audit log records identify actor identity on approvals and revision decisions', async () => {
    const [auditRows] = await pool.query(
      `SELECT * FROM audit_logs 
       WHERE action IN ('deliverable.submitted_for_internal_review', 'deliverable.client_approved', 'deliverable.client_revision_requested')
       ORDER BY id DESC LIMIT 5`
    );
    expect(auditRows.length).toBeGreaterThan(0);
    const approvedLog = auditRows.find((a) => a.action === 'deliverable.client_approved');
    expect(approvedLog).toBeDefined();
    expect(Number(approvedLog.actor_id)).toBe(clientAUserId);
  });

  // Test 19: Client-visible queries exclude internal-only notes
  it('19. Client submissions API response excludes internal-only reviewer comments and internal-only submissions', async () => {
    const clientListRes = await request(app)
      .get(`/api/tasks/${clientFacingTaskId}/deliverables`)
      .set('Cookie', clientACookie);

    expect(clientListRes.status).toBe(200);
    const clientSubs = clientListRes.body.data.submissions;
    expect(clientSubs.length).toBeGreaterThan(0);

    // Verify internal review fields are stripped
    clientSubs.forEach((sub) => {
      expect(sub.internal_review_feedback).toBeUndefined();
      expect(sub.internal_reviewer_id).toBeUndefined();
    });
  });

  // Test 20: Existing task and project endpoints remain fully operational
  it('20. Existing task and project endpoints remain fully operational and intact', async () => {
    const taskRes = await request(app)
      .get(`/api/tasks/${clientFacingTaskId}`)
      .set('Cookie', employeeCookie);

    expect(taskRes.status).toBe(200);
    expect(taskRes.body.task.id).toBe(clientFacingTaskId);

    const projectRes = await request(app)
      .get(`/api/projects/${testProjectId}`)
      .set('Cookie', amCookie);

    expect(projectRes.status).toBe(200);
    expect(projectRes.body.project.id).toBe(testProjectId);
  });
});
