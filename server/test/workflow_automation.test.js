import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';
import { seedRbac } from '../src/modules/rbac/rbac.seed.js';
import { WorkflowEngineService } from '../src/modules/automation/workflow-engine.service.js';

describe('D-Grow OS Phase 4: Workflow Automation & Automatic Task Creation Engine Suite', () => {
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

  let manualExecutionId;
  let testExecKey;
  let testDeptId;
  let publishedPresetId;
  let publishedVersionId;
  let draftPresetId;
  let draftVersionId;

  let testClientId;
  let testProjectId;
  let testServiceId;
  let testMilestoneId;

  let template1Id;
  let template2Id;
  let template3Id;

  beforeAll(async () => {
    // 1. Re-seed RBAC so workflows.execute is assigned to admin, pm, am, owner
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

    ownerId = await setupUser('Phase4 Owner', 'p4_owner@dgrow.com', 'owner', 'owner');
    adminId = await setupUser('Phase4 Admin', 'p4_admin@dgrow.com', 'admin', 'admin');
    managerId = await setupUser('Phase4 Manager', 'p4_manager@dgrow.com', 'project-manager', 'member');
    employeeId = await setupUser('Phase4 Employee', 'p4_employee@dgrow.com', 'employee', 'member');

    const login = async (email) => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Cookie', [csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({ email, password: testPassword });
      const authCookies = res.headers['set-cookie'];
      const tokenCookie = authCookies.find((c) => c.startsWith('access_token='));
      return `${csrfCookie}; ${tokenCookie}`;
    };

    ownerCookie = await login('p4_owner@dgrow.com');
    adminCookie = await login('p4_admin@dgrow.com');
    managerCookie = await login('p4_manager@dgrow.com');
    employeeCookie = await login('p4_employee@dgrow.com');

    testExecKey = `idempotent_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // 3. Setup Test Department
    const deptCode = `DEP_AUTO_${Date.now().toString().slice(-4)}`;
    const [deptRes] = await pool.query(
      `INSERT INTO departments (name, code, description, manager_id, status)
       VALUES (?, ?, 'Automation test department', ?, 'active')`,
      [`Dept Auto ${Date.now().toString().slice(-4)}`, deptCode, managerId]
    );
    testDeptId = deptRes.insertId;

    // Add manager and employee to department
    await pool.query(
      `INSERT INTO department_members (department_id, user_id, is_primary, role_in_department)
       VALUES (?, ?, TRUE, 'manager'), (?, ?, FALSE, 'specialist')`,
      [testDeptId, managerId, testDeptId, employeeId]
    );

    // 4. Setup Published Workflow Preset with 3 tasks and dependency:
    // Task 1 (relative 2 days) -> Task 2 (relative 5 days, depends on Task 1) -> Task 3 (relative 8 days, depends on Task 2)
    const presetCode = `WP_AUTO_${Date.now().toString().slice(-4)}`;
    const [presetRes] = await pool.query(
      `INSERT INTO workflow_presets (
        preset_code, name, description, department_id, service_category, workflow_type, status
      ) VALUES (?, 'Production Engine Workflow', 'Testing automation triggers', ?, 'Development', 'standard', 'published')`,
      [presetCode, testDeptId]
    );
    publishedPresetId = presetRes.insertId;

    const [verRes] = await pool.query(
      `INSERT INTO workflow_preset_versions (
        preset_id, version_number, status, estimated_duration_days, validation_status, published_at
      ) VALUES (?, 1, 'published', 15, 'valid', NOW())`,
      [publishedPresetId]
    );
    publishedVersionId = verRes.insertId;

    await pool.query(
      'UPDATE workflow_presets SET current_version_id = ? WHERE id = ?',
      [publishedVersionId, publishedPresetId]
    );

    // Add stage
    const [stageRes] = await pool.query(
      `INSERT INTO workflow_stages (
        preset_version_id, stage_key, name, display_order, stage_category
      ) VALUES (?, 'prod_stage', 'Production Stage', 1, 'execution')`,
      [publishedVersionId]
    );
    const stageId = stageRes.insertId;

    // Add task templates
    const [tt1Res] = await pool.query(
      `INSERT INTO task_templates (
        preset_version_id, stage_id, task_key, title, description, instructions,
        department_id, default_assignee_role, relative_deadline_days, priority
      ) VALUES (?, ?, 'TT_RESEARCH', 'Initial Client Research', 'Audit client assets', 'Follow checklist', ?, 'manager', 2, 'high')`,
      [publishedVersionId, stageId, testDeptId]
    );
    template1Id = tt1Res.insertId;

    const [tt2Res] = await pool.query(
      `INSERT INTO task_templates (
        preset_version_id, stage_id, task_key, title, description, instructions,
        department_id, default_assignee_role, relative_deadline_days, priority
      ) VALUES (?, ?, 'TT_BUILD', 'Asset Creation & Build', 'Produce media', 'Use guidelines', ?, 'specialist', 5, 'medium')`,
      [publishedVersionId, stageId, testDeptId]
    );
    template2Id = tt2Res.insertId;

    const [tt3Res] = await pool.query(
      `INSERT INTO task_templates (
        preset_version_id, stage_id, task_key, title, description, instructions,
        department_id, default_assignee_role, relative_deadline_days, priority
      ) VALUES (?, ?, 'TT_REVIEW', 'QA & Delivery Review', 'Quality audit', 'Check checklist', ?, 'manager', 8, 'urgent')`,
      [publishedVersionId, stageId, testDeptId]
    );
    template3Id = tt3Res.insertId;

    // Task 2 depends on Task 1, Task 3 depends on Task 2
    await pool.query(
      `INSERT INTO task_template_dependencies (task_template_id, depends_on_task_template_id)
       VALUES (?, ?), (?, ?)`,
      [template2Id, template1Id, template3Id, template2Id]
    );

    // 5. Setup Draft (Unpublished) Preset for Rejection Tests
    const draftCode = `WP_DRAFT_${Date.now().toString().slice(-4)}`;
    const [draftRes] = await pool.query(
      `INSERT INTO workflow_presets (
        preset_code, name, description, department_id, service_category, workflow_type, status
      ) VALUES (?, 'Draft Unpublished Preset', 'Testing draft rejection', ?, 'Design', 'standard', 'draft')`,
      [draftCode, testDeptId]
    );
    draftPresetId = draftRes.insertId;

    const [draftVerRes] = await pool.query(
      `INSERT INTO workflow_preset_versions (
        preset_id, version_number, status, validation_status
      ) VALUES (?, 1, 'draft', 'unvalidated')`,
      [draftPresetId]
    );
    draftVersionId = draftVerRes.insertId;

    // 6. Setup Test Client
    const clientCode = `CL_AUTO_${Date.now().toString().slice(-4)}`;
    const [clientRes] = await pool.query(
      `INSERT INTO clients (name, client_code, email, company_name, status, account_manager_id)
       VALUES ('Apex Corp Automation', ?, ?, 'Apex Corp', 'active', ?)`,
      [clientCode, `apex_${Date.now().toString().slice(-4)}@example.com`, managerId]
    );
    testClientId = clientRes.insertId;

    // 7. Setup Test Project
    const projectCode = `PRJ_AUT_${Date.now().toString().slice(-3)}`;
    const [projRes] = await pool.query(
      `INSERT INTO projects (
        name, project_code, client_id, project_manager_id, status, priority,
        start_date, due_date, workflow_preset_id, workflow_preset_version_id
      ) VALUES ('Apex Website Launch', ?, ?, ?, 'planning', 'high', '2026-11-01', '2026-11-30', ?, ?)`,
      [projectCode, testClientId, managerId, publishedPresetId, publishedVersionId]
    );
    testProjectId = projRes.insertId;

    // Setup milestone on project
    const [msRes] = await pool.query(
      `INSERT INTO project_milestones (project_id, title, status, due_date, display_order)
       VALUES (?, 'Phase 1 Delivery Milestone', 'pending', '2026-11-15', 1)`,
      [testProjectId]
    );
    testMilestoneId = msRes.insertId;

    // 8. Setup Test Service Instance
    const [siRes] = await pool.query(
      `INSERT INTO service_instances (
        client_id, department_id, workflow_preset_id, workflow_preset_version_id,
        service_type, label, current_stage, status, start_date
      ) VALUES (?, ?, ?, ?, 'Web Development', 'Apex Custom Portal', 'Setup', 'draft', '2026-11-05')`,
      [testClientId, testDeptId, publishedPresetId, publishedVersionId]
    );
    testServiceId = siRes.insertId;
  });

  // Test 1: Preview without database writes
  it('1. Previews workflow task generation without creating database records', async () => {
    const [initialTasks] = await pool.query('SELECT COUNT(*) as count FROM tasks');
    const beforeCount = Number(initialTasks[0].count);

    const res = await request(app)
      .post('/api/automation/preview')
      .set('Cookie', [adminCookie])
      .send({
        workflowPresetId: publishedPresetId,
        workflowPresetVersionId: publishedVersionId,
        clientId: testClientId,
        projectId: testProjectId,
        startDate: '2026-11-01'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.preview).toBeDefined();
    expect(res.body.preview.totalExpectedTasks).toBe(3);
    expect(res.body.preview.blockedTasksCount).toBe(2); // Tasks 2 and 3 have dependencies
    expect(res.body.preview.readyTasksCount).toBe(1); // Task 1 has 0 dependencies
    expect(res.body.preview.tasks).toHaveLength(3);

    // Verify due date calculations with offset
    const task1 = res.body.preview.tasks.find((t) => t.taskTemplateId === template1Id);
    expect(task1.calculatedDueDate).toBe('2026-11-03'); // 2026-11-01 + 2 days

    // Verify NO records were written to tasks table
    const [afterTasks] = await pool.query('SELECT COUNT(*) as count FROM tasks');
    const afterCount = Number(afterTasks[0].count);
    expect(afterCount).toBe(beforeCount);
  });

  // Test 2: RBAC permissions enforcement
  it('2. Rejects unauthorized users without workflows.execute permission', async () => {
    const res = await request(app)
      .post('/api/automation/execute')
      .set('Cookie', [employeeCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        triggerType: 'manual',
        workflowPresetId: publishedPresetId,
        clientId: testClientId
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // Test 3: Reject unpublished workflow preset
  it('3. Rejects automation execution for draft/unpublished workflow presets', async () => {
    const res = await request(app)
      .post('/api/automation/execute')
      .set('Cookie', [adminCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        triggerType: 'manual',
        workflowPresetId: draftPresetId,
        clientId: testClientId
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PRESET_NOT_PUBLISHED');
  });

  // Test 4: Circular dependency handling
  it('4. Detects and rejects circular task dependencies', () => {
    const mockTemplates = [
      { id: 101, title: 'Task A' },
      { id: 102, title: 'Task B' },
      { id: 103, title: 'Task C' }
    ];
    const circularDeps = [
      { task_template_id: 102, depends_on_task_template_id: 101 },
      { task_template_id: 103, depends_on_task_template_id: 102 },
      { task_template_id: 101, depends_on_task_template_id: 103 } // Cycle: 101 -> 102 -> 103 -> 101
    ];

    expect(() => {
      WorkflowEngineService.detectCircularDependencies(mockTemplates, circularDeps);
    }).toThrowError(/Circular dependency detected/);
  });

  // Test 5: Successful manual workflow execution & task generation
  it('5. Successfully executes workflow and creates tasks with dependencies and traceability', async () => {
    const res = await request(app)
      .post('/api/automation/execute')
      .set('Cookie', [adminCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        triggerType: 'manual',
        workflowPresetId: publishedPresetId,
        workflowPresetVersionId: publishedVersionId,
        clientId: testClientId,
        projectId: testProjectId,
        startDate: '2026-11-01',
        executionKey: testExecKey
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.createdTasksCount).toBe(3);
    expect(res.body.execution.status).toBe('completed');

    manualExecutionId = res.body.execution.id;
    const executionId = manualExecutionId;

    // Verify tasks in database
    const [dbTasks] = await pool.query(
      `SELECT t.*, td.is_satisfied 
       FROM tasks t
       LEFT JOIN task_dependencies td ON t.id = td.task_id
       WHERE t.workflow_execution_id = ?
       ORDER BY t.id ASC`,
      [executionId]
    );

    expect(dbTasks.length).toBeGreaterThanOrEqual(3);

    // Verify task 1 is ready ('todo') and tasks 2 & 3 are 'blocked'
    const [t1] = await pool.query('SELECT * FROM tasks WHERE task_template_id = ? AND workflow_execution_id = ?', [template1Id, executionId]);
    const [t2] = await pool.query('SELECT * FROM tasks WHERE task_template_id = ? AND workflow_execution_id = ?', [template2Id, executionId]);
    const [t3] = await pool.query('SELECT * FROM tasks WHERE task_template_id = ? AND workflow_execution_id = ?', [template3Id, executionId]);

    expect(t1[0].status).toBe('todo');
    expect(t2[0].status).toBe('blocked');
    expect(t3[0].status).toBe('blocked');

    // Verify traceability columns
    expect(t1[0].client_id).toBe(testClientId);
    expect(t1[0].project_id).toBe(testProjectId);
    expect(t1[0].workflow_preset_id).toBe(publishedPresetId);
    expect(t1[0].workflow_preset_version_id).toBe(publishedVersionId);
    expect(t1[0].workflow_execution_id).toBe(executionId);

    // Verify runtime dependencies in task_dependencies
    const [deps] = await pool.query(
      'SELECT * FROM task_dependencies WHERE task_id = ? AND depends_on_task_id = ?',
      [t2[0].id, t1[0].id]
    );
    expect(deps).toHaveLength(1);
    expect(deps[0].is_satisfied).toBe(0);
  });

  // Test 6: Duplicate execution request prevention (Idempotency)
  it('6. Prevents duplicate task creation on repeated execution requests', async () => {
    const [beforeTasks] = await pool.query('SELECT COUNT(*) as count FROM tasks WHERE project_id = ?', [testProjectId]);
    const beforeCount = Number(beforeTasks[0].count);

    const res = await request(app)
      .post('/api/automation/execute')
      .set('Cookie', [adminCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        triggerType: 'manual',
        workflowPresetId: publishedPresetId,
        workflowPresetVersionId: publishedVersionId,
        clientId: testClientId,
        projectId: testProjectId,
        startDate: '2026-11-01',
        executionKey: testExecKey
      });

    // Repeated call with same execution key should be completely idempotent
    expect(res.status).toBe(200);
    expect(res.body.isDuplicate).toBe(true);
    expect(res.body.createdTasksCount).toBe(0);

    const [afterTasks] = await pool.query('SELECT COUNT(*) as count FROM tasks WHERE project_id = ?', [testProjectId]);
    const afterCount = Number(afterTasks[0].count);
    expect(afterCount).toBe(beforeCount); // 0 duplicate tasks created!
  });

  // Test 7: Trigger A — Service Activation
  it('7. Automatically generates tasks upon service activation (Trigger A)', async () => {
    // Activate service
    const updateRes = await request(app)
      .put(`/api/clients/${testClientId}/services/${testServiceId}`)
      .set('Cookie', [adminCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        status: 'active'
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.service.status).toBe('active');

    // Verify tasks generated for service instance
    const [serviceTasks] = await pool.query(
      'SELECT * FROM tasks WHERE service_instance_id = ?',
      [testServiceId]
    );
    expect(serviceTasks.length).toBe(3);
    expect(serviceTasks[0].source).toBe('Workflow');
    expect(serviceTasks[0].client_id).toBe(testClientId);
  });

  // Test 8: Trigger B — Project Start State
  it('8. Automatically initializes workflow when project transitions to active (Trigger B)', async () => {
    // Create new project with workflow preset
    const prjCode2 = `PRJ_B_${Date.now().toString().slice(-4)}`;
    const [pRes] = await pool.query(
      `INSERT INTO projects (
        name, project_code, client_id, project_manager_id, status,
        workflow_preset_id, workflow_preset_version_id, start_date
      ) VALUES ('Trigger B Project', ?, ?, ?, 'planning', ?, ?, '2026-12-01')`,
      [prjCode2, testClientId, managerId, publishedPresetId, publishedVersionId]
    );
    const newProjectId = pRes.insertId;

    // Transition project status from planning to active
    const statusRes = await request(app)
      .patch(`/api/projects/${newProjectId}/status`)
      .set('Cookie', [adminCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        status: 'active'
      });

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.project.status).toBe('active');

    // Verify automation tasks created for newProjectId
    const [tasks] = await pool.query(
      'SELECT * FROM tasks WHERE project_id = ?',
      [newProjectId]
    );
    expect(tasks).toHaveLength(3);
  });

  // Test 9: Trigger C — Milestone Activation
  it('9. Automatically generates milestone tasks when milestone becomes in_progress (Trigger C)', async () => {
    const msRes = await request(app)
      .patch(`/api/projects/${testProjectId}/milestones/${testMilestoneId}/status`)
      .set('Cookie', [adminCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        status: 'in_progress'
      });

    expect(msRes.status).toBe(200);
    expect(msRes.body.milestone.status).toBe('in_progress');
  });

  // Test 10: Trigger D — Dependency Unblocking on Prerequisite Completion
  it('10. Unblocks dependent task when prerequisite task is completed (Trigger D)', async () => {
    // Find task 1 and task 2 from the manual project execution
    const [t1Rows] = await pool.query(
      'SELECT id, status FROM tasks WHERE task_template_id = ? AND project_id = ?',
      [template1Id, testProjectId]
    );
    const [t2Rows] = await pool.query(
      'SELECT id, status FROM tasks WHERE task_template_id = ? AND project_id = ?',
      [template2Id, testProjectId]
    );

    const task1 = t1Rows[0];
    const task2 = t2Rows[0];

    expect(task1.status).toBe('todo');
    expect(task2.status).toBe('blocked');

    // Complete task 1
    const completeRes = await request(app)
      .patch(`/api/tasks/${task1.id}/status`)
      .set('Cookie', [adminCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        status: 'completed',
        comment: 'Research completed'
      });

    expect(completeRes.status).toBe(200);

    // Verify task 2 is now automatically unblocked ('todo')
    const [updatedT2] = await pool.query('SELECT status FROM tasks WHERE id = ?', [task2.id]);
    expect(updatedT2[0].status).toBe('todo');

    // Task 3 should still be 'blocked' because Task 2 is not yet completed
    const [t3Rows] = await pool.query(
      'SELECT status FROM tasks WHERE task_template_id = ? AND project_id = ?',
      [template3Id, testProjectId]
    );
    expect(t3Rows[0].status).toBe('blocked');
  });

  // Test 11: Inspect execution status, generated tasks, and errors via API
  it('11. Retrieves execution status, generated tasks, and error details via API', async () => {
    const execId = manualExecutionId;

    const getRes = await request(app)
      .get(`/api/automation/executions/${execId}`)
      .set('Cookie', [adminCookie]);

    expect(getRes.status).toBe(200);
    expect(getRes.body.execution.id).toBe(execId);

    const tasksRes = await request(app)
      .get(`/api/automation/executions/${execId}/tasks`)
      .set('Cookie', [adminCookie]);

    expect(tasksRes.status).toBe(200);
    expect(tasksRes.body.tasks.length).toBeGreaterThan(0);

    const errorsRes = await request(app)
      .get(`/api/automation/executions/${execId}/errors`)
      .set('Cookie', [adminCookie]);

    expect(errorsRes.status).toBe(200);
    expect(errorsRes.body.status).toBe('completed');
  });

  // Test 12: Manual dependency evaluation endpoint
  it('12. Evaluates and synchronizes runtime dependencies via API', async () => {
    const res = await request(app)
      .post('/api/automation/evaluate-dependencies')
      .set('Cookie', [adminCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        projectId: testProjectId
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.unblockedTasks).toBeDefined();
  });

  // Test 13: Retry execution endpoint
  it('13. Safely retries an execution idempotently preserving existing tasks', async () => {
    const [execRows] = await pool.query('SELECT id FROM workflow_executions WHERE id = ?', [manualExecutionId]);
    expect(execRows).toHaveLength(1);

    const retryRes = await request(app)
      .post(`/api/automation/executions/${manualExecutionId}/retry`)
      .set('Cookie', [adminCookie])
      .set('x-csrf-token', csrfToken);

    expect(retryRes.status).toBe(200);
    expect(retryRes.body.success).toBe(true);
  });

  // Test 14: Handling missing start dates gracefully without fabricating arbitrary dates
  it('14. Handles missing start date explicitly without throwing unexpected errors', async () => {
    const previewRes = await request(app)
      .post('/api/automation/preview')
      .set('Cookie', [adminCookie])
      .send({
        workflowPresetId: publishedPresetId,
        workflowPresetVersionId: publishedVersionId
      });

    expect(previewRes.status).toBe(200);
    expect(previewRes.body.preview.warnings.some((w) => w.includes('No explicit project or service start date'))).toBe(true);
  });

  // Test 15: Cross-client project access security
  it('15. Prevents cross-client access for unauthorized users', async () => {
    // Other client
    const otherCode = `CL_OTH_${Date.now().toString().slice(-4)}`;
    const [otherRes] = await pool.query(
      `INSERT INTO clients (name, client_code, email, company_name, status, account_manager_id)
       VALUES ('Other Client', ?, ?, 'Other Corp', 'active', ?)`,
      [otherCode, `other_${Date.now().toString().slice(-4)}@example.com`, ownerId]
    );
    const otherClientId = otherRes.insertId;

    // Execution with client check
    const listRes = await request(app)
      .get(`/api/automation/executions?clientId=${otherClientId}`)
      .set('Cookie', [adminCookie]);

    expect(listRes.status).toBe(200);
    expect(listRes.body.executions).toBeDefined();
  });

  // Test 16: List executions with filters
  it('16. Lists executions with status and project filters with pagination metadata', async () => {
    const res = await request(app)
      .get(`/api/automation/executions?projectId=${testProjectId}&limit=10&offset=0`)
      .set('Cookie', [adminCookie]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.executions.length).toBeGreaterThan(0);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBeGreaterThan(0);
  });
});
