import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { PublicRoute } from './PublicRoute';
import { PermissionRoute } from './PermissionRoute';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { LoginPage } from '../pages/auth/LoginPage';
import { AcceptInvitationPage } from '../pages/auth/AcceptInvitationPage';
import { DashboardPage } from '../pages/dashboard/DashboardPage';
import { RolesPage } from '../pages/rbac/RolesPage';
import { AuditLogsPage } from '../pages/rbac/AuditLogsPage';
import { AccessDeniedPage } from '../pages/rbac/AccessDeniedPage';
import { UsersPage } from '../pages/users/UsersPage';
import { TeamsPage } from '../pages/teams/TeamsPage';
import { TeamDetailsPage } from '../pages/teams/TeamDetailsPage';
import { ProjectsPage } from '../pages/projects/ProjectsPage';
import { ProjectDetailsPage } from '../pages/projects/ProjectDetailsPage';
import { TasksPage } from '../pages/tasks/TasksPage';
import { TaskDetailsPage } from '../pages/tasks/TaskDetailsPage';
import { NotificationsPage } from '../pages/notifications/NotificationsPage';
import { TimeTrackingPage } from '../pages/time/TimeTrackingPage';
import { ReportsPage } from '../pages/reports/ReportsPage';
import { ClientsPage } from '../pages/clients/ClientsPage';
import { ClientWorkspacePage } from '../pages/clients/ClientWorkspacePage';
import { LeadsPage } from '../pages/leads/LeadsPage';
import { DepartmentsPage } from '../pages/departments/DepartmentsPage';
import { DepartmentDetailsPage } from '../pages/departments/DepartmentDetailsPage';
import { WorkflowPresetsPage } from '../pages/workflows/WorkflowPresetsPage';
import { WorkflowBuilderPage } from '../pages/workflows/WorkflowBuilderPage';
import { TicketsPage } from '../pages/tickets/TicketsPage';
import { BillingPage } from '../pages/billing/BillingPage';
import { ChatPage } from '../pages/chat/ChatPage';
import { HRHubPage } from '../pages/hr/HRHubPage';
import { CalendarPage } from '../pages/calendar/CalendarPage';

export function AppRoutes() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route element={<PublicRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      {/* Public Token-based Acceptance */}
      <Route path="/accept-invitation" element={<AcceptInvitationPage />} />

      {/* Protected Routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* Phase 8: Advanced Reports & Analytics */}
          <Route element={<PermissionRoute requiredPermission="reports.view_dashboard" />}>
            <Route path="/reports" element={<ReportsPage />} />
          </Route>

          {/* Phase 7: Time Tracking & Timesheets */}
          <Route element={<PermissionRoute requiredPermission="time_entries.view_own" />}>
            <Route path="/time" element={<TimeTrackingPage />} />
          </Route>

          {/* Phase 6: Notifications Center */}
          <Route element={<PermissionRoute requiredPermission="notifications.view" />}>
            <Route path="/notifications" element={<NotificationsPage />} />
          </Route>

          {/* D-Grow OS Phase 7: Internal Team Chat & Real-Time Communication */}
          <Route element={<PermissionRoute requiredPermission="chat.view" />}>
            <Route path="/chat" element={<ChatPage />} />
          </Route>

          {/* D-Grow OS Phase 8: HR Management, Attendance, Leave & Payroll */}
          <Route element={<PermissionRoute requiredAny={['hr.employees.view', 'hr.attendance.view_own', 'hr.leave.view_own', 'hr.payslips.view_own']} />}>
            <Route path="/hr" element={<HRHubPage />} />
          </Route>

          {/* Phase 5: Task Management */}
          <Route element={<PermissionRoute requiredPermission="tasks.view" />}>
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/tasks/:id" element={<TaskDetailsPage />} />
          </Route>

          {/* D-Grow OS Phase 1 & 2: Clients & Client Lifecycle Workspace */}
          <Route element={<PermissionRoute requiredPermission="clients.view" />}>
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/clients/:id" element={<ClientWorkspacePage />} />
          </Route>

          {/* D-Grow OS: Client Monthly Content & Work Calendar */}
          <Route element={<PermissionRoute requiredPermission="calendar.view" />}>
            <Route path="/calendar" element={<CalendarPage />} />
          </Route>

          {/* D-Grow OS Phase 1: 3 BD Pipelines (Leads) */}
          <Route element={<PermissionRoute requiredPermission="leads.view" />}>
            <Route path="/leads" element={<LeadsPage />} />
          </Route>

          {/* D-Grow OS Phase 6: Client Support Tickets Desk */}
          <Route element={<PermissionRoute requiredPermission="tickets.view" />}>
            <Route path="/tickets" element={<TicketsPage />} />
          </Route>

          {/* D-Grow OS Phase 6: Quotations, Invoices & Payment Tracking */}
          <Route element={<PermissionRoute requiredPermission="invoices.view" />}>
            <Route path="/billing" element={<BillingPage />} />
          </Route>

          {/* Phase 4: Projects & Milestones Management */}
          <Route element={<PermissionRoute requiredPermission="projects.view" />}>
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:id" element={<ProjectDetailsPage />} />
          </Route>

          {/* Phase 3: Users Management */}
          <Route element={<PermissionRoute requiredPermission="users.view" />}>
            <Route path="/users" element={<UsersPage />} />
          </Route>

          {/* Phase 3: Teams Management */}
          <Route element={<PermissionRoute requiredPermission="teams.view" />}>
            <Route path="/teams" element={<TeamsPage />} />
            <Route path="/teams/:id" element={<TeamDetailsPage />} />
          </Route>

          {/* D-Grow OS Phase 1: Department Management */}
          <Route element={<PermissionRoute requiredPermission="departments.view" />}>
            <Route path="/departments" element={<DepartmentsPage />} />
            <Route path="/departments/:id" element={<DepartmentDetailsPage />} />
          </Route>

          {/* D-Grow OS Phase 1: Workflow Presets & Builder */}
          <Route element={<PermissionRoute requiredPermission="workflows.view" />}>
            <Route path="/workflows" element={<WorkflowPresetsPage />} />
            <Route path="/workflows/builder" element={<WorkflowBuilderPage />} />
            <Route path="/workflows/:id" element={<WorkflowBuilderPage />} />
          </Route>

          {/* Phase 2: RBAC Protected Routes */}
          <Route element={<PermissionRoute requiredPermission="roles.view" />}>
            <Route path="/roles" element={<RolesPage />} />
            <Route path="/audit-logs" element={<AuditLogsPage />} />
          </Route>

          <Route path="/unauthorized" element={<AccessDeniedPage />} />
        </Route>
      </Route>

      {/* Fallback Catch-All */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
