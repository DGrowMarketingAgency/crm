import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';
import { seedRbac } from '../src/modules/rbac/rbac.seed.js';

describe('Phase 3: User Management & Team Management Suite', () => {
  let csrfToken = '';
  let csrfCookie = '';

  let ownerCookie = '';
  let employeeCookie = '';
  let adminCookie = '';

  let ownerUserId;
  let employeeUserId;
  let adminUserId;

  let createdUserId;
  let createdTeamId;
  let invitationToken = '';
  let invitationId;

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

    // 3. Setup Owner
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ('Phase3 Owner', 'p3_owner@agency.com', ?, 'owner', 'active')
       ON DUPLICATE KEY UPDATE password_hash = ?, status = 'active'`,
      [passwordHash, passwordHash]
    );
    const [ownerRows] = await pool.query("SELECT id FROM users WHERE email = 'p3_owner@agency.com'");
    ownerUserId = ownerRows[0].id;
    const [ownerRole] = await pool.query("SELECT id FROM roles WHERE slug = 'owner'");
    await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [ownerUserId, ownerRole[0].id]);

    // 4. Setup Admin (has users.view, users.create, teams.create, but is not Owner)
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ('Phase3 Admin', 'p3_admin@agency.com', ?, 'member', 'active')
       ON DUPLICATE KEY UPDATE password_hash = ?, status = 'active'`,
      [passwordHash, passwordHash]
    );
    const [adminRows] = await pool.query("SELECT id FROM users WHERE email = 'p3_admin@agency.com'");
    adminUserId = adminRows[0].id;
    const [adminRole] = await pool.query("SELECT id FROM roles WHERE slug = 'admin'");
    await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [adminUserId, adminRole[0].id]);

    // 5. Setup Employee (no user/team management permissions)
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ('Phase3 Employee', 'p3_employee@agency.com', ?, 'member', 'active')
       ON DUPLICATE KEY UPDATE password_hash = ?, status = 'active'`,
      [passwordHash, passwordHash]
    );
    const [empRows] = await pool.query("SELECT id FROM users WHERE email = 'p3_employee@agency.com'");
    employeeUserId = empRows[0].id;
    const [empRole] = await pool.query("SELECT id FROM roles WHERE slug = 'employee'");
    await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [employeeUserId, empRole[0].id]);

    // 6. Login as Owner
    const loginOwner = await request(app)
      .post('/api/auth/login')
      .set('Cookie', [csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ email: 'p3_owner@agency.com', password: testPassword });
    ownerCookie = loginOwner.headers['set-cookie'].find((c) => c.startsWith('access_token='));

    // 7. Login as Admin
    const loginAdmin = await request(app)
      .post('/api/auth/login')
      .set('Cookie', [csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ email: 'p3_admin@agency.com', password: testPassword });
    adminCookie = loginAdmin.headers['set-cookie'].find((c) => c.startsWith('access_token='));

    // 8. Login as Employee
    const loginEmp = await request(app)
      .post('/api/auth/login')
      .set('Cookie', [csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ email: 'p3_employee@agency.com', password: testPassword });
    employeeCookie = loginEmp.headers['set-cookie'].find((c) => c.startsWith('access_token='));
  });

  afterAll(async () => {
    // Cleanup created test records
    if (createdTeamId) {
      await pool.query('DELETE FROM teams WHERE id = ?', [createdTeamId]);
    }
    await pool.query("DELETE FROM users WHERE email IN ('p3_owner@agency.com', 'p3_admin@agency.com', 'p3_employee@agency.com', 'created_user@agency.com', 'invited_user@agency.com')");
  });

  // 1. User Management
  describe('1. User Management CRUD & Permissions', () => {
    it('should reject user listing for unauthorized user with 403', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Cookie', [employeeCookie]);

      expect(res.status).toBe(403);
      expect(res.body.error.requiredPermission).toBe('users.view');
    });

    it('should list users with pagination and search for authorized user', async () => {
      const res = await request(app)
        .get('/api/users?search=Phase3')
        .set('Cookie', [ownerCookie]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.users)).toBe(true);
      expect(res.body.users.length).toBeGreaterThanOrEqual(1);

      // Verify passwords are NEVER returned
      expect(res.body.users[0].password_hash).toBeUndefined();
    });

    it('should create a new user account directly', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Cookie', [ownerCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          name: 'Created Test User',
          email: 'created_user@agency.com',
          password: 'Password123!',
          status: 'active'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.user.email).toBe('created_user@agency.com');
      createdUserId = res.body.user.id;
    });

    it('should reject duplicate email during user creation with 409', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Cookie', [ownerCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          name: 'Duplicate Email User',
          email: 'created_user@agency.com',
          password: 'Password123!'
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EMAIL_EXISTS');
    });

    it('should update user name and email', async () => {
      const res = await request(app)
        .put(`/api/users/${createdUserId}`)
        .set('Cookie', [ownerCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          name: 'Updated Name User'
        });

      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe('Updated Name User');
    });
  });

  // 2. Account Status Transitions & Session Invalidation
  describe('2. Account Status Transitions & Session Invalidation', () => {
    let testUserToken = '';

    beforeAll(async () => {
      // Login as createdUser to obtain active session
      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('Cookie', [csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'created_user@agency.com', password: 'Password123!' });

      testUserToken = loginRes.headers['set-cookie'].find((c) => c.startsWith('access_token='));
    });

    it('should deactivate user account and invalidate active sessions', async () => {
      const res = await request(app)
        .patch(`/api/users/${createdUserId}/status`)
        .set('Cookie', [ownerCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ status: 'inactive' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('inactive');

      // Verify that deactivated user is now immediately rejected from accessing protected API
      const protectedRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', [testUserToken]);

      expect(protectedRes.status).toBe(403);
      expect(protectedRes.body.error.code).toBe('ACCOUNT_INACTIVE');
    });

    it('should prevent deactivating the last active Owner', async () => {
      // Find all other active owners and temporarily deactivate them
      const [otherOwners] = await pool.query(
        `SELECT DISTINCT u.id FROM users u
         LEFT JOIN user_roles ur ON u.id = ur.user_id
         LEFT JOIN roles r ON ur.role_id = r.id
         WHERE (u.role = 'owner' OR r.slug = 'owner') AND u.id != ?`,
        [ownerUserId]
      );
      if (otherOwners.length > 0) {
        await pool.query(
          "UPDATE users SET status = 'inactive' WHERE id IN (?)",
          [otherOwners.map((o) => o.id)]
        );
      }

      // Now ownerUserId is truly the ONLY active owner
      const res = await request(app)
        .patch(`/api/users/${ownerUserId}/status`)
        .set('Cookie', [ownerCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ status: 'suspended' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CANNOT_DEACTIVATE_LAST_OWNER');

      // Restore other owners
      if (otherOwners.length > 0) {
        await pool.query(
          "UPDATE users SET status = 'active' WHERE id IN (?)",
          [otherOwners.map((o) => o.id)]
        );
      }
    });
  });

  // 3. Secure Invitations Lifecycle
  describe('3. Secure Invitations Lifecycle', () => {
    it('should create an invitation with a secure time-limited token', async () => {
      const [empRole] = await pool.query("SELECT id FROM roles WHERE slug = 'employee'");

      const res = await request(app)
        .post('/api/invitations')
        .set('Cookie', [ownerCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          name: 'Invited Member',
          email: 'invited_user@agency.com',
          roleIds: [empRole[0].id]
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.invitation.token).toBeDefined();
      expect(res.body.invitation.inviteUrl).toContain('/accept-invitation?token=');

      invitationToken = res.body.invitation.token;
      invitationId = res.body.invitation.id;

      // Verify token hash is stored in database, not the raw token
      const [invRows] = await pool.query('SELECT token_hash FROM invitations WHERE id = ?', [invitationId]);
      expect(invRows[0].token_hash).not.toEqual(invitationToken);
      expect(invRows[0].token_hash.length).toBe(64);
    });

    it('should reject granting Owner privileges through invitations', async () => {
      const [ownerRole] = await pool.query("SELECT id FROM roles WHERE slug = 'owner'");

      const res = await request(app)
        .post('/api/invitations')
        .set('Cookie', [ownerCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          name: 'Sneaky Owner Invite',
          email: 'sneaky_owner@agency.com',
          roleIds: [ownerRole[0].id]
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('OWNER_INVITATION_FORBIDDEN');
    });

    it('should list invitations for authorized administrator', async () => {
      const res = await request(app)
        .get('/api/invitations')
        .set('Cookie', [ownerCookie]);

      expect(res.status).toBe(200);
      expect(res.body.invitations.length).toBeGreaterThanOrEqual(1);
      expect(res.body.invitations.some((i) => i.user_email === 'invited_user@agency.com')).toBe(true);
    });

    it('should accept invitation publicly using token and set initial password', async () => {
      const res = await request(app)
        .post('/api/auth/accept-invitation')
        .send({
          token: invitationToken,
          password: 'NewSecurePassword123!'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.email).toBe('invited_user@agency.com');

      // Verify user is now active
      const [userRows] = await pool.query("SELECT status FROM users WHERE email = 'invited_user@agency.com'");
      expect(userRows[0].status).toBe('active');
    });

    it('should reject already accepted invitation (single-use enforcement)', async () => {
      const res = await request(app)
        .post('/api/auth/accept-invitation')
        .send({
          token: invitationToken,
          password: 'AnotherPassword123!'
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVITATION_ALREADY_ACCEPTED');
    });
  });

  // 4. Team Management Lifecycle
  describe('4. Team Management Lifecycle & Leader Designation', () => {
    it('should reject team creation by unauthorized user with 403', async () => {
      const res = await request(app)
        .post('/api/teams')
        .set('Cookie', [employeeCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ name: 'Unauthorized Team' });

      expect(res.status).toBe(403);
      expect(res.body.error.requiredPermission).toBe('teams.create');
    });

    it('should create a team with designated leader and initial members', async () => {
      const res = await request(app)
        .post('/api/teams')
        .set('Cookie', [ownerCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          name: 'Performance Marketing Team',
          description: 'Specializes in paid media and lead generation',
          leaderId: adminUserId,
          memberIds: [adminUserId, employeeUserId]
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.team.name).toBe('Performance Marketing Team');
      expect(res.body.team.leaderId).toBe(adminUserId);
      createdTeamId = res.body.team.id;

      // Verify leader is in team_members with team_role = 'leader'
      const [members] = await pool.query(
        'SELECT user_id, team_role FROM team_members WHERE team_id = ? AND user_id = ?',
        [createdTeamId, adminUserId]
      );
      expect(members.length).toBe(1);
      expect(members[0].team_role).toBe('leader');
    });

    it('should reject duplicate team membership with 409', async () => {
      const res = await request(app)
        .post(`/api/teams/${createdTeamId}/members`)
        .set('Cookie', [ownerCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          userId: employeeUserId
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_TEAM_MEMBERSHIP');
    });

    it('should reject adding inactive user to active team', async () => {
      // createdUserId is inactive
      const res = await request(app)
        .post(`/api/teams/${createdTeamId}/members`)
        .set('Cookie', [ownerCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          userId: createdUserId
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INACTIVE_USER_CANNOT_BE_MEMBER');
    });

    it('should change team leader transactionally and demote previous leader to member', async () => {
      const res = await request(app)
        .put(`/api/teams/${createdTeamId}/leader`)
        .set('Cookie', [ownerCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          leaderId: employeeUserId
        });

      expect(res.status).toBe(200);
      expect(res.body.leaderId).toBe(employeeUserId);

      // Verify new leader has team_role = 'leader'
      const [newLeader] = await pool.query(
        'SELECT team_role FROM team_members WHERE team_id = ? AND user_id = ?',
        [createdTeamId, employeeUserId]
      );
      expect(newLeader[0].team_role).toBe('leader');

      // Verify previous leader is now 'member'
      const [prevLeader] = await pool.query(
        'SELECT team_role FROM team_members WHERE team_id = ? AND user_id = ?',
        [createdTeamId, adminUserId]
      );
      expect(prevLeader[0].team_role).toBe('member');
    });

    it('should prevent removing the designated team leader directly', async () => {
      const res = await request(app)
        .delete(`/api/teams/${createdTeamId}/members/${employeeUserId}`)
        .set('Cookie', [ownerCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CANNOT_REMOVE_TEAM_LEADER');
    });

    it('should remove a standard member from team', async () => {
      const res = await request(app)
        .delete(`/api/teams/${createdTeamId}/members/${adminUserId}`)
        .set('Cookie', [ownerCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should retrieve user team memberships via /api/users/:id/teams', async () => {
      const res = await request(app)
        .get(`/api/users/${employeeUserId}/teams`)
        .set('Cookie', [ownerCookie]);

      expect(res.status).toBe(200);
      expect(res.body.teams.length).toBeGreaterThanOrEqual(1);
      expect(res.body.teams[0].id).toBe(createdTeamId);
    });
  });

  // 5. Audit Logging for Phase 3
  describe('5. Audit Trail for Phase 3 Operations', () => {
    it('should have recorded audit events for user, invitation, and team operations', async () => {
      const res = await request(app)
        .get('/api/audit-logs?limit=30')
        .set('Cookie', [ownerCookie]);

      expect(res.status).toBe(200);
      const actions = res.body.logs.map((l) => l.action);
      expect(actions).toContain('user.created');
      expect(actions).toContain('invitation.created');
      expect(actions).toContain('invitation.accepted');
      expect(actions).toContain('team.created');
      expect(actions).toContain('team.leader_assigned');
    });
  });
});
