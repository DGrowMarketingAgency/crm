import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { csrfProtection } from '../../utils/csrf.js';
import { ProjectFlowService as S, currentCycleMonth, isClientPortalUser } from './projectFlow.service.js';
import {
  pipelineSchema,
  pipelineStatusSchema,
  createProjectSchema,
  stepAssigneesSchema,
  approveSchema,
  requestChangesSchema,
  billingSchema,
  retainerBillingSchema,
  projectStatusSchema,
  employeeTasksSchema,
  trackerSchema,
  createMonthPlanSchema,
  updateMonthPlanSchema,
  monthPlanProjectsSchema,
  stepTasksSchema,
  taskDoneSchema
} from './projectFlow.validation.js';

const router = Router();
router.use('/project-flow', authenticate, (req, res, next) => {
  // Internal tool only: client portal logins get nothing from this module.
  if (isClientPortalUser(req.user)) {
    return res.status(403).json({ success: false, error: { message: 'Client portal accounts cannot access internal project management', code: 'FORBIDDEN' } });
  }
  next();
});

const handle = (fn, status = 200) => async (req, res, next) => {
  try {
    res.status(status).json(await fn(req));
  } catch (e) {
    next(e);
  }
};
const num = (v) => Number(v);

// ── Project pipelines (templates) ──
router.get('/project-flow/pipelines', requirePermission('projects.view'),
  handle(async (req) => ({ pipelines: await S.listPipelines({ includeArchived: req.query.includeArchived === 'true' }) })));
router.get('/project-flow/pipelines/:id', requirePermission('projects.view'),
  handle(async (req) => ({ pipeline: await S.getPipeline(num(req.params.id)) })));
router.post('/project-flow/pipelines', requirePermission('workflows.create'), csrfProtection, validate(pipelineSchema),
  handle(async (req) => ({ pipeline: await S.createPipeline(req.body, req.user, req) }), 201));
router.put('/project-flow/pipelines/:id', requirePermission('workflows.update'), csrfProtection, validate(pipelineSchema),
  handle(async (req) => ({ pipeline: await S.updatePipeline(num(req.params.id), req.body, req.user, req) })));
router.patch('/project-flow/pipelines/:id/status', requirePermission('workflows.update'), csrfProtection, validate(pipelineStatusSchema),
  handle(async (req) => ({ pipeline: await S.setPipelineStatus(num(req.params.id), req.body.status, req.user, req) })));

// ── Clients → client project management (results are scoped to what the user may see) ──
router.get('/project-flow/clients', requirePermission('projects.view'),
  handle(async (req) => ({ clients: await S.listActiveClients(req.user, { search: String(req.query.search || '') }) })));
router.get('/project-flow/clients/:clientId/projects', requirePermission('projects.view'),
  handle(async (req) => S.getClientProjects(num(req.params.clientId), req.user)));

// ── Month plans: client -> month -> many service projects (writes: admin / PM / the client's account manager) ──
router.get('/project-flow/clients/:clientId/month-plans', requirePermission('projects.view'),
  handle(async (req) => ({ month_plans: await S.listMonthPlans(num(req.params.clientId), req.user) })));
router.post('/project-flow/month-plans', requirePermission('projects.create'), csrfProtection, validate(createMonthPlanSchema),
  handle(async (req) => S.createMonthPlan(req.body, req.user, req), 201));
router.get('/project-flow/month-plans/:planId', requirePermission('projects.view'),
  handle(async (req) => S.getMonthPlan(num(req.params.planId), req.user)));
router.patch('/project-flow/month-plans/:planId', requirePermission('projects.create'), csrfProtection, validate(updateMonthPlanSchema),
  handle(async (req) => S.updateMonthPlan(num(req.params.planId), req.body, req.user, req)));
router.post('/project-flow/month-plans/:planId/invoice', requirePermission('projects.create'), csrfProtection,
  handle(async (req) => S.createMonthPlanInvoice(num(req.params.planId), req.user, req), 201));
router.post('/project-flow/month-plans/:planId/projects', requirePermission('projects.create'), csrfProtection, validate(monthPlanProjectsSchema),
  handle(async (req) => S.addMonthPlanProjects(num(req.params.planId), req.body.projects, req.user, req), 201));

// ── Projects & step flow ──
// Viewing a project and working its steps only needs tasks.view: executives assigned to a step must reach it.
// The service enforces per-project access (member / assignee / leader / account manager / admin).
router.post('/project-flow/projects', requirePermission('projects.create'), csrfProtection, validate(createProjectSchema),
  handle(async (req) => ({ project: await S.createProject(req.body, req.user, req) }), 201));
router.get('/project-flow/projects/:id', requirePermission('tasks.view'),
  handle(async (req) => ({ project: await S.viewProject(num(req.params.id), req.user) })));
router.patch('/project-flow/projects/:id/status', requirePermission('tasks.view'), csrfProtection, validate(projectStatusSchema),
  handle(async (req) => ({ project: await S.setProjectStatus(num(req.params.id), req.body.status, req.user, req) })));
router.put('/project-flow/projects/:id/retainer-billing', requirePermission('tasks.view'), csrfProtection, validate(retainerBillingSchema),
  handle(async (req) => ({ project: await S.updateRetainerBilling(num(req.params.id), req.body, req.user, req) })));
router.patch('/project-flow/projects/:id/billing', requirePermission('projects.update'), csrfProtection, validate(billingSchema),
  handle(async (req) => ({ project: await S.updateBilling(num(req.params.id), req.body, req.user, req) })));
router.post('/project-flow/projects/:id/cycles', requirePermission('tasks.view'), csrfProtection,
  handle(async (req) => {
    const month = /^\d{4}-\d{2}$/.test(req.body?.month || '') ? req.body.month : currentCycleMonth();
    return S.generateCycleAs(num(req.params.id), month, req.user);
  }, 201));
router.put('/project-flow/projects/:id/steps/:stepId/assignees', requirePermission('tasks.view'), csrfProtection, validate(stepAssigneesSchema),
  handle(async (req) => ({ project: await S.updateStepAssignees(num(req.params.id), num(req.params.stepId), req.body.userIds, req.user, req) })));
router.post('/project-flow/projects/:id/steps/:stepId/tasks', requirePermission('tasks.view'), csrfProtection, validate(stepTasksSchema),
  handle(async (req) => ({ project: await S.addStepTasks(num(req.params.id), num(req.params.stepId), req.body.tasks, req.user, req) }), 201));
router.patch('/project-flow/projects/:id/tasks/:taskId/done', requirePermission('tasks.view'), csrfProtection, validate(taskDoneSchema),
  handle(async (req) => ({ project: await S.setTaskDone(num(req.params.id), num(req.params.taskId), req.body.done, req.user, req) })));
router.post('/project-flow/projects/:id/steps/:stepId/complete', requirePermission('tasks.view'), csrfProtection,
  handle(async (req) => ({ project: await S.completeStep(num(req.params.id), num(req.params.stepId), req.user, req) })));
router.post('/project-flow/projects/:id/steps/:stepId/approve', requirePermission('tasks.view'), csrfProtection, validate(approveSchema),
  handle(async (req) => ({ project: await S.approveStep(num(req.params.id), num(req.params.stepId), req.body.kind, req.user, req) })));
router.post('/project-flow/projects/:id/steps/:stepId/request-changes', requirePermission('tasks.view'), csrfProtection, validate(requestChangesSchema),
  handle(async (req) => ({ project: await S.requestChanges(num(req.params.id), num(req.params.stepId), req.body.note, req.user, req) })));

// ── Reviews & Approvals inbox (scoped inside the service: managers see their projects, everyone their own work) ──
router.get('/project-flow/reviews', requirePermission('tasks.view'),
  handle(async (req) => S.getReviewInbox(req.user)));

// ── Employees → task desk → project task page ──
router.get('/project-flow/employees', requirePermission('tasks.view'),
  handle(async (req) => ({ employees: await S.listEmployees(req.user, { search: String(req.query.search || '') }) })));
router.get('/project-flow/employees/:userId', requirePermission('tasks.view'),
  handle(async (req) => S.getEmployeeDesk(num(req.params.userId), req.user)));
router.get('/project-flow/employees/:userId/projects/:projectId', requirePermission('tasks.view'),
  handle(async (req) => S.getEmployeeProjectTasks(num(req.params.userId), num(req.params.projectId), req.user)));
router.post('/project-flow/employees/:userId/projects/:projectId/tasks', requirePermission('tasks.view'), csrfProtection, validate(employeeTasksSchema),
  handle(async (req) => S.createEmployeeTasks(num(req.params.userId), num(req.params.projectId), req.body.tasks, req.user, req), 201));

// ── Task time tracker: start / pause / complete (the assignee's own clock) ──
router.post('/project-flow/tasks/:taskId/tracker', requirePermission('timers.start'), csrfProtection, validate(trackerSchema),
  handle(async (req) => S.trackTask(num(req.params.taskId), req.body.action, req.user, req)));

export default router;
