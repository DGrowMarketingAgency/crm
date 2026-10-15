import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';
import { seedRbac } from '../src/modules/rbac/rbac.seed.js';

describe('D-Grow OS: Comprehensive End-to-End System Workflows Suite (Workflows 1-5)', () => {
  let csrfToken = '';
  let csrfCookie = '';

  // Auth sessions
  let ownerUser, ownerCookie;
  let amUser, amCookie;
  let employeeUser, employeeCookie;
  let clientUser, clientCookie;

  // Workflow 1 Entities
  let e2eClientId;
  let e2eDeptId;
  let e2ePresetId;
  let e2ePresetVersionId;
  let e2eStageId;
  let e2eTemplate1Id, e2eTemplate2Id;
  let e2eServiceInstanceId;
  let e2eProjectId;

  // Workflow 2 Entities
  let e2eTaskId;
  let e2eSubmissionId;

  // Workflow 3 Entities
  let e2eTicketId;
  let e2eQuotationId;
  let e2eInvoiceId;

  // Workflow 4 Entities
  let e2eDirectConvId;

  const testPassword = 'Password123!';

  beforeAll(async () => {
    // 1. Seed RBAC permissions
    await seedRbac();

    // 2. Fetch CSRF Token
    const csrfRes = await request(app).get('/api/auth/csrf-token');
    csrfToken = csrfRes.body.csrfToken;
    const cookies = csrfRes.headers['set-cookie'] || [];
    csrfCookie = cookies.find((c) => c.startsWith('xsrf_token='));

    const passwordHash = await bcrypt.hash(testPassword, 10);

    // Helper to register & login users cleanly
    const setupUser = async (email, name, roleSlug, deptName = 'Dev', clientId = null) => {
      await pool.query(
        `INSERT INTO users (name, email, password_hash, status, department, role, client_id)
         VALUES (?, ?, ?, 'active', ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = 'active', department = ?, role = ?, client_id = ?`,
        [name, email, passwordHash, deptName, roleSlug, clientId, deptName, roleSlug, clientId]
      );
      const [uRows] = await pool.query('SELECT id, name, email, role FROM users WHERE email = ?', [email]);
      const user = uRows[0];

      await pool.query('DELETE FROM user_roles WHERE user_id = ?', [user.id]);
      const [rRows] = await pool.query('SELECT id FROM roles WHERE slug = ?', [roleSlug]);
      if (rRows.length > 0) {
        await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [user.id, rRows[0].id]);
      }

      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('Cookie', csrfCookie)
        .set('x-csrf-token', csrfToken)
        .send({ email, password: testPassword });

      const setCookies = loginRes.headers['set-cookie'] || [];
      const accessCookie = setCookies.find((c) => c.startsWith('access_token='));
      return { user, cookie: `${csrfCookie}; ${accessCookie}` };
    };

    // Create staff users
    const ownerRes = await setupUser('e2e_owner@dgrow.com', 'E2E Owner', 'owner');
    ownerUser = ownerRes.user;
    ownerCookie = ownerRes.cookie;

    const amRes = await setupUser('e2e_am@dgrow.com', 'E2E Account Manager', 'account-manager');
    amUser = amRes.user;
    amCookie = amRes.cookie;

    const empRes = await setupUser('e2e_emp@dgrow.com', 'E2E Specialist Dev', 'employee', 'Dev');
    employeeUser = empRes.user;
    employeeCookie = empRes.cookie;

    // Create department
    await pool.query(
      `INSERT INTO departments (name, code, status)
       VALUES ('E2E Engineering Dept', 'E2E-ENG', 'active')
       ON DUPLICATE KEY UPDATE status = 'active'`
    );
    const [deptRows] = await pool.query("SELECT id FROM departments WHERE code = 'E2E-ENG'");
    e2eDeptId = deptRows[0].id;

    // Assign employee to department
    await pool.query(
      `INSERT INTO department_members (department_id, user_id, is_primary)
       VALUES (?, ?, TRUE) ON DUPLICATE KEY UPDATE is_primary = TRUE`,
      [e2eDeptId, employeeUser.id]
    );

    // Create test client entity
    await pool.query(
      `INSERT INTO clients (name, email, client_code, status, lifecycle_stage, entity, account_manager_id)
       VALUES ('E2E Global Brand', 'client@e2ebrand.com', 'CLT-E2E-001', 'active', 'L2', 'D-Grow', ?)
       ON DUPLICATE KEY UPDATE status = 'active', account_manager_id = ?`,
      [amUser.id, amUser.id]
    );
    const [cRows] = await pool.query("SELECT id FROM clients WHERE client_code = 'CLT-E2E-001'");
    e2eClientId = cRows[0].id;

    // Create client portal user linked to client
    const clientRes = await setupUser('e2e_client_user@dgrow.com', 'E2E Client Stakeholder', 'client', null, e2eClientId);
    clientUser = clientRes.user;
    clientCookie = clientRes.cookie;
  });

  afterAll(async () => {
    // Teardown / cleanup if necessary
  });

  // =========================================================================
  // WORKFLOW 1: CLIENT ONBOARDING TO PROJECT TASKS AUTOMATION
  // =========================================================================
  describe('Workflow 1 — Client Onboarding to Project Tasks Automation', () => {
    it('1.1 should create and publish a complete workflow preset with task templates and dependencies', async () => {
      const presetUniqueCode = 'WP_E2E_' + Date.now();
      // Create preset (creates initial draft version automatically)
      const presetRes = await request(app)
        .post('/api/workflow-presets')
        .set('Cookie', ownerCookie)
        .set('x-csrf-token', csrfToken)
        .send({
          name: 'E2E Web App Development Preset',
          preset_code: presetUniqueCode,
          department_id: e2eDeptId,
          description: 'Production web workflow for end to end verification',
          service_category: 'Web Development',
          workflow_type: 'standard'
        });

      expect(presetRes.status).toBe(201);
      e2ePresetId = presetRes.body.data.id;
      e2ePresetVersionId = presetRes.body.data.version.id;

      // Create Stage
      const stageRes = await request(app)
        .post(`/api/workflow-presets/${e2ePresetId}/versions/${e2ePresetVersionId}/stages`)
        .set('Cookie', ownerCookie)
        .set('x-csrf-token', csrfToken)
        .send({
          name: 'Development & QA Sprint',
          stage_key: 'dev-qa',
          display_order: 1,
          stage_category: 'execution',
          allowed_next_stages: [],
          is_client_facing: true,
          requires_deliverable: true
        });

      expect(stageRes.status).toBe(201);
      e2eStageId = stageRes.body.data.id;

      // Create Template 1: API Setup (client facing deliverable)
      const t1Res = await request(app)
        .post(`/api/workflow-presets/${e2ePresetId}/versions/${e2ePresetVersionId}/tasks`)
        .set('Cookie', ownerCookie)
        .set('x-csrf-token', csrfToken)
        .send({
          stage_id: e2eStageId,
          task_key: 'core-rest-api',
          title: 'Implement Core REST API',
          estimated_duration_hours: 10,
          relative_deadline_days: 3,
          priority: 'high',
          requires_client_approval: true
        });

      expect(t1Res.status).toBe(201);
      e2eTemplate1Id = t1Res.body.data.id;

      // Create Template 2: Frontend Integration (depends on Template 1)
      const t2Res = await request(app)
        .post(`/api/workflow-presets/${e2ePresetId}/versions/${e2ePresetVersionId}/tasks`)
        .set('Cookie', ownerCookie)
        .set('x-csrf-token', csrfToken)
        .send({
          stage_id: e2eStageId,
          task_key: 'frontend-ui-components',
          title: 'Integrate Frontend UI Components',
          estimated_duration_hours: 15,
          relative_deadline_days: 7,
          priority: 'high'
        });

      expect(t2Res.status).toBe(201);
      e2eTemplate2Id = t2Res.body.data.id;

      // Link dependency: T2 depends on T1
      const depRes = await request(app)
        .post(`/api/workflow-presets/${e2ePresetId}/versions/${e2ePresetVersionId}/tasks/${e2eTemplate2Id}/dependencies`)
        .set('Cookie', ownerCookie)
        .set('x-csrf-token', csrfToken)
        .send({
          dependsOnTaskId: e2eTemplate1Id,
          dependencyType: 'finish_to_start'
        });

      expect(depRes.status).toBe(201);

      // Validate version
      const valRes = await request(app)
        .post(`/api/workflow-presets/${e2ePresetId}/versions/${e2ePresetVersionId}/validate`)
        .set('Cookie', ownerCookie);

      expect(valRes.status).toBe(200);
      expect(valRes.body.data.valid).toBe(true);

      // Publish version
      const pubRes = await request(app)
        .post(`/api/workflow-presets/${e2ePresetId}/versions/${e2ePresetVersionId}/publish`)
        .set('Cookie', ownerCookie)
        .set('x-csrf-token', csrfToken);

      expect(pubRes.status).toBe(200);
      expect(pubRes.body.data.status).toBe('published');
    });

    it('1.2 should create a client project and associate the published workflow service', async () => {
      // Create Project with valid schema
      const projRes = await request(app)
        .post('/api/projects')
        .set('Cookie', amCookie)
        .set('x-csrf-token', csrfToken)
        .send({
          name: 'E2E Client E-Commerce Portal',
          projectCode: 'PRJ_E2E_' + Date.now(),
          clientId: e2eClientId,
          projectManagerId: amUser.id,
          priority: 'high',
          status: 'active',
          startDate: new Date().toISOString().split('T')[0]
        });

      expect(projRes.status).toBe(201);
      e2eProjectId = projRes.body.project.id;

      // Enroll employee in project
      await pool.query(
        `INSERT IGNORE INTO project_members (project_id, user_id, project_role)
         VALUES (?, ?, 'Developer')`,
        [e2eProjectId, employeeUser.id]
      );

      // Configure Client Service with the published preset
      const srvRes = await request(app)
        .post(`/api/clients/${e2eClientId}/services`)
        .set('Cookie', amCookie)
        .set('x-csrf-token', csrfToken)
        .send({
          label: 'Web Engineering Package',
          serviceType: 'Development',
          departmentId: e2eDeptId,
          workflowPresetId: e2ePresetId,
          workflowPresetVersionId: e2ePresetVersionId,
          status: 'draft'
        });

      expect(srvRes.status).toBe(201);
      e2eServiceInstanceId = srvRes.body.service.id;
    });

    it('1.3 should execute workflow automation generating milestones, tasks, and dependencies idempotently', async () => {
      const e2eExecutionKey = 'e2e_exec_' + Date.now();
      // Execute automation engine
      const execRes = await request(app)
        .post('/api/automation/execute')
        .set('Cookie', amCookie)
        .set('x-csrf-token', csrfToken)
        .send({
          triggerType: 'manual',
          executionKey: e2eExecutionKey,
          serviceInstanceId: e2eServiceInstanceId,
          projectId: e2eProjectId,
          workflowPresetId: e2ePresetId,
          workflowPresetVersionId: e2ePresetVersionId
        });

      expect(execRes.status).toBe(201);
      expect(execRes.body.success).toBe(true);
      expect(execRes.body.createdTasksCount).toBe(2);

      // Verify tasks in database
      const [tasks] = await pool.query(
        'SELECT id, title, project_id, status FROM tasks WHERE project_id = ? ORDER BY id ASC',
        [e2eProjectId]
      );

      expect(tasks.length).toBe(2);
      expect(tasks[0].title).toBe('Implement Core REST API');
      expect(tasks[1].title).toBe('Integrate Frontend UI Components');

      e2eTaskId = tasks[0].id;

      // Confirm idempotency: repeated execution does NOT generate duplicates
      const repeatRes = await request(app)
        .post('/api/automation/execute')
        .set('Cookie', amCookie)
        .set('x-csrf-token', csrfToken)
        .send({
          triggerType: 'manual',
          executionKey: e2eExecutionKey,
          serviceInstanceId: e2eServiceInstanceId,
          projectId: e2eProjectId,
          workflowPresetId: e2ePresetId,
          workflowPresetVersionId: e2ePresetVersionId
        });

      expect(repeatRes.status).toBe(200);
      expect(repeatRes.body.createdTasksCount).toBe(0); // 0 duplicates created
      expect(repeatRes.body.isDuplicate).toBe(true);
    });
  });

  // =========================================================================
  // WORKFLOW 2: EMPLOYEE WORK TO CLIENT APPROVAL & REVISION CYCLE
  // =========================================================================
  describe('Workflow 2 — Employee Work to Client Approval & Revision Lifecycle', () => {
    it('2.1 should assign task to employee and start task', async () => {
      // Assign task to employee
      await pool.query(
        `INSERT IGNORE INTO task_assignees (task_id, user_id) VALUES (?, ?)`,
        [e2eTaskId, employeeUser.id]
      );

      // Update status to in_progress
      const updateRes = await request(app)
        .patch(`/api/tasks/${e2eTaskId}/status`)
        .set('Cookie', employeeCookie)
        .set('x-csrf-token', csrfToken)
        .send({ status: 'in_progress' });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.task.status).toBe('in_progress');
    });

    it('2.2 should submit deliverable work for internal review', async () => {
      const submitRes = await request(app)
        .post(`/api/tasks/${e2eTaskId}/deliverables/submit-review`)
        .set('Cookie', employeeCookie)
        .set('x-csrf-token', csrfToken)
        .send({
          title: 'Core REST API v1 Deliverable',
          deliverableType: 'link',
          deliverableUrl: 'https://github.com/dgrow/api-deliverable-v1',
          submissionNotes: 'Completed comprehensive Swagger docs and endpoints.'
        });

      expect(submitRes.status).toBe(201);
      expect(submitRes.body.success).toBe(true);
      expect(submitRes.body.data.submission).toBeDefined();
      expect(submitRes.body.data.submission.internal_review_status).toBe('pending');

      e2eSubmissionId = submitRes.body.data.submission.id;
    });

    it('2.3 should have Account Manager approve internal review and publish to client portal', async () => {
      const reviewRes = await request(app)
        .post(`/api/deliverables/${e2eSubmissionId}/review-internal`)
        .set('Cookie', amCookie)
        .set('x-csrf-token', csrfToken)
        .send({
          decision: 'approved',
          feedback: 'Code passes QA. Pushed to client for review.'
        });

      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.data.submission.internal_review_status).toBe('approved');
      expect(reviewRes.body.data.submission.client_approval_status).toBe('pending');
    });

    it('2.4 should allow client to request revision with mandatory reason', async () => {
      const revRes = await request(app)
        .post(`/api/deliverables/${e2eSubmissionId}/client-request-revision`)
        .set('Cookie', clientCookie)
        .set('x-csrf-token', csrfToken)
        .send({
          revisionReason: 'Please add OAuth2 Google login endpoints as well.',
          requestedChanges: 'Add Google & Apple sign-in support.'
        });

      expect(revRes.status).toBe(200);
      expect(revRes.body.data.submission.client_approval_status).toBe('revision_requested');
    });

    it('2.5 should require employee rework and enforce mandatory internal review before final client approval', async () => {
      // Employee resubmits rework
      const resubmitRes = await request(app)
        .post(`/api/tasks/${e2eTaskId}/deliverables/submit-review`)
        .set('Cookie', employeeCookie)
        .set('x-csrf-token', csrfToken)
        .send({
          title: 'Core REST API v2 Deliverable',
          deliverableType: 'link',
          deliverableUrl: 'https://github.com/dgrow/api-deliverable-v2',
          submissionNotes: 'Added OAuth2 Google and Apple login endpoints per feedback.'
        });

      expect(resubmitRes.status).toBe(201);
      expect(resubmitRes.body.data.submission.internal_review_status).toBe('pending');

      const v2SubmissionId = resubmitRes.body.data.submission.id;

      // AM reviews internally again
      const amReviewRes = await request(app)
        .post(`/api/deliverables/${v2SubmissionId}/review-internal`)
        .set('Cookie', amCookie)
        .set('x-csrf-token', csrfToken)
        .send({
          decision: 'approved',
          feedback: 'OAuth implementation verified. Sent to client.'
        });

      expect(amReviewRes.status).toBe(200);
      expect(amReviewRes.body.data.submission.internal_review_status).toBe('approved');
      expect(amReviewRes.body.data.submission.client_approval_status).toBe('pending');

      // Client gives final approval
      const clientApproveRes = await request(app)
        .post(`/api/deliverables/${v2SubmissionId}/client-approve`)
        .set('Cookie', clientCookie)
        .set('x-csrf-token', csrfToken)
        .send({ feedback: 'Looks fantastic! Approved.' });

      expect(clientApproveRes.status).toBe(200);
      expect(clientApproveRes.body.data.submission.client_approval_status).toBe('approved');
    });
  });

  // =========================================================================
  // WORKFLOW 3: CLIENT SUPPORT TICKETS, QUOTATIONS & PAYMENT TRACKING
  // =========================================================================
  describe('Workflow 3 — Client Support Tickets, Quotations, Invoices & Payments', () => {
    it('3.1 should allow client to create support ticket and staff to reply with internal notes', async () => {
      // Client creates ticket
      const ticketRes = await request(app)
        .post('/api/tickets')
        .set('Cookie', clientCookie)
        .set('x-csrf-token', csrfToken)
        .send({
          subject: 'Need expedited payment gateway setup',
          description: 'Can we add Stripe integration this sprint?',
          priority: 'urgent',
          category: 'Website / Development',
          projectId: e2eProjectId
        });

      expect(ticketRes.status).toBe(201);
      expect(ticketRes.body.ticket).toBeDefined();
      e2eTicketId = ticketRes.body.ticket.ticket.id;

      // Staff adds internal note (not visible to client)
      const noteRes = await request(app)
        .post(`/api/tickets/${e2eTicketId}/messages`)
        .set('Cookie', amCookie)
        .set('x-csrf-token', csrfToken)
        .send({
          message: 'Internal estimate: Stripe gateway takes 8 dev hours.',
          is_internal: true
        });

      expect(noteRes.status).toBe(200);

      // Staff replies to client
      const replyRes = await request(app)
        .post(`/api/tickets/${e2eTicketId}/messages`)
        .set('Cookie', amCookie)
        .set('x-csrf-token', csrfToken)
        .send({
          message: 'Hello! We can prepare a formal quotation for Stripe gateway integration.',
          is_internal: false
        });

      expect(replyRes.status).toBe(200);

      // Client verifies internal note is filtered out
      const clientViewRes = await request(app)
        .get(`/api/tickets/${e2eTicketId}`)
        .set('Cookie', clientCookie);

      expect(clientViewRes.status).toBe(200);
      const clientMessages = clientViewRes.body.ticket?.messages || [];
      expect(clientMessages.some((m) => m.is_internal === true)).toBe(false);
    });

    it('3.2 should prepare quotation, compute tax/totals, and receive client approval', async () => {
      const today = new Date().toISOString().split('T')[0];
      const expiry = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

      // Create quotation
      const quoteRes = await request(app)
        .post('/api/quotations')
        .set('Cookie', amCookie)
        .set('x-csrf-token', csrfToken)
        .send({
          clientId: e2eClientId,
          projectId: e2eProjectId,
          ticketId: e2eTicketId,
          title: 'Stripe Gateway Integration Scope',
          quotationDate: today,
          expiryDate: expiry,
          currency: 'INR',
          termsAndConditions: 'Payment terms 15 days upon invoice generation.',
          items: [
            {
              item_description: 'Stripe API Webhook Setup',
              quantity: 1,
              unitPrice: 1000.00,
              discountPercent: 0.00,
              taxRate: 18.00
            },
            {
              item_description: 'Card & UPI Checkout Form',
              quantity: 1,
              unitPrice: 1500.00,
              discountPercent: 0.00,
              taxRate: 18.00
            }
          ]
        });

      expect(quoteRes.status).toBe(201);
      expect(quoteRes.body.quotation).toBeDefined();
      expect(Number(quoteRes.body.quotation.subtotal)).toBe(2500.00);
      expect(Number(quoteRes.body.quotation.tax_amount)).toBe(450.00); // 18% of 2500
      expect(Number(quoteRes.body.quotation.total_amount)).toBe(2950.00);

      e2eQuotationId = quoteRes.body.quotation.id;

      // Issue quotation to client
      await request(app)
        .post(`/api/quotations/${e2eQuotationId}/issue`)
        .set('Cookie', amCookie)
        .set('x-csrf-token', csrfToken);

      // Client reviews and approves quotation
      const approveQuoteRes = await request(app)
        .post(`/api/quotations/${e2eQuotationId}/review`)
        .set('Cookie', clientCookie)
        .set('x-csrf-token', csrfToken)
        .send({
          decision: 'accept',
          notes: 'Scope and commercial terms accepted.'
        });

      expect(approveQuoteRes.status).toBe(200);
      expect(approveQuoteRes.body.quotation.status).toBe('accepted');
    });

    it('3.3 should convert accepted quotation to invoice, track partial payment, prevent overpayment, and complete payment', async () => {
      // Convert quotation to invoice
      const convRes = await request(app)
        .post(`/api/quotations/${e2eQuotationId}/convert`)
        .set('Cookie', amCookie)
        .set('x-csrf-token', csrfToken);

      expect(convRes.status).toBe(201);
      expect(convRes.body.invoice).toBeDefined();
      e2eInvoiceId = convRes.body.invoice.id;
      expect(Number(convRes.body.invoice.total_amount)).toBe(2950.00);
      expect(Number(convRes.body.invoice.outstanding_balance)).toBe(2950.00);
      expect(convRes.body.invoice.status).toBe('issued');

      // Partial Payment: 1000
      const partPayRes = await request(app)
        .post(`/api/invoices/${e2eInvoiceId}/payments`)
        .set('Cookie', amCookie)
        .set('x-csrf-token', csrfToken)
        .send({
          amount: 1000.00,
          paymentDate: new Date().toISOString().split('T')[0],
          paymentMethod: 'bank_transfer',
          notes: 'Advance installment 1'
        });

      expect(partPayRes.status).toBe(201);
      expect(Number(partPayRes.body.invoice.amount_paid)).toBe(1000.00);
      expect(Number(partPayRes.body.invoice.outstanding_balance)).toBe(1950.00);
      expect(partPayRes.body.invoice.status).toBe('partially_paid');

      // Overpayment prevention: attempting to pay 2500 (exceeds balance 1950)
      const overPayRes = await request(app)
        .post(`/api/invoices/${e2eInvoiceId}/payments`)
        .set('Cookie', amCookie)
        .set('x-csrf-token', csrfToken)
        .send({
          amount: 2500.00,
          paymentDate: new Date().toISOString().split('T')[0],
          paymentMethod: 'bank_transfer'
        });

      expect(overPayRes.status).toBe(400);

      // Final payment: exact remaining balance 1950
      const finalPayRes = await request(app)
        .post(`/api/invoices/${e2eInvoiceId}/payments`)
        .set('Cookie', amCookie)
        .set('x-csrf-token', csrfToken)
        .send({
          amount: 1950.00,
          paymentDate: new Date().toISOString().split('T')[0],
          paymentMethod: 'bank_transfer',
          notes: 'Final installment'
        });

      expect(finalPayRes.status).toBe(201);
      expect(Number(finalPayRes.body.invoice.amount_paid)).toBe(2950.00);
      expect(Number(finalPayRes.body.invoice.outstanding_balance)).toBe(0.00);
      expect(finalPayRes.body.invoice.status).toBe('paid');
    });
  });

  // =========================================================================
  // WORKFLOW 4: INTERNAL TEAM CHAT & REAL-TIME COMMUNICATION
  // =========================================================================
  describe('Workflow 4 — Internal Team Communication & Client Boundary', () => {
    it('4.1 should start 1:1 direct chat, prevent duplicates, send messages, and track read status', async () => {
      // AM starts direct chat with Employee
      const convRes = await request(app)
        .post('/api/chat/conversations/direct')
        .set('Cookie', amCookie)
        .set('x-csrf-token', csrfToken)
        .send({ targetUserId: employeeUser.id });

      expect(convRes.status).toBe(200);
      e2eDirectConvId = convRes.body.data.id;

      // Duplicate prevention check
      const dupRes = await request(app)
        .post('/api/chat/conversations/direct')
        .set('Cookie', employeeCookie)
        .set('x-csrf-token', csrfToken)
        .send({ targetUserId: amUser.id });

      expect(dupRes.status).toBe(200);
      expect(dupRes.body.data.id).toBe(e2eDirectConvId);

      // Send message
      const sendRes = await request(app)
        .post(`/api/chat/conversations/${e2eDirectConvId}/messages`)
        .set('Cookie', amCookie)
        .set('x-csrf-token', csrfToken)
        .send({ content: 'E2E direct test message' });

      expect(sendRes.status).toBe(201);
      const msgId = sendRes.body.data.id;

      // Employee reads message
      const readRes = await request(app)
        .post(`/api/chat/conversations/${e2eDirectConvId}/read`)
        .set('Cookie', employeeCookie)
        .set('x-csrf-token', csrfToken)
        .send({ upToMessageId: msgId });

      expect(readRes.status).toBe(200);
      expect(readRes.body.success).toBe(true);
    });

    it('4.2 should strictly deny client portal users from accessing internal team chat', async () => {
      const clientChatRes = await request(app)
        .get('/api/chat/conversations')
        .set('Cookie', clientCookie);

      expect(clientChatRes.status).toBe(403);
      expect(clientChatRes.body.error.code).toBe('CLIENT_CHAT_FORBIDDEN');
    });
  });

  // =========================================================================
  // WORKFLOW 5: CROSS-MODULE DATA CONSISTENCY & REFERENTIAL INTEGRITY
  // =========================================================================
  describe('Workflow 5 — Cross-Module Data Consistency & Integrity', () => {
    it('5.1 should maintain full referential consistency across Client, Service, Project, Tasks, and Invoices', async () => {
      // 1. Verify Client -> Service
      const [services] = await pool.query(
        'SELECT id, client_id, workflow_preset_id FROM service_instances WHERE id = ?',
        [e2eServiceInstanceId]
      );
      expect(services.length).toBe(1);
      expect(services[0].client_id).toBe(e2eClientId);
      expect(services[0].workflow_preset_id).toBe(e2ePresetId);

      // 2. Verify Project -> Client
      const [projects] = await pool.query(
        'SELECT id, client_id FROM projects WHERE id = ?',
        [e2eProjectId]
      );
      expect(projects.length).toBe(1);
      expect(projects[0].client_id).toBe(e2eClientId);

      // 3. Verify Tasks -> Project
      const [tasks] = await pool.query(
        'SELECT id, project_id FROM tasks WHERE project_id = ?',
        [e2eProjectId]
      );
      expect(tasks.length).toBeGreaterThanOrEqual(2);

      // 4. Verify Invoice -> Quotation & Client
      const [invoices] = await pool.query(
        'SELECT id, client_id, quotation_id, amount_paid, outstanding_balance, status FROM invoices WHERE id = ?',
        [e2eInvoiceId]
      );
      expect(invoices.length).toBe(1);
      expect(invoices[0].client_id).toBe(e2eClientId);
      expect(invoices[0].quotation_id).toBe(e2eQuotationId);
      expect(invoices[0].status).toBe('paid');
      expect(Number(invoices[0].outstanding_balance)).toBe(0.00);

      // 5. Verify Payments -> Invoice
      const [payments] = await pool.query(
        'SELECT SUM(amount) as total_paid FROM payments WHERE invoice_id = ?',
        [e2eInvoiceId]
      );
      expect(Number(payments[0].total_paid)).toBe(2950.00);
    });
  });
});
