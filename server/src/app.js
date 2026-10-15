import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { pool, testConnection } from './config/db.js';
import authRoutes from './modules/auth/auth.routes.js';
import rbacRoutes from './modules/rbac/rbac.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import teamsRoutes from './modules/teams/teams.routes.js';
import { projectRoutes } from './modules/projects/projects.routes.js';
import { clientRoutes } from './modules/clients/clients.routes.js';
import { taskRoutes } from './modules/tasks/tasks.routes.js';
import approvalsRoutes from './modules/approvals/approvals.routes.js';
import notificationsRoutes from './modules/notifications/notifications.routes.js';
import timeRoutes from './modules/time/time.routes.js';
import { reportsRoutes } from './modules/reports/reports.routes.js';
import { servicesRoutes } from './modules/services/services.routes.js';
import { leadsRoutes } from './modules/leads/leads.routes.js';
import departmentsRoutes from './modules/departments/departments.routes.js';
import workflowsRoutes from './modules/workflows/workflows.routes.js';
import automationRoutes from './modules/automation/automation.routes.js';
import deliverablesRoutes from './modules/deliverables/deliverables.routes.js';
import ticketsRoutes from './modules/tickets/tickets.routes.js';
import billingRoutes from './modules/billing/billing.routes.js';
import chatRoutes from './modules/chat/chat.routes.js';
import hrRoutes from './modules/hr/hr.routes.js';
import calendarRoutes from './modules/calendar/calendar.routes.js';
import credentialsRoutes from './modules/credentials/credentials.routes.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// Security HTTP headers via Helmet
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-site' }
}));

// CORS Configuration with strict origin check and credentials
const allowedOrigins = [env.CLIENT_URL, 'http://localhost:5173', 'http://localhost:5174'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || /^http:\/\/localhost:517[3-9]$/.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-XSRF-Token']
}));

// Cookie Parser
app.use(cookieParser());

// Request Body Parser
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Health Check Endpoint
app.get('/api/health', async (req, res) => {
  const isDbConnected = await testConnection();
  const uptime = process.uptime();

  if (isDbConnected) {
    return res.status(200).json({
      status: 'ok',
      service: 'agency-manager-api',
      database: 'connected',
      uptimeSeconds: Math.floor(uptime),
      timestamp: new Date().toISOString()
    });
  } else {
    return res.status(503).json({
      status: 'degraded',
      service: 'agency-manager-api',
      database: 'disconnected',
      uptimeSeconds: Math.floor(uptime),
      timestamp: new Date().toISOString()
    });
  }
});

// Authentication Routes
app.use('/api/auth', authRoutes);

// RBAC & Permission Management Routes
app.use('/api', rbacRoutes);

// User Management & Invitations Routes
app.use('/api', usersRoutes);

// Team Management Routes
app.use('/api', teamsRoutes);

// Project Management & Milestones Routes
app.use('/api', projectRoutes);

// Client Management Routes
app.use('/api', clientRoutes);

// Task Management, Subtasks, Comments & Attachments Routes
app.use('/api', taskRoutes);

// Phase 6: Approvals and Notifications Routes
app.use('/api', approvalsRoutes);
app.use('/api', notificationsRoutes);

// Phase 7: Time Tracking, Work Logs, Timesheets & Reports Routes
app.use('/api', timeRoutes);

// Phase 8: Advanced Reports, Analytics & Data Export Routes
app.use('/api', reportsRoutes);

// D-Grow OS Phase 1: Services Catalog & Auto-Trigger Engine
app.use('/api', servicesRoutes);

// D-Grow OS Phase 1: Leads & 3 BD Pipelines
app.use('/api', leadsRoutes);

// D-Grow OS Phase 1: Department Management & Workflow Preset Builder
app.use('/api', departmentsRoutes);
app.use('/api', workflowsRoutes);

// D-Grow OS Phase 4: Workflow Automation & Automatic Task Creation Engine
app.use('/api', automationRoutes);

// D-Grow OS Phase 5: Internal Review, Client Approval & Revision Workflow
app.use('/api', deliverablesRoutes);

// D-Grow OS Phase 6: Client Support Tickets, Quotations, Invoicing & Payments
app.use('/api', ticketsRoutes);
app.use('/api', billingRoutes);

// D-Grow OS Phase 7: Internal Team Chat & Real-Time Communication
app.use('/api', chatRoutes);

// D-Grow OS Phase 8: HR Management, Attendance, Leave & Payroll
app.use('/api', hrRoutes);

// D-Grow OS: Client Monthly Content & Work Calendar
app.use('/api/calendar', calendarRoutes);

// D-Grow OS: Secure Client Password Manager & Credential Access Control
app.use('/api', credentialsRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Resource not found: ${req.method} ${req.originalUrl}`,
      code: 'NOT_FOUND'
    }
  });
});

// Centralized Error Handler
app.use(errorHandler);

export default app;
