import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';
import { seedRbac } from '../src/modules/rbac/rbac.seed.js';

describe('Phase 4: Project Management, Clients & Milestones Suite', () => {
  let csrfToken = '';
  let csrfCookie = '';

  let ownerCookie = '';
  let pm1Cookie = '';
  let pm2Cookie = '';
  let client1Cookie = '';
  let client2Cookie = '';
  let employeeCookie = '';

  let ownerId;
  let pm1Id;
  let pm2Id;
  let client1UserId;
  let client2UserId;
  let employeeId;

  let clientId1;
  let clientId2;
  let testTeamId;

  let createdProjectId;
  let createdMilestoneId;

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

    // Setup helper to create user with roles
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

    ownerId = await setupUser('P4 Owner', 'p4_owner@agency.com', 'owner', 'owner');
    pm1Id = await setupUser('Project Manager 1', 'p4_pm1@agency.com', 'project-manager');
    pm2Id = await setupUser('Project Manager 2', 'p4_pm2@agency.com', 'project-manager');
    client1UserId = await setupUser('Client User 1', 'p4_client1@agency.com', 'client');
    client2UserId = await setupUser('Client User 2', 'p4_client2@agency.com', 'client');
    employeeId = await setupUser('P4 Employee', 'p4_emp@agency.com', 'employee');

    // Setup test team
    const [teamRes] = await pool.query(
      `INSERT INTO teams (name, description, leader_id, status)
       VALUES ('P4 Dev Team', 'Test team for Phase 4', ?, 'active')
       ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
      [employeeId]
    );
    testTeamId = teamRes.insertId;
    await pool.query(
      'INSERT IGNORE INTO team_members (team_id, user_id, team_role) VALUES (?, ?, "leader")',
      [testTeamId, employeeId]
    );

    // Setup clients
    const [c1Res] = await pool.query(
      `INSERT INTO clients (name, email, company_name, user_id, status)
       VALUES ('Acme Corp Client', 'acme@client.com', 'Acme Corp', ?, 'active')
       ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
      [client1UserId]
    );
    clientId1 = c1Res.insertId;

    const [c2Res] = await pool.query(
      `INSERT INTO clients (name, email, company_name, user_id, status)
       VALUES ('Beta LLC Client', 'beta@client.com', 'Beta LLC', ?, 'active')
       ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
      [client2UserId]
    );
    clientId2 = c2Res.insertId;

    // Login users to get session cookies
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

    ownerCookie = await loginUser('p4_owner@agency.com');
    pm1Cookie = await loginUser('p4_pm1@agency.com');
    pm2Cookie = await loginUser('p4_pm2@agency.com');
    client1Cookie = await loginUser('p4_client1@agency.com');
    client2Cookie = await loginUser('p4_client2@agency.com');
    employeeCookie = await loginUser('p4_emp@agency.com');
  });

  afterAll(async () => {
    // Clean up created test data
    if (createdProjectId) {
      await pool.query('DELETE FROM projects WHERE id = ?', [createdProjectId]);
    }
  });

  // 1. Project Creation with Valid Data
  it('1. POST /api/projects creates a project with valid data and initial assignments', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Cookie', ownerCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Website Redesign',
        projectCode: 'WEB-2026',
        description: 'Complete corporate redesign',
        clientId: clientId1,
        projectManagerId: pm1Id,
        status: 'planning',
        priority: 'high',
        visibility: 'client_facing',
        startDate: '2026-10-15',
        dueDate: '2026-12-31',
        teamIds: [testTeamId],
        memberIds: [employeeId]
      });

    expect(res.status).toBe(201);
    expect(res.body.project).toBeDefined();
    expect(res.body.project.project_code).toBe('WEB-2026');
    expect(res.body.project.client_id).toBe(clientId1);
    expect(res.body.project.members.length).toBeGreaterThanOrEqual(2); // PM1 + employee
    expect(res.body.project.teams.length).toBe(1);

    createdProjectId = res.body.project.id;
  });

  // 2. Duplicate Project Code Rejection
  it('2. POST /api/projects rejects duplicate project code', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Cookie', ownerCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Another Redesign',
        projectCode: 'WEB-2026', // Duplicate code
        projectManagerId: pm1Id
      });

    expect(res.status).toBe(409);
    const errText = typeof res.body.error === 'object' ? res.body.error.message : res.body.error;
    expect(errText).toMatch(/already in use/i);
  });

  // 3. Invalid Project Manager Rejection
  it('3. POST /api/projects rejects non-existent or inactive project manager', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Cookie', ownerCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Invalid PM Project',
        projectCode: 'INV-PM-01',
        projectManagerId: 9999999
      });

    expect(res.status).toBe(400);
    const errText = typeof res.body.error === 'object' ? res.body.error.message : res.body.error;
    expect(errText).toMatch(/not found/i);
  });

  // 4. Invalid Client Assignment Rejection
  it('4. POST /api/projects rejects non-existent client assignment', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Cookie', ownerCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Invalid Client Project',
        projectCode: 'INV-CLI-01',
        projectManagerId: pm1Id,
        clientId: 9999999
      });

    expect(res.status).toBe(400);
    const errText = typeof res.body.error === 'object' ? res.body.error.message : res.body.error;
    expect(errText).toMatch(/client does not exist/i);
  });

  // 5. Project Update Authorization
  it('5. PUT /api/projects/:id allows authorized PM to update their own project', async () => {
    const res = await request(app)
      .put(`/api/projects/${createdProjectId}`)
      .set('Cookie', pm1Cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Website Redesign v2',
        priority: 'urgent',
        notes: 'Updated sprint deliverable'
      });

    expect(res.status).toBe(200);
    expect(res.body.project.name).toBe('Website Redesign v2');
    expect(res.body.project.priority).toBe('urgent');
  });

  // 6. Unauthorized Project Access Rejection
  it('6. GET /api/projects/:id rejects unrelated PM from accessing other project', async () => {
    // PM2 is NOT a member, NOT the PM, NOT on an assigned team for createdProjectId
    const res = await request(app)
      .get(`/api/projects/${createdProjectId}`)
      .set('Cookie', pm2Cookie);

    expect(res.status).toBe(403);
    const errText = typeof res.body.error === 'object' ? res.body.error.message : res.body.error;
    expect(errText).toMatch(/permission to access/i);
  });

  // 7. Client Isolation Between Unrelated Projects
  it('7. Enforces client isolation: Client 2 cannot access Client 1 project', async () => {
    const res = await request(app)
      .get(`/api/projects/${createdProjectId}`)
      .set('Cookie', client2Cookie);

    expect(res.status).toBe(403);
  });

  it('7b. Client 1 can access their explicitly associated project', async () => {
    const res = await request(app)
      .get(`/api/projects/${createdProjectId}`)
      .set('Cookie', client1Cookie);

    expect(res.status).toBe(200);
    expect(res.body.project.id).toBe(createdProjectId);
  });

  // 8. Team Leader Access Check
  it('8. Team member on assigned team can access project', async () => {
    // Employee is on testTeamId which is assigned to createdProjectId
    const res = await request(app)
      .get(`/api/projects/${createdProjectId}`)
      .set('Cookie', employeeCookie);

    expect(res.status).toBe(200);
    expect(res.body.project.id).toBe(createdProjectId);
  });

  // 9. Project Member Assignment Validation
  it('9. PUT /api/projects/:id/members validates members and preserves PM', async () => {
    const res = await request(app)
      .put(`/api/projects/${createdProjectId}/members`)
      .set('Cookie', pm1Cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        members: [
          { userId: employeeId, projectRole: 'member' }
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.members).toBeDefined();
    // PM1 must be automatically retained as manager
    const pmFound = res.body.members.find((m) => Number(m.user_id) === Number(pm1Id));
    expect(pmFound).toBeDefined();
    expect(pmFound.project_role).toBe('manager');
  });

  // 10. Project Status Transition Rules
  it('10. PATCH /api/projects/:id/status updates status and sets completed_at', async () => {
    const res = await request(app)
      .patch(`/api/projects/${createdProjectId}/status`)
      .set('Cookie', pm1Cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'completed' });

    expect(res.status).toBe(200);
    expect(res.body.project.status).toBe('completed');
    expect(res.body.project.completed_at).toBeDefined();
  });

  // 11. Milestone Creation and Update
  it('11. POST /api/projects/:id/milestones creates milestone for project', async () => {
    const res = await request(app)
      .post(`/api/projects/${createdProjectId}/milestones`)
      .set('Cookie', pm1Cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Phase 1 Frontend Wireframes',
        description: 'Complete UI mocks and user flows',
        dueDate: '2026-11-01',
        status: 'pending'
      });

    expect(res.status).toBe(201);
    expect(res.body.milestone).toBeDefined();
    expect(res.body.milestone.title).toBe('Phase 1 Frontend Wireframes');
    createdMilestoneId = res.body.milestone.id;
  });

  it('11b. PUT /api/projects/:id/milestones/:milestoneId updates milestone', async () => {
    const res = await request(app)
      .put(`/api/projects/${createdProjectId}/milestones/${createdMilestoneId}`)
      .set('Cookie', pm1Cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Phase 1 Wireframes & Design System',
        status: 'in_progress'
      });

    expect(res.status).toBe(200);
    expect(res.body.milestone.title).toBe('Phase 1 Wireframes & Design System');
    expect(res.body.milestone.status).toBe('in_progress');
  });

  // 12. Milestone Completion Timestamp
  it('12. PATCH /api/projects/:id/milestones/:milestoneId/status sets completed_at when completed', async () => {
    const res = await request(app)
      .patch(`/api/projects/${createdProjectId}/milestones/${createdMilestoneId}/status`)
      .set('Cookie', pm1Cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'completed' });

    expect(res.status).toBe(200);
    expect(res.body.milestone.status).toBe('completed');
    expect(res.body.milestone.completed_at).toBeDefined();
  });

  // 13. Cross-Project Milestone Access Rejection
  it('13. Rejects modifying milestone under a wrong project ID', async () => {
    const res = await request(app)
      .put(`/api/projects/9999999/milestones/${createdMilestoneId}`)
      .set('Cookie', ownerCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'Hacked Title' });

    expect(res.status).toBe(404);
  });

  // 14. Project Archive Behavior
  it('14. POST /api/projects/:id/archive marks project as archived', async () => {
    const res = await request(app)
      .post(`/api/projects/${createdProjectId}/archive`)
      .set('Cookie', ownerCookie)
      .set('X-CSRF-Token', csrfToken);

    expect(res.status).toBe(200);

    const [rows] = await pool.query('SELECT is_archived FROM projects WHERE id = ?', [createdProjectId]);
    expect(rows[0].is_archived).toBe(1);
  });

  // 15. Transaction Rollback when Assignments Fail
  it('15. Transaction rolls back project creation if member assignments contain invalid IDs', async () => {
    const [beforeCount] = await pool.query('SELECT COUNT(*) as cnt FROM projects WHERE project_code = "FAIL-TX-01"');
    expect(beforeCount[0].cnt).toBe(0);

    const res = await request(app)
      .post('/api/projects')
      .set('Cookie', ownerCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Failing Transaction Project',
        projectCode: 'FAIL-TX-01',
        projectManagerId: pm1Id,
        memberIds: [9999999] // Invalid member triggers rollback
      });

    expect(res.status).toBe(400);

    const [afterCount] = await pool.query('SELECT COUNT(*) as cnt FROM projects WHERE project_code = "FAIL-TX-01"');
    expect(afterCount[0].cnt).toBe(0); // Zero orphaned rows
  });

  // 16. Pagination and Filtering
  it('16. GET /api/projects supports pagination, search, and status filters', async () => {
    const res = await request(app)
      .get('/api/projects?search=Redesign&isArchived=true&limit=10&offset=0')
      .set('Cookie', ownerCookie);

    expect(res.status).toBe(200);
    expect(res.body.projects).toBeDefined();
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.projects.length).toBeGreaterThanOrEqual(1);
  });

  // 17. Dashboard Metrics Respecting Access Scope
  it('17. GET /api/projects/metrics calculates metrics respecting user access scope', async () => {
    // Owner metrics
    const ownerRes = await request(app)
      .get('/api/projects/metrics')
      .set('Cookie', ownerCookie);

    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.metrics.totalProjects).toBeGreaterThanOrEqual(1);

    // Unrelated PM2 has access to 0 projects
    const pm2Res = await request(app)
      .get('/api/projects/metrics')
      .set('Cookie', pm2Cookie);

    expect(pm2Res.status).toBe(200);
    expect(pm2Res.body.metrics.totalProjects).toBe(0);
  });

  // 18. Audit Log Generation
  it('18. GET /api/projects/:id/activity returns audit history for project and milestones', async () => {
    const res = await request(app)
      .get(`/api/projects/${createdProjectId}/activity`)
      .set('Cookie', ownerCookie);

    expect(res.status).toBe(200);
    expect(res.body.activity).toBeDefined();
    expect(res.body.activity.length).toBeGreaterThan(0);
  });
});
