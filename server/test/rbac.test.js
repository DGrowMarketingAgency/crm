import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';
import { seedRbac } from '../src/modules/rbac/rbac.seed.js';

describe('Phase 2: RBAC, Custom Roles & Granular Permissions Suite', () => {
  let csrfToken = '';
  let csrfCookie = '';

  let ownerCookie = '';
  let employeeCookie = '';
  let adminCookie = '';

  let ownerUserId;
  let employeeUserId;
  let adminUserId;

  let createdCustomRoleId;

  beforeAll(async () => {
    // 1. Seed RBAC
    await seedRbac();

    // 2. Obtain CSRF cookie & token
    const csrfRes = await request(app).get('/api/auth/csrf-token');
    csrfToken = csrfRes.body.csrfToken;
    const cookies = csrfRes.headers['set-cookie'];
    csrfCookie = cookies.find((c) => c.startsWith('xsrf_token='));

    const testPassword = 'Password123!';
    const passwordHash = await bcrypt.hash(testPassword, 10);

    // 3. Create or update test Owner
    const [ownerRes] = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ('Owner Test', 'owner_test@agency.com', ?, 'owner', 'active')
       ON DUPLICATE KEY UPDATE password_hash = ?, status = 'active'`,
      [passwordHash, passwordHash]
    );
    const [ownerRows] = await pool.query("SELECT id FROM users WHERE email = 'owner_test@agency.com'");
    ownerUserId = ownerRows[0].id;

    // Assign owner role
    const [ownerRole] = await pool.query("SELECT id FROM roles WHERE slug = 'owner'");
    await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [ownerUserId, ownerRole[0].id]);

    // 4. Create Employee (has minimal permissions)
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ('Employee Test', 'employee_test@agency.com', ?, 'member', 'active')
       ON DUPLICATE KEY UPDATE password_hash = ?, status = 'active'`,
      [passwordHash, passwordHash]
    );
    const [empRows] = await pool.query("SELECT id FROM users WHERE email = 'employee_test@agency.com'");
    employeeUserId = empRows[0].id;
    const [empRole] = await pool.query("SELECT id FROM roles WHERE slug = 'employee'");
    await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [employeeUserId, empRole[0].id]);

    // 5. Create Admin (has roles.view, roles.create, roles.update, but is NOT Owner)
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ('Admin Test', 'admin_test@agency.com', ?, 'member', 'active')
       ON DUPLICATE KEY UPDATE password_hash = ?, status = 'active'`,
      [passwordHash, passwordHash]
    );
    const [adminRows] = await pool.query("SELECT id FROM users WHERE email = 'admin_test@agency.com'");
    adminUserId = adminRows[0].id;
    const [adminRole] = await pool.query("SELECT id FROM roles WHERE slug = 'admin'");
    await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [adminUserId, adminRole[0].id]);

    // 6. Login as Owner to get auth cookies
    const loginOwner = await request(app)
      .post('/api/auth/login')
      .set('Cookie', [csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ email: 'owner_test@agency.com', password: testPassword });
    ownerCookie = loginOwner.headers['set-cookie'].find((c) => c.startsWith('access_token='));

    // 7. Login as Employee
    const loginEmp = await request(app)
      .post('/api/auth/login')
      .set('Cookie', [csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ email: 'employee_test@agency.com', password: testPassword });
    employeeCookie = loginEmp.headers['set-cookie'].find((c) => c.startsWith('access_token='));

    // 8. Login as Admin
    const loginAdmin = await request(app)
      .post('/api/auth/login')
      .set('Cookie', [csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ email: 'admin_test@agency.com', password: testPassword });
    adminCookie = loginAdmin.headers['set-cookie'].find((c) => c.startsWith('access_token='));
  });

  afterAll(async () => {
    // Clean up created test data
    if (createdCustomRoleId) {
      await pool.query('DELETE FROM roles WHERE id = ?', [createdCustomRoleId]);
    }
    await pool.query("DELETE FROM users WHERE email IN ('owner_test@agency.com', 'employee_test@agency.com', 'admin_test@agency.com')");
  });

  // 1. Unauthenticated and Unauthorized checks
  describe('1. Endpoint Authorization Guards', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/roles');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject authenticated user without required permission with 403', async () => {
      // Employee does not have 'roles.view'
      const res = await request(app)
        .get('/api/roles')
        .set('Cookie', [employeeCookie]);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.requiredPermission).toBe('roles.view');
    });

    it('should allow user with required permission (or Owner) with 200', async () => {
      const res = await request(app)
        .get('/api/roles')
        .set('Cookie', [ownerCookie]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.roles)).toBe(true);
      expect(res.body.roles.length).toBeGreaterThanOrEqual(6);
    });
  });

  // 2. Permission Registry Endpoints
  describe('2. Permission Registry & Me Permissions', () => {
    it('should return all permissions for authorized user', async () => {
      const res = await request(app)
        .get('/api/permissions')
        .set('Cookie', [ownerCookie]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.permissions.length).toBeGreaterThanOrEqual(14);
      expect(res.body.permissions.some((p) => p.permission_key === 'users.view')).toBe(true);
    });

    it('should return grouped permissions by module', async () => {
      const res = await request(app)
        .get('/api/permissions/grouped')
        .set('Cookie', [ownerCookie]);

      expect(res.status).toBe(200);
      expect(res.body.modules).toBeDefined();
      expect(res.body.modules.Users).toBeDefined();
      expect(res.body.modules.Roles).toBeDefined();
    });

    it('should return current user effective permissions and roles via /api/auth/me/permissions', async () => {
      const res = await request(app)
        .get('/api/auth/me/permissions')
        .set('Cookie', [ownerCookie]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.isOwner).toBe(true);
      expect(res.body.permissions).toContain('roles.create');
      expect(res.body.permissions).toContain('users.delete');
      // Passwords and hashes must never be exposed
      expect(res.body.user.password_hash).toBeUndefined();
    });
  });

  // 3. Custom Role CRUD Lifecycle & Name Policies
  describe('3. Custom Role CRUD & Validation', () => {
    it('should create a custom role with valid name and slug', async () => {
      const res = await request(app)
        .post('/api/roles')
        .set('Cookie', [ownerCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          name: 'Marketing Specialist',
          slug: 'marketing-specialist',
          description: 'Handles campaigns and client deliverables'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.role.name).toBe('Marketing Specialist');
      expect(res.body.role.is_system).toBe(false);
      createdCustomRoleId = res.body.role.id;
    });

    it('should reject duplicate role name (case-insensitive policy)', async () => {
      const res = await request(app)
        .post('/api/roles')
        .set('Cookie', [ownerCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          name: 'marketing specialist',
          slug: 'marketing-specialist-2'
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ROLE_NAME_EXISTS');
    });

    it('should update permitted fields of a custom role', async () => {
      const res = await request(app)
        .put(`/api/roles/${createdCustomRoleId}`)
        .set('Cookie', [ownerCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          name: 'Senior Marketing Specialist',
          description: 'Updated description for senior level'
        });

      expect(res.status).toBe(200);
      expect(res.body.role.name).toBe('Senior Marketing Specialist');
      expect(res.body.role.description).toBe('Updated description for senior level');
    });

    it('should refuse to delete system roles with 403', async () => {
      const [adminRole] = await pool.query("SELECT id FROM roles WHERE slug = 'admin'");
      const res = await request(app)
        .delete(`/api/roles/${adminRole[0].id}`)
        .set('Cookie', [ownerCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CANNOT_DELETE_SYSTEM_ROLE');
    });
  });

  // 4. Role Permissions Assignment
  describe('4. Role Permissions Assignment & Transactional Integrity', () => {
    it('should assign a set of valid permissions to custom role', async () => {
      const [perms] = await pool.query("SELECT id FROM permissions WHERE permission_key IN ('users.view', 'settings.view')");
      const permIds = perms.map((p) => p.id);

      const res = await request(app)
        .put(`/api/roles/${createdCustomRoleId}/permissions`)
        .set('Cookie', [ownerCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ permissionIds: permIds });

      expect(res.status).toBe(200);
      expect(res.body.assignedCount).toBe(2);

      // Verify via GET
      const getRes = await request(app)
        .get(`/api/roles/${createdCustomRoleId}/permissions`)
        .set('Cookie', [ownerCookie]);

      expect(getRes.status).toBe(200);
      expect(getRes.body.permissions.length).toBe(2);
    });

    it('should reject invalid permission IDs with 400', async () => {
      const res = await request(app)
        .put(`/api/roles/${createdCustomRoleId}/permissions`)
        .set('Cookie', [ownerCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ permissionIds: [999999] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_PERMISSIONS');
    });

    it('should reject modification of Owner role permissions with 403', async () => {
      const [ownerRole] = await pool.query("SELECT id FROM roles WHERE slug = 'owner'");
      const res = await request(app)
        .put(`/api/roles/${ownerRole[0].id}/permissions`)
        .set('Cookie', [ownerCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ permissionIds: [] });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('OWNER_PERMISSIONS_IMMUTABLE');
    });
  });

  // 5. User Role Assignments & Owner Safeguards
  describe('5. User Role Assignments & Privilege Escalation Protection', () => {
    it('should assign custom role to user', async () => {
      const res = await request(app)
        .put(`/api/users/${employeeUserId}/roles`)
        .set('Cookie', [ownerCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ roleIds: [createdCustomRoleId] });

      expect(res.status).toBe(200);
      expect(res.body.roles.some((r) => r.id === createdCustomRoleId)).toBe(true);
    });

    it('should prevent non-owner admin from granting Owner role (Privilege Escalation)', async () => {
      const [ownerRole] = await pool.query("SELECT id FROM roles WHERE slug = 'owner'");

      // Admin attempts to grant Owner role to employee
      const res = await request(app)
        .put(`/api/users/${employeeUserId}/roles`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ roleIds: [ownerRole[0].id] });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('OWNER_ESCALATION_DENIED');
    });

    it('should prevent removal of the last active Owner', async () => {
      // Ensure only 1 active owner exists for this test condition
      const [empRole] = await pool.query("SELECT id FROM roles WHERE slug = 'employee'");

      // Owner attempts to demote himself when there are no other active owners
      // (let's check count; if ownerUserId is the only one, it should reject)
      const [owners] = await pool.query(
        `SELECT COUNT(DISTINCT ur.user_id) as count
         FROM user_roles ur JOIN roles r ON ur.role_id = r.id JOIN users u ON ur.user_id = u.id
         WHERE r.slug = 'owner' AND u.status = 'active'`
      );

      if (owners[0].count === 1) {
        const res = await request(app)
          .put(`/api/users/${ownerUserId}/roles`)
          .set('Cookie', [ownerCookie, csrfCookie])
          .set('X-CSRF-Token', csrfToken)
          .send({ roleIds: [empRole[0].id] });

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('CANNOT_REMOVE_LAST_OWNER');
      }
    });

    it('should reject deleting a custom role while assigned to a user', async () => {
      const res = await request(app)
        .delete(`/api/roles/${createdCustomRoleId}`)
        .set('Cookie', [ownerCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ROLE_IN_USE');
    });
  });

  // 6. Audit Logging Verification
  describe('6. Security Audit Logging', () => {
    it('should create audit records for role operations and assignments', async () => {
      const res = await request(app)
        .get('/api/audit-logs?limit=50')
        .set('Cookie', [ownerCookie]);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.logs)).toBe(true);
      expect(res.body.logs.length).toBeGreaterThan(0);

      const actions = res.body.logs.map((l) => l.action);
      expect(actions).toContain('role.created');
      expect(actions).toContain('role.permissions_updated');
      expect(actions).toContain('user.roles_updated');
    });
  });
});
