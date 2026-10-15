import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';
import { seedRbac } from '../src/modules/rbac/rbac.seed.js';

describe('D-Grow OS Phase 1: Lifecycle Backbone, Auto-Trigger Engine, 3 BD Pipelines & Scoping', () => {
  let csrfToken = '';
  let csrfCookie = '';

  let ownerCookie = '';
  let am1Cookie = '';
  let am2Cookie = '';
  let seoExecCookie = '';
  let clientCookie = '';

  let ownerId;
  let am1Id;
  let am2Id;
  let seoExecId;
  let clientUserId;

  let client1Id;
  let client2Id;
  let createdServiceInstanceId;
  let manualTaskId;
  let dgrowLeadId;

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

    const setupUser = async (name, email, roleSlug, systemRole = 'member', department = null) => {
      await pool.query(
        `INSERT INTO users (name, email, password_hash, role, department, status, last_login_at)
         VALUES (?, ?, ?, ?, ?, 'active', NOW())
         ON DUPLICATE KEY UPDATE password_hash = ?, department = ?, status = 'active', last_login_at = NOW()`,
        [name, email, passwordHash, systemRole, department, passwordHash, department]
      );
      const [uRows] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
      const userId = uRows[0].id;

      if (roleSlug) {
        const [rRows] = await pool.query('SELECT id FROM roles WHERE slug = ?', [roleSlug]);
        if (rRows.length > 0) {
          await pool.query('DELETE FROM user_roles WHERE user_id = ?', [userId]);
          await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [
            userId,
            rRows[0].id
          ]);
        }
      }
      return userId;
    };

    const loginUser = async (email) => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email, password: testPassword });

      const setCookies = res.headers['set-cookie'] || [];
      const accessCookie = setCookies.find((c) => c.startsWith('access_token='));
      return [csrfCookie, accessCookie].join('; ');
    };

    ownerId = await setupUser('DGrow Owner', 'dgrow_owner@dgrow.com', 'owner', 'owner');
    am1Id = await setupUser('Account Manager 1', 'am1@dgrow.com', 'account-manager', 'member');
    am2Id = await setupUser('Account Manager 2', 'am2@dgrow.com', 'account-manager', 'member');
    seoExecId = await setupUser('SEO Specialist', 'seo_exec@dgrow.com', 'seo-exec', 'member', 'SEO');
    clientUserId = await setupUser('Client Alpha Rep', 'client_rep@alpha.com', 'client', 'client');

    ownerCookie = await loginUser('dgrow_owner@dgrow.com');
    am1Cookie = await loginUser('am1@dgrow.com');
    am2Cookie = await loginUser('am2@dgrow.com');
    seoExecCookie = await loginUser('seo_exec@dgrow.com');
    clientCookie = await loginUser('client_rep@alpha.com');

    // Create 2 test clients:
    // Client Alpha assigned to AM 1, portal user set
    const [c1] = await pool.query(
      `INSERT INTO clients (name, email, entity, vertical, lifecycle_stage, account_manager_id, user_id, status)
       VALUES ('Alpha Health Clinic', 'alpha@health.com', 'MedGrowDigi', 'Healthcare', 'L1', ?, ?, 'active')`,
      [am1Id, clientUserId]
    );
    client1Id = c1.insertId;

    // Link client_id on client portal user
    await pool.query('UPDATE users SET client_id = ? WHERE id = ?', [client1Id, clientUserId]);

    // Client Beta assigned to AM 2
    const [c2] = await pool.query(
      `INSERT INTO clients (name, email, entity, vertical, lifecycle_stage, account_manager_id, status)
       VALUES ('Beta Retail Store', 'beta@retail.com', 'D-Grow', 'General', 'L1', ?, 'active')`,
      [am2Id]
    );
    client2Id = c2.insertId;
  });

  afterAll(async () => {
    // Clean up test records
    if (client1Id) {
      await pool.query('DELETE FROM tasks WHERE client_id IN (?, ?)', [client1Id, client2Id]);
      await pool.query('DELETE FROM service_instances WHERE client_id IN (?, ?)', [client1Id, client2Id]);
      await pool.query('DELETE FROM clients WHERE id IN (?, ?)', [client1Id, client2Id]);
    }
    if (dgrowLeadId) {
      await pool.query('DELETE FROM leads WHERE id = ?', [dgrowLeadId]);
    }
  });

  // 1. Service Catalog Inspection
  it('1. GET /api/services/catalog returns all 17 D-Grow services with stage workflows', async () => {
    const res = await request(app)
      .get('/api/services/catalog')
      .set('Cookie', am1Cookie)
      .set('X-CSRF-Token', csrfToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.services)).toBe(true);
    expect(res.body.services.length).toBeGreaterThanOrEqual(17);

    // Verify SEO service structure
    const seo = res.body.services.find((s) => s.code === 'SEO');
    expect(seo).toBeDefined();
    expect(seo.title).toMatch(/SEO/i);
    expect(seo.stages.length).toBe(4);
    expect(seo.stages[0].tasks.length).toBeGreaterThan(0);
    // Verify deliverable flags
    const hasDeliverable = seo.stages.some((st) => st.tasks.some((t) => t.cr === true));
    expect(hasDeliverable).toBe(true);
  });

  // 2. Account Manager Scoping & Client Isolation
  it('2a. GET /api/clients scopes list to Account Manager assigned clients', async () => {
    // AM 1 should see Client Alpha, but NOT Client Beta
    const res1 = await request(app)
      .get('/api/clients')
      .set('Cookie', am1Cookie)
      .set('X-CSRF-Token', csrfToken);

    expect(res1.status).toBe(200);
    const clients1 = res1.body.clients || res1.body;
    expect(clients1.some((c) => c.id === client1Id)).toBe(true);
    expect(clients1.some((c) => c.id === client2Id)).toBe(false);

    // AM 2 should see Client Beta, but NOT Client Alpha
    const res2 = await request(app)
      .get('/api/clients')
      .set('Cookie', am2Cookie)
      .set('X-CSRF-Token', csrfToken);

    expect(res2.status).toBe(200);
    const clients2 = res2.body.clients || res2.body;
    expect(clients2.some((c) => c.id === client2Id)).toBe(true);
    expect(clients2.some((c) => c.id === client1Id)).toBe(false);
  });

  it('2b. GET /api/clients/:id blocks unauthorized Account Manager from other AM clients', async () => {
    // AM 1 tries to access Client Beta (assigned to AM 2)
    const res = await request(app)
      .get(`/api/clients/${client2Id}`)
      .set('Cookie', am1Cookie)
      .set('X-CSRF-Token', csrfToken);

    expect([403, 404]).toContain(res.status);
  });

  it('2c. Client Portal user can only access their own client details', async () => {
    // Client user accesses own client (Alpha)
    const resAlpha = await request(app)
      .get(`/api/clients/${client1Id}`)
      .set('Cookie', clientCookie)
      .set('X-CSRF-Token', csrfToken);

    expect(resAlpha.status).toBe(200);
    expect(resAlpha.body.client.name).toBe('Alpha Health Clinic');

    // Client user attempts to access Client Beta
    const resBeta = await request(app)
      .get(`/api/clients/${client2Id}`)
      .set('Cookie', clientCookie)
      .set('X-CSRF-Token', csrfToken);

    expect([403, 404]).toContain(resBeta.status);
  });

  // 3. Auto-Trigger Engine v1
  it('3. POST /api/clients/:id/services bundles service, creates ServiceInstance, and generates tasks', async () => {
    const res = await request(app)
      .post(`/api/clients/${client1Id}/services`)
      .set('Cookie', am1Cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        serviceCode: 'SEO',
        assigneeMap: {
          seo_executive: seoExecId
        }
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.serviceInstance).toBeDefined();
    expect(res.body.serviceInstance.service_code).toBe('SEO');
    expect(res.body.serviceInstance.current_stage).toBe('Audit');
    expect(res.body.tasksCreated).toBeGreaterThan(0);

    createdServiceInstanceId = res.body.serviceInstance.id;

    // Verify DB tasks generated
    const [tasks] = await pool.query(
      `SELECT id, title, client_id, source, column_status, is_client_deliverable, assignee_id
       FROM tasks WHERE service_instance_id = ?`,
      [createdServiceInstanceId]
    );

    expect(tasks.length).toBe(res.body.tasksCreated);
    expect(tasks[0].client_id).toBe(client1Id);
    expect(tasks[0].source).toBe('Workflow');
    expect(tasks[0].column_status).toBe('todo');
    expect(tasks[0].assignee_id).toBe(seoExecId);

    // Verify client lifecycle stage transitioned to L2
    const [clientRows] = await pool.query('SELECT lifecycle_stage FROM clients WHERE id = ?', [
      client1Id
    ]);
    expect(clientRows[0].lifecycle_stage).toBe('L2');
  });

  // 4. Standalone / Manual Task Creation & 5-Column Kanban Flow
  it('4a. POST /api/tasks allows creating manual client tasks without a project', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Cookie', am1Cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Review Client Quarterly Hospital Analytics',
        client_id: client1Id,
        assignee_id: seoExecId,
        due_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        source: 'Manual',
        is_client_deliverable: true,
        priority: 'high'
      });

    expect(res.status).toBe(201);
    expect(res.body.task).toBeDefined();
    expect(res.body.task.source).toBe('Manual');
    expect(res.body.task.client_id).toBe(client1Id);
    expect(res.body.task.column_status).toBe('todo');

    manualTaskId = res.body.task.id;
  });

  it('4b. Progresses manual task through 5-column Kanban with revision tracking', async () => {
    // 1. Move to In Progress
    const resProg = await request(app)
      .patch(`/api/tasks/${manualTaskId}/status`)
      .set('Cookie', seoExecCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ column_status: 'in_progress', comment: 'Started analytics compilation' });

    expect(resProg.status).toBe(200);
    expect(resProg.body.task.column_status).toBe('in_progress');
    expect(resProg.body.task.status).toBe('in_progress');

    // 2. Move to Client Review
    const resReview = await request(app)
      .patch(`/api/tasks/${manualTaskId}/status`)
      .set('Cookie', seoExecCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ column_status: 'client_review', comment: 'Analytics report submitted for client review' });

    expect(resReview.status).toBe(200);
    expect(resReview.body.task.column_status).toBe('client_review');
    expect(resReview.body.task.status).toBe('in_review');

    // 3. Client requests revision -> Move to Revision
    const resRevision = await request(app)
      .patch(`/api/tasks/${manualTaskId}/status`)
      .set('Cookie', am1Cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ column_status: 'revision', comment: 'Add OPD patient comparison metrics' });

    expect(resRevision.status).toBe(200);
    expect(resRevision.body.task.column_status).toBe('revision');
    expect(resRevision.body.task.status).toBe('in_progress');
    expect(resRevision.body.task.revision_count).toBe(1);

    // 4. Revise and finish -> Move to Done
    const resDone = await request(app)
      .patch(`/api/tasks/${manualTaskId}/status`)
      .set('Cookie', am1Cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ column_status: 'done', comment: 'Approved and finalized' });

    expect(resDone.status).toBe(200);
    expect(resDone.body.task.column_status).toBe('done');
    expect(resDone.body.task.status).toBe('completed');
  });

  // 5. 3 BD Pipelines & Lead Conversion
  it('5a. Creates and filters leads across 3 BD pipelines (D-Grow, MedGrowDigi, Mediqora)', async () => {
    // Create D-Grow pipeline lead
    const resDGrow = await request(app)
      .post('/api/leads')
      .set('Cookie', ownerCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Metro Retail Mart Growth Contract',
        pipelineEntity: 'D-Grow',
        company_name: 'Metro Retail Mart',
        contact_name: 'Vikram Singh',
        contact_phone: '+91 9876543210',
        contact_email: 'vikram@metroretail.com',
        stage: 'Discovery',
        estimatedValue: 75000
      });

    expect(resDGrow.status).toBe(201);
    dgrowLeadId = resDGrow.body.lead.id;
    expect(resDGrow.body.lead.pipeline_entity).toBe('D-Grow');

    // Create MedGrowDigi healthcare lead
    const resMedGrow = await request(app)
      .post('/api/leads')
      .set('Cookie', ownerCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Apollo Dental Care Digital Strategy',
        pipelineEntity: 'MedGrowDigi',
        company_name: 'Apollo Dental Care',
        contact_name: 'Dr. Shalini Gupta',
        contact_phone: '+91 9876543211',
        contact_email: 'shalini@apollodental.com',
        stage: 'Audit/Pitch',
        estimatedValue: 120000
      });

    expect(resMedGrow.status).toBe(201);
    const medLeadId = resMedGrow.body.lead.id;

    // Filter by MedGrowDigi pipeline
    const listMed = await request(app)
      .get('/api/leads?pipeline=MedGrowDigi')
      .set('Cookie', ownerCookie)
      .set('X-CSRF-Token', csrfToken);

    expect(listMed.status).toBe(200);
    expect(listMed.body.leads.some((l) => l.id === medLeadId)).toBe(true);
    expect(listMed.body.leads.some((l) => l.id === dgrowLeadId)).toBe(false);

    // Clean up temporary MedGrow lead
    await pool.query('DELETE FROM leads WHERE id = ?', [medLeadId]);
  });

  it('5b. POST /api/leads/:id/convert converts lead into active client', async () => {
    const res = await request(app)
      .post(`/api/leads/${dgrowLeadId}/convert`)
      .set('Cookie', ownerCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        account_manager_id: am1Id,
        gstin: '29ABCDE1234F1Z5'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.client).toBeDefined();
    expect(res.body.client.entity).toBe('D-Grow');
    expect(res.body.client.lifecycle_stage).toBe('L1');

    // Verify lead status updated to won
    const [leadRows] = await pool.query('SELECT stage, converted_client_id FROM leads WHERE id = ?', [
      dgrowLeadId
    ]);
    expect(leadRows[0].stage).toBe('Won');
    expect(leadRows[0].converted_client_id).toBe(res.body.client.id);

    // Cleanup converted client
    await pool.query('DELETE FROM clients WHERE id = ?', [res.body.client.id]);
  });
});
