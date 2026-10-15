import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';
import { seedRbac } from '../src/modules/rbac/rbac.seed.js';

describe('D-Grow OS Phase 2: Client Management & Lifecycle Suite', () => {
  let csrfToken = '';
  let csrfCookie = '';

  let ownerCookie = '';
  let adminCookie = '';
  let am1Cookie = '';
  let am2Cookie = '';
  let employeeCookie = '';

  let ownerId;
  let adminId;
  let am1Id;
  let am2Id;
  let employeeId;

  let testDeptId;
  let publishedPresetId;
  let draftPresetId;

  let testClientId;
  let testClientCode = 'CLT-P2-001';

  beforeAll(async () => {
    // 1. Seed RBAC to ensure all permissions and mappings are populated
    await seedRbac();

    // 2. Fetch CSRF token
    const csrfRes = await request(app).get('/api/auth/csrf-token');
    csrfToken = csrfRes.body.csrfToken;
    const cookies = csrfRes.headers['set-cookie'];
    csrfCookie = cookies.find((c) => c.startsWith('xsrf_token='));

    const testPassword = 'Password123!';
    const passwordHash = await bcrypt.hash(testPassword, 10);

    const setupUser = async (name, email, roleSlug, systemRole = 'employee') => {
      await pool.query(
        `INSERT INTO users (name, email, password_hash, role, status, last_login_at)
         VALUES (?, ?, ?, ?, 'active', NOW())
         ON DUPLICATE KEY UPDATE password_hash = ?, role = ?, status = 'active', last_login_at = NOW()`,
        [name, email, passwordHash, systemRole, passwordHash, systemRole]
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

      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email, password: testPassword });

      const authCookie = loginRes.headers['set-cookie']?.find((c) => c.startsWith('access_token='));
      return { userId, cookie: `${csrfCookie}; ${authCookie}` };
    };

    const owner = await setupUser('Owner User', 'owner-p2@dgrow.com', 'owner', 'owner');
    ownerId = owner.userId;
    ownerCookie = owner.cookie;

    const admin = await setupUser('Admin User', 'admin-p2@dgrow.com', 'admin', 'admin');
    adminId = admin.userId;
    adminCookie = admin.cookie;

    const am1 = await setupUser('Account Manager 1', 'am1-p2@dgrow.com', 'account-manager', 'account_manager');
    am1Id = am1.userId;
    am1Cookie = am1.cookie;

    const am2 = await setupUser('Account Manager 2', 'am2-p2@dgrow.com', 'account-manager', 'account_manager');
    am2Id = am2.userId;
    am2Cookie = am2.cookie;

    const emp = await setupUser('Staff Employee', 'emp-p2@dgrow.com', 'employee', 'employee');
    employeeId = emp.userId;
    employeeCookie = emp.cookie;

    // 3. Create a test department & workflow presets (one published, one draft)
    const [deptRes] = await pool.query(
      `INSERT INTO departments (name, code, description, status, created_by)
       VALUES ('Performance Marketing', 'PERF_P2', 'Digital Ads and Meta campaigns', 'active', ?)`,
      [ownerId]
    );
    testDeptId = deptRes.insertId;

    const [pubPresetRes] = await pool.query(
      `INSERT INTO workflow_presets (name, preset_code, department_id, description, status, created_by)
       VALUES ('Meta Ads Retargeting', 'PRESET_P2_PUB', ?, 'Standard funnel preset', 'published', ?)`,
      [testDeptId, ownerId]
    );
    publishedPresetId = pubPresetRes.insertId;

    const [draftPresetRes] = await pool.query(
      `INSERT INTO workflow_presets (name, preset_code, department_id, description, status, created_by)
       VALUES ('Unfinished SEO Blueprint', 'PRESET_P2_DRAFT', ?, 'Draft preset', 'draft', ?)`,
      [testDeptId, ownerId]
    );
    draftPresetId = draftPresetRes.insertId;
  });

  afterAll(async () => {
    // Cleanup test records
    if (testClientId) {
      await pool.query('DELETE FROM clients WHERE id = ?', [testClientId]);
    }
    if (publishedPresetId) {
      await pool.query('DELETE FROM workflow_presets WHERE id IN (?, ?)', [publishedPresetId, draftPresetId]);
    }
    if (testDeptId) {
      await pool.query('DELETE FROM departments WHERE id = ?', [testDeptId]);
    }
  });

  // 1. Dashboard Statistics
  it('1. GET /api/clients/dashboard/stats returns real database metrics', async () => {
    const res = await request(app)
      .get('/api/clients/dashboard/stats')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.stats).toBeDefined();
    expect(typeof res.body.stats.totalClients).toBe('number');
    expect(typeof res.body.stats.activeClients).toBe('number');
    expect(typeof res.body.stats.onboardingClients).toBe('number');
    expect(typeof res.body.stats.pausedClients).toBe('number');
    expect(Array.isArray(res.body.stats.byAccountManager)).toBe(true);
    expect(Array.isArray(res.body.stats.byLifecycleStage)).toBe(true);
  });

  // 2. Client Creation with Business fields and primary contact
  it('2. POST /api/clients creates client record, unique code, primary contact and onboarding checklist', async () => {
    const res = await request(app)
      .post('/api/clients')
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Apex Health Systems',
        clientCode: testClientCode,
        companyName: 'Apex Health Pvt Ltd',
        industry: 'Healthcare',
        website: 'https://apexhealth.example.com',
        email: 'contact@apexhealth.example.com',
        phone: '+91 9876543210',
        address: '101 Medical Enclave',
        city: 'Bengaluru',
        country: 'India',
        entity: 'MedGrowDigi',
        vertical: 'Healthcare',
        lifecycleStage: 'onboarding',
        accountManagerId: am1Id,
        requirementsNotes: 'Needs complete Meta Ads and Google Local SEO.',
        communicationPreferences: { channel: 'WhatsApp', emergency: 'Phone' },
        primaryContact: {
          name: 'Dr. Ramesh Sharma',
          designation: 'Managing Director',
          email: 'ramesh@apexhealth.example.com',
          phone: '+91 9876543211'
        }
      });

    expect(res.status).toBe(201);
    expect(res.body.client).toBeDefined();
    expect(res.body.client.name).toBe('Apex Health Systems');
    expect(res.body.client.client_code).toBe(testClientCode);
    expect(res.body.client.account_manager_id).toBe(am1Id);
    expect(res.body.client.industry).toBe('Healthcare');
    expect(res.body.client.city).toBe('Bengaluru');

    testClientId = res.body.client.id;

    // Verify primary contact was created
    const contactsRes = await request(app)
      .get(`/api/clients/${testClientId}/contacts`)
      .set('Cookie', adminCookie);

    expect(contactsRes.status).toBe(200);
    expect(contactsRes.body.contacts.length).toBeGreaterThanOrEqual(1);
    const pContact = contactsRes.body.contacts.find((c) => c.is_primary);
    expect(pContact).toBeDefined();
    expect(pContact.name).toBe('Dr. Ramesh Sharma');
    expect(pContact.email).toBe('ramesh@apexhealth.example.com');

    // Verify 8 onboarding checklist items were initialized
    const obRes = await request(app)
      .get(`/api/clients/${testClientId}/onboarding`)
      .set('Cookie', adminCookie);

    expect(obRes.status).toBe(200);
    expect(obRes.body.onboarding.totalItems).toBe(8);
    expect(obRes.body.onboarding.progressPercent).toBe(0);
  });

  // 3. Duplicate Prevention (email and client_code)
  it('3. POST /api/clients prevents duplicate emails and client codes', async () => {
    // Duplicate email
    const resDupEmail = await request(app)
      .post('/api/clients')
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Another Company',
        email: 'contact@apexhealth.example.com',
        clientCode: 'CLT-UNIQUE-123'
      });
    expect(resDupEmail.status).toBe(409);

    // Duplicate client code
    const resDupCode = await request(app)
      .post('/api/clients')
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Another Company',
        email: 'other@company.com',
        clientCode: testClientCode
      });
    expect(resDupCode.status).toBe(409);
  });

  // 4. Client Editing
  it('4. PUT /api/clients/:id updates client fields and logs activity', async () => {
    const res = await request(app)
      .put(`/api/clients/${testClientId}`)
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Apex Health Systems International',
        website: 'https://apexinternational.com',
        city: 'Mumbai',
        requirementsNotes: 'Updated scope with multi-location SEO.'
      });

    expect(res.status).toBe(200);
    expect(res.body.client.name).toBe('Apex Health Systems International');
    expect(res.body.client.website).toBe('https://apexinternational.com');
    expect(res.body.client.city).toBe('Mumbai');
  });

  // 5. Client Lifecycle Transitions with validation and reasons
  it('5. PUT /api/clients/:id/lifecycle manages stage transitions with reasons', async () => {
    // Advance to active
    const resActive = await request(app)
      .put(`/api/clients/${testClientId}/lifecycle`)
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        stage: 'active',
        notes: 'Onboarding completed and services initiated'
      });

    expect(resActive.status).toBe(200);
    expect(resActive.body.lifecycle.current_stage).toBe('active');
    expect(resActive.body.lifecycle.client_status).toBe('active');

    // Transition to paused with reason
    const resPaused = await request(app)
      .put(`/api/clients/${testClientId}/lifecycle`)
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        stage: 'paused',
        reason: 'Client requested hold for festive holiday season'
      });

    expect(resPaused.status).toBe(200);
    expect(resPaused.body.lifecycle.current_stage).toBe('paused');
    expect(resPaused.body.lifecycle.client_status).toBe('paused');

    // Reject invalid stage
    const resInvalid = await request(app)
      .put(`/api/clients/${testClientId}/lifecycle`)
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        stage: 'unknown_stage_name'
      });

    expect(resInvalid.status).toBe(400);
  });

  // 6. Multiple Client Contacts Management
  it('6. Manages multiple contacts and primary contact designation', async () => {
    // Add second contact
    const resAdd = await request(app)
      .post(`/api/clients/${testClientId}/contacts`)
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Priya Nair',
        designation: 'Marketing Lead',
        email: 'priya@apexhealth.example.com',
        phone: '+91 9876543222',
        isPrimary: false
      });

    expect(resAdd.status).toBe(201);
    const contact2Id = resAdd.body.contact.id;

    // Toggle contact 2 as primary
    const resPrimary = await request(app)
      .put(`/api/clients/${testClientId}/contacts/${contact2Id}/primary`)
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken);

    expect(resPrimary.status).toBe(200);

    // Verify contact 2 is primary and contact 1 is not
    const contactsRes = await request(app)
      .get(`/api/clients/${testClientId}/contacts`)
      .set('Cookie', adminCookie);

    const c2 = contactsRes.body.contacts.find((c) => c.id === contact2Id);
    expect(c2.is_primary).toBe(1);

    // Delete contact 2
    const resDel = await request(app)
      .delete(`/api/clients/${testClientId}/contacts/${contact2Id}`)
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken);

    expect(resDel.status).toBe(200);
  });

  // 7. Account Manager Assignment, Reassignment, and History
  it('7. Assigns AM, records history, and notifies new Account Manager', async () => {
    // Reassign to am2Id
    const resReassign = await request(app)
      .post(`/api/clients/${testClientId}/assign-account-manager`)
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        accountManagerId: am2Id,
        reason: 'Shifted portfolio for healthcare vertical focus'
      });

    expect(resReassign.status).toBe(200);
    expect(resReassign.body.client.account_manager_id).toBe(am2Id);

    // Verify history recorded
    const resHist = await request(app)
      .get(`/api/clients/${testClientId}/account-manager-history`)
      .set('Cookie', adminCookie);

    expect(resHist.status).toBe(200);
    expect(resHist.body.history.length).toBeGreaterThanOrEqual(1);
    expect(resHist.body.history[0].new_manager_id).toBe(am2Id);
    expect(resHist.body.history[0].previous_manager_id).toBe(am1Id);
    expect(resHist.body.history[0].reason).toContain('healthcare vertical focus');
  });

  // 8. Onboarding Checklist Persistence and Progress
  it('8. Updates onboarding checklist items and calculates dynamic progress', async () => {
    const obRes = await request(app)
      .get(`/api/clients/${testClientId}/onboarding`)
      .set('Cookie', adminCookie);

    const firstItem = obRes.body.onboarding.items[0];

    // Mark item complete
    const resUpdate = await request(app)
      .patch(`/api/clients/${testClientId}/onboarding/items/${firstItem.id}`)
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        isCompleted: true,
        notes: 'Verified via kickoff Zoom call'
      });

    expect(resUpdate.status).toBe(200);
    expect(resUpdate.body.onboarding.completedItems).toBe(1);
    expect(resUpdate.body.onboarding.progressPercent).toBeGreaterThan(0);

    // Add custom checklist item
    const resAddCustom = await request(app)
      .post(`/api/clients/${testClientId}/onboarding/items`)
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Acquire Google Tag Manager Admin Rights',
        dueDate: '2026-11-01',
        notes: 'Pending IT approval'
      });

    expect(resAddCustom.status).toBe(201);
    expect(resAddCustom.body.onboarding.totalItems).toBe(9);
  });

  // 9. Client Services Configuration & Published Workflow Preset Binding
  it('9. Configures client service with department and published preset', async () => {
    // Valid configuration with published preset
    const resService = await request(app)
      .post(`/api/clients/${testClientId}/services`)
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        label: 'Meta Ad Campaigns Q4',
        departmentId: testDeptId,
        workflowPresetId: publishedPresetId,
        serviceFrequency: 'Monthly',
        scopeDescription: '5 ad creatives per month + weekly optimizations',
        expectedDeliverables: 'Monthly performance report and ROAS analysis',
        startDate: '2026-11-01',
        status: 'active'
      });

    expect(resService.status).toBe(201);
    expect(resService.body.service.label).toBe('Meta Ad Campaigns Q4');
    expect(resService.body.service.department_id).toBe(testDeptId);
    expect(resService.body.service.workflow_preset_id).toBe(publishedPresetId);

    // Attempting to configure with an un-published draft preset must be rejected
    const resDraft = await request(app)
      .post(`/api/clients/${testClientId}/services`)
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        label: 'SEO Experiment',
        workflowPresetId: draftPresetId
      });

    expect(resDraft.status).toBe(400);
  });

  // 10. Client Detail Workspace (11 Sections)
  it('10. GET /api/clients/:id/workspace aggregates all 11 sections', async () => {
    const res = await request(app)
      .get(`/api/clients/${testClientId}/workspace`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    const ws = res.body.workspace;
    expect(ws.overview).toBeDefined();
    expect(ws.contacts).toBeDefined();
    expect(ws.onboarding).toBeDefined();
    expect(ws.services).toBeDefined();
    expect(ws.projects).toBeDefined();
    expect(ws.tasks).toBeDefined();
    expect(ws.deliverables).toBeDefined();
    expect(ws.approvals).toBeDefined();
    expect(ws.reports).toBeDefined();
    expect(ws.documents).toBeDefined();
    expect(ws.activity).toBeDefined();

    expect(ws.services.length).toBeGreaterThanOrEqual(1);
    expect(ws.activity.length).toBeGreaterThanOrEqual(1);
  });

  // 11. RBAC and Account Manager Scoping Isolation
  it('11. Account Manager isolation blocks access to clients assigned to another AM', async () => {
    // Client is currently assigned to am2Id.
    // AM 1 should be denied access to view or modify this client
    const resBlocked = await request(app)
      .get(`/api/clients/${testClientId}`)
      .set('Cookie', am1Cookie);

    expect(resBlocked.status).toBe(403);

    // Standard employee without clients.view permission should be blocked
    const resEmpBlocked = await request(app)
      .get(`/api/clients/${testClientId}`)
      .set('Cookie', employeeCookie);

    expect(resEmpBlocked.status).toBe(403);

    // AM 2 (the assigned AM) can access the client
    const resAm2Allowed = await request(app)
      .get(`/api/clients/${testClientId}`)
      .set('Cookie', am2Cookie);

    expect(resAm2Allowed.status).toBe(200);
  });
});
