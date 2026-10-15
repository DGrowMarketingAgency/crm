import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';
import { seedRbac } from '../src/modules/rbac/rbac.seed.js';

describe('D-Grow OS Phase 1: Department Management & Workflow Preset Builder', () => {
  let csrfToken = '';
  let csrfCookie = '';

  let ownerCookie = '';
  let adminCookie = '';
  let managerCookie = '';
  let employeeCookie = '';

  let ownerId;
  let adminId;
  let managerId;
  let employeeId;

  let testDeptId;
  let testPresetId;
  let testDraftVersionId;
  let stage1Id;
  let stage2Id;
  let task1Id;
  let task2Id;

  beforeAll(async () => {
    // 1. Re-seed RBAC to ensure new permissions are mapped
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
      return userId;
    };

    ownerId = await setupUser('Phase1 Owner', 'p1_owner@dgrow.com', 'owner', 'owner');
    adminId = await setupUser('Phase1 Admin', 'p1_admin@dgrow.com', 'admin', 'admin');
    managerId = await setupUser('Phase1 Manager', 'p1_manager@dgrow.com', 'project-manager', 'member');
    employeeId = await setupUser('Phase1 Employee', 'p1_employee@dgrow.com', 'employee', 'member');

    // Login users to get session cookies
    const login = async (email) => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Cookie', [csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ email, password: testPassword });
      const setCookies = res.headers['set-cookie'];
      return setCookies ? setCookies.find((c) => c.startsWith('access_token=')) : '';
    };

    ownerCookie = await login('p1_owner@dgrow.com');
    adminCookie = await login('p1_admin@dgrow.com');
    managerCookie = await login('p1_manager@dgrow.com');
    employeeCookie = await login('p1_employee@dgrow.com');
  });

  afterAll(async () => {
    // Clean up test department and associated presets if any
    if (testDeptId) {
      await pool.query('DELETE FROM workflow_presets WHERE department_id = ?', [testDeptId]);
      await pool.query('DELETE FROM department_members WHERE department_id = ?', [testDeptId]);
      await pool.query('DELETE FROM departments WHERE id = ?', [testDeptId]);
    }
  });

  // ==========================================
  // DEPARTMENT MANAGEMENT TESTS
  // ==========================================

  describe('Department Management', () => {
    it('1. Lists existing initial seeded departments', async () => {
      const res = await request(app)
        .get('/api/departments')
        .set('Cookie', [employeeCookie, csrfCookie]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.departments)).toBe(true);
      expect(res.body.data.departments.length).toBeGreaterThanOrEqual(9);

      // Verify initial departments exist
      const deptNames = res.body.data.departments.map((d) => d.name);
      expect(deptNames).toContain('Management');
      expect(deptNames).toContain('SEO');
      expect(deptNames).toContain('Graphic Design');
      expect(deptNames).toContain('Web Development');
    });

    it('2. Prevents unauthorized employee from creating a department', async () => {
      const res = await request(app)
        .post('/api/departments')
        .set('Cookie', [employeeCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          name: 'Unauthorized Dept',
          code: 'UNAUTH_DEPT'
        });

      expect(res.status).toBe(403);
    });

    it('3. Allows admin to create a new department with assigned manager', async () => {
      const res = await request(app)
        .post('/api/departments')
        .set('Cookie', [adminCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          name: 'Quality Assurance Testing',
          code: 'QA_TESTING',
          description: 'Software QA, automated testing and manual audit pipelines.',
          manager_id: managerId
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Quality Assurance Testing');
      expect(res.body.data.code).toBe('QA_TESTING');
      expect(Number(res.body.data.manager_id)).toBe(managerId);

      testDeptId = res.body.data.id;
    });

    it('4. Prevents duplicate department name (case-insensitive normalization)', async () => {
      const res = await request(app)
        .post('/api/departments')
        .set('Cookie', [adminCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          name: '  quality assurance testing  ',
          code: 'QA_TESTING_2'
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_NAME');
    });

    it('5. Allows assigned department manager to update department details', async () => {
      const res = await request(app)
        .put(`/api/departments/${testDeptId}`)
        .set('Cookie', [managerCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          description: 'Updated QA Testing pipeline and performance benchmark descriptions.'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.description).toContain('Updated QA Testing pipeline');
    });

    it('6. Allows assigning existing employees to the department', async () => {
      const res = await request(app)
        .post(`/api/departments/${testDeptId}/members`)
        .set('Cookie', [managerCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          userId: employeeId,
          roleInDepartment: 'QA Automation Engineer',
          isPrimary: true
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify member is listed
      const membersRes = await request(app)
        .get(`/api/departments/${testDeptId}/members`)
        .set('Cookie', [employeeCookie, csrfCookie]);

      expect(membersRes.status).toBe(200);
      const userIds = membersRes.body.data.map((m) => Number(m.user_id));
      expect(userIds).toContain(employeeId);
    });
  });

  // ==========================================
  // WORKFLOW PRESET & STAGE BUILDER TESTS
  // ==========================================

  describe('Workflow Presets & Stage Builder', () => {
    it('7. Allows authorized user to create a workflow preset in draft status', async () => {
      const res = await request(app)
        .post('/api/workflow-presets')
        .set('Cookie', [adminCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          name: 'Automated Regression Suite',
          preset_code: 'WP_QA_AUTO_001',
          description: 'Comprehensive QA regression tests and smoke test runs.',
          department_id: testDeptId,
          service_category: 'Quality Assurance',
          workflow_type: 'standard'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('draft');
      expect(res.body.data.version).toBeDefined();
      expect(res.body.data.version.status).toBe('draft');
      expect(res.body.data.version.version_number).toBe(1);

      testPresetId = res.body.data.id;
      testDraftVersionId = res.body.data.version.id;
    });

    it('8. Adds stages to the draft workflow preset', async () => {
      // Add Stage 1 (Starting stage, display_order = 1)
      const stage1Res = await request(app)
        .post(`/api/workflow-presets/${testPresetId}/versions/${testDraftVersionId}/stages`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          name: 'Test Planning & Scope',
          stage_key: 'test-planning',
          display_order: 1,
          stage_category: 'planning',
          allowed_next_stages: ['test-execution'],
          is_client_facing: false,
          is_review_required: true,
          reviewer_policy: { role: 'manager' }
        });

      expect(stage1Res.status).toBe(201);
      stage1Id = stage1Res.body.data.id;

      // Add Stage 2
      const stage2Res = await request(app)
        .post(`/api/workflow-presets/${testPresetId}/versions/${testDraftVersionId}/stages`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          name: 'Test Execution & Bug Triage',
          stage_key: 'test-execution',
          display_order: 2,
          stage_category: 'execution',
          allowed_next_stages: [],
          is_client_facing: true,
          requires_deliverable: true,
          completion_conditions: { deliverable_submitted: true }
        });

      expect(stage2Res.status).toBe(201);
      stage2Id = stage2Res.body.data.id;
    });

    it('9. Adds task templates to stages in draft version', async () => {
      // Task 1 in Stage 1
      const task1Res = await request(app)
        .post(`/api/workflow-presets/${testPresetId}/versions/${testDraftVersionId}/tasks`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          stage_id: stage1Id,
          task_key: 'qa-test-plan',
          title: 'Draft Test Plan and Test Scenarios',
          estimated_duration_hours: 4,
          relative_deadline_days: 2,
          priority: 'high',
          requires_internal_review: true
        });

      expect(task1Res.status).toBe(201);
      task1Id = task1Res.body.data.id;

      // Task 2 in Stage 2
      const task2Res = await request(app)
        .post(`/api/workflow-presets/${testPresetId}/versions/${testDraftVersionId}/tasks`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          stage_id: stage2Id,
          task_key: 'qa-run-suite',
          title: 'Execute Automated Regression Test Suite',
          estimated_duration_hours: 8,
          relative_deadline_days: 3,
          priority: 'urgent',
          requires_client_approval: true
        });

      expect(task2Res.status).toBe(201);
      task2Id = task2Res.body.data.id;
    });

    it('10. Establishes task dependency (Task 2 depends on Task 1)', async () => {
      const depRes = await request(app)
        .post(`/api/workflow-presets/${testPresetId}/versions/${testDraftVersionId}/tasks/${task2Id}/dependencies`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          dependsOnTaskId: task1Id,
          dependencyType: 'finish_to_start'
        });

      expect(depRes.status).toBe(201);
      expect(depRes.body.success).toBe(true);
    });

    it('11. Detects and prevents circular task dependencies', async () => {
      // Task 1 cannot depend on Task 2 because Task 2 already depends on Task 1
      const circularRes = await request(app)
        .post(`/api/workflow-presets/${testPresetId}/versions/${testDraftVersionId}/tasks/${task1Id}/dependencies`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          dependsOnTaskId: task2Id,
          dependencyType: 'finish_to_start'
        });

      expect(circularRes.status).toBe(400);
      expect(circularRes.body.error.code).toBe('CIRCULAR_DEPENDENCY');
    });

    it('12. Validates workflow preset successfully when rules are satisfied', async () => {
      const valRes = await request(app)
        .post(`/api/workflow-presets/${testPresetId}/versions/${testDraftVersionId}/validate`)
        .set('Cookie', [adminCookie, csrfCookie]);

      expect(valRes.status).toBe(200);
      expect(valRes.body.success).toBe(true);
      expect(valRes.body.data.valid).toBe(true);
      expect(valRes.body.data.errors).toHaveLength(0);
    });
  });

  // ==========================================
  // LIFECYCLE & IMMUTABILITY TESTS
  // ==========================================

  describe('Workflow Lifecycle & Version Immutability', () => {
    it('13. Prevents unauthorized employee from publishing a preset', async () => {
      const pubRes = await request(app)
        .post(`/api/workflow-presets/${testPresetId}/versions/${testDraftVersionId}/publish`)
        .set('Cookie', [employeeCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken);

      expect(pubRes.status).toBe(403);
    });

    it('14. Allows admin to publish preset and makes version immutable', async () => {
      const countTasksBefore = await pool.query('SELECT COUNT(*) as cnt FROM tasks');
      const initialTaskCount = Number(countTasksBefore[0][0].cnt);

      const pubRes = await request(app)
        .post(`/api/workflow-presets/${testPresetId}/versions/${testDraftVersionId}/publish`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken);

      expect(pubRes.status).toBe(200);
      expect(pubRes.body.success).toBe(true);
      expect(pubRes.body.data.status).toBe('published');
      expect(pubRes.body.data.version.status).toBe('published');

      // CRITICAL CRITERIA: Ensure publishing preset does NOT accidentally create tasks in tasks table!
      const countTasksAfter = await pool.query('SELECT COUNT(*) as cnt FROM tasks');
      const finalTaskCount = Number(countTasksAfter[0][0].cnt);
      expect(finalTaskCount).toBe(initialTaskCount);
    });

    it('15. Prevents direct mutation of a published workflow version', async () => {
      const res = await request(app)
        .post(`/api/workflow-presets/${testPresetId}/versions/${testDraftVersionId}/stages`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          name: 'Illegal Mutation Stage'
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VERSION_IMMUTABLE');
    });

    it('16. Clones published version into new Draft Version v2 for editing', async () => {
      const draftRes = await request(app)
        .post(`/api/workflow-presets/${testPresetId}/create-draft`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken);

      expect(draftRes.status).toBe(201);
      expect(draftRes.body.success).toBe(true);
      expect(draftRes.body.data.version.version_number).toBe(2);
      expect(draftRes.body.data.version.status).toBe('draft');

      // Verify stages were cloned
      expect(draftRes.body.data.stages).toHaveLength(2);
      const v2Stage1 = draftRes.body.data.stages[0];
      expect(v2Stage1.id).not.toBe(stage1Id);
      expect(v2Stage1.tasks).toHaveLength(1);
    });

    it('17. Prevents deletion of department referenced by active workflow presets', async () => {
      const delRes = await request(app)
        .delete(`/api/departments/${testDeptId}`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken);

      expect(delRes.status).toBe(400);
      expect(delRes.body.error.code).toBe('DEPARTMENT_IN_USE');
    });

    it('18. Allows archiving department safely', async () => {
      const archRes = await request(app)
        .delete(`/api/departments/${testDeptId}?archive=true`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken);

      expect(archRes.status).toBe(200);
      expect(archRes.body.action).toBe('archived');

      // Verify department status in database
      const [dRows] = await pool.query('SELECT status FROM departments WHERE id = ?', [testDeptId]);
      expect(dRows[0].status).toBe('archived');
    });
  });
});
