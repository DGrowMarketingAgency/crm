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
import { usePermission } from '../hooks/usePermission';
import { useAuth } from '../hooks/useAuth';
import { DepartmentsPage } from '../pages/departments/DepartmentsPage';
import { DepartmentDetailsPage } from '../pages/departments/DepartmentDetailsPage';
import { ServicesPage } from '../pages/services/ServicesPage';
import { WorkflowPresetsPage } from '../pages/workflows/WorkflowPresetsPage';
import { WorkflowBuilderPage } from '../pages/workflows/WorkflowBuilderPage';
import { WorkflowActivityPage } from '../pages/workflows/WorkflowActivityPage';
import { TicketsPage } from '../pages/tickets/TicketsPage';
import { BillingPage } from '../pages/billing/BillingPage';
import { ChatPage } from '../pages/chat/ChatPage';
import { HRHubPage } from '../pages/hr/HRHubPage';
import { CalendarPage } from '../pages/calendar/CalendarPage';
import { PasswordManagerPage } from '../pages/credentials/PasswordManagerPage';
import { ClientProjectsPage } from '../pages/project-flow/ClientProjectsPage';
import { ClientProjectManagementPage } from '../pages/project-flow/ClientProjectManagementPage';
import { FlowProjectPage } from '../pages/project-flow/FlowProjectPage';
import { MonthPlanPage } from '../pages/project-flow/MonthPlanPage';
import { ReviewsPage } from '../pages/project-flow/ReviewsPage';
import { PipelinesPage } from '../pages/project-flow/PipelinesPage';
import { EmployeesPage } from '../pages/project-flow/EmployeesPage';
import { EmployeeDeskPage } from '../pages/project-flow/EmployeeDeskPage';
import { EmployeeProjectTasksPage } from '../pages/project-flow/EmployeeProjectTasksPage';
import { InvoicesRegisterPage } from '../pages/finance/InvoicesRegisterPage';
import { InvoiceBuilderPage } from '../pages/finance/InvoiceBuilderPage';
import { InvoiceViewPage } from '../pages/finance/InvoiceViewPage';
import { ClientGstPage } from '../pages/finance/ClientGstPage';
import { FinanceSettingsPage } from '../pages/finance/FinanceSettingsPage';
import { FinanceReportsPage } from '../pages/finance/FinanceReportsPage';
import { BillingAlertsPage } from '../pages/finance/BillingAlertsPage';
import { ExpensesPage } from '../pages/finance/ExpensesPage';
import { LoansPage } from '../pages/finance/LoansPage';
import { BorrowedMoneyPage } from '../pages/finance/BorrowedMoneyPage';
import { AdFundsPage } from '../pages/finance/AdFundsPage';
import { LeadsBoardPage } from '../pages/sales/LeadsBoardPage';
import { SalesDeskPage } from '../pages/sales/SalesDeskPage';
import { LeadDetailPage } from '../pages/sales/LeadDetailPage';
import { MeetingsPage } from '../pages/sales/MeetingsPage';
import { MarketersPage } from '../pages/sales/MarketersPage';
import { ProposalsPage } from '../pages/sales/ProposalsPage';
import { ProposalEditorPage } from '../pages/sales/ProposalEditorPage';
import { PublicProposalPage } from '../pages/sales/PublicProposalPage';
import { PublicQuotePage } from '../pages/sales/PublicQuotePage';
import { QuotationsPage } from '../pages/sales/QuotationsPage';
import { QuoteEditorPage } from '../pages/sales/QuoteEditorPage';
import MyAvailabilityPage from '../pages/shoots/MyAvailabilityPage';
import ShootPlannerPage from '../pages/shoots/ShootPlannerPage';
import VideographerShootsPage from '../pages/shoots/VideographerShootsPage';
import ClientShootDatesPage from '../pages/shoots/ClientShootDatesPage';
import { isFreelanceOnly } from '../pages/shoots/shootUi';

/** Clients keep the invoices page; staff use Finance → GST Invoices (and Sales → Quotations). */
function BillingRoute() {
  const { user } = useAuth();
  const { roles } = usePermission();
  const isClient = Boolean(user?.client_id) || (roles || []).some((r) => r.slug === 'client');
  return isClient ? <BillingPage /> : <Navigate to="/finance/invoices" replace />;
}

/** Freelance videographers have no workspace dashboard: they land on their availability calendar. */
function DashboardRoute() {
  const { roles, isLoading } = usePermission();
  if (isLoading) return null;
  return isFreelanceOnly(roles) ? <Navigate to="/shoots/availability" replace /> : <DashboardPage />;
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route element={<PublicRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      {/* Public Token-based Acceptance */}
      <Route path="/accept-invitation" element={<AcceptInvitationPage />} />

      {/* Public proposal link shared with clients (no login) */}
      <Route path="/p/:token" element={<PublicProposalPage />} />
      <Route path="/q/:token" element={<PublicQuotePage />} />

      {/* Protected Routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<DashboardRoute />} />
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

          {/* Video shoots: videographer availability (own) + Shoot Planner (managers) */}
          <Route element={<PermissionRoute requiredAny={['shoots.availability', 'shoots.manage']} />}>
            <Route path="/shoots/availability" element={<MyAvailabilityPage />} />
          </Route>
          <Route element={<PermissionRoute requiredPermission="shoots.availability" />}>
            <Route path="/shoots/open" element={<VideographerShootsPage />} />
            <Route path="/shoots/mine" element={<VideographerShootsPage />} />
            <Route path="/shoots/payments" element={<VideographerShootsPage />} />
          </Route>
          <Route element={<PermissionRoute requiredPermission="shoots.respond" />}>
            <Route path="/shoot-dates" element={<ClientShootDatesPage />} />
          </Route>
          <Route element={<PermissionRoute requiredAny={['shoots.view', 'shoots.manage']} />}>
            <Route path="/shoots" element={<ShootPlannerPage />} />
          </Route>

          {/* D-Grow OS: Client Monthly Content & Work Calendar */}
          <Route element={<PermissionRoute requiredPermission="calendar.view" />}>
            <Route path="/calendar" element={<CalendarPage />} />
          </Route>

          {/* The old 3-pipeline board is replaced by Sales → Leads & Follow-ups; old links land there. */}
          <Route element={<PermissionRoute requiredPermission="leads.view" />}>
            <Route path="/leads" element={<Navigate to="/sales/leads" replace />} />
          </Route>

          {/* D-Grow OS Phase 6: Client Support Tickets Desk */}
          <Route element={<PermissionRoute requiredPermission="tickets.view" />}>
            <Route path="/tickets" element={<TicketsPage />} />
          </Route>

          {/* D-Grow OS Phase 6: Quotations, Invoices & Payment Tracking */}
          <Route element={<PermissionRoute requiredPermission="invoices.view" />}>
            <Route path="/billing" element={<BillingRoute />} />
          </Route>

          {/* Phase 4: Projects & Milestones Management */}
          <Route element={<PermissionRoute requiredPermission="projects.view" />}>
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:id" element={<ProjectDetailsPage />} />
            {/* Client project flow: clients → client projects → pipeline steps */}
            <Route path="/client-projects" element={<ClientProjectsPage />} />
            <Route path="/client-projects/:clientId" element={<ClientProjectManagementPage />} />
            <Route path="/month-plans/:planId" element={<MonthPlanPage />} />
            <Route path="/project-pipelines" element={<PipelinesPage />} />
          </Route>

          {/* Employee task desk: employees → their projects → split tasks */}
          <Route element={<PermissionRoute requiredPermission="tasks.view" />}>
            <Route path="/employee-tasks" element={<EmployeesPage />} />
            <Route path="/employee-tasks/:userId" element={<EmployeeDeskPage />} />
            <Route path="/employee-tasks/:userId/projects/:projectId" element={<EmployeeProjectTasksPage />} />
            {/* Executives assigned to a step need the project page without projects.view; the API checks access per project. */}
            <Route path="/flow-projects/:id" element={<FlowProjectPage />} />
            <Route path="/reviews" element={<ReviewsPage />} />
          </Route>

          {/* Sales pipeline: leads & follow-ups, meetings, marketers, proposals */}
          <Route element={<PermissionRoute requiredPermission="leads.view" />}>
            <Route path="/sales/desk" element={<SalesDeskPage />} />
            <Route path="/sales/leads" element={<LeadsBoardPage />} />
            <Route path="/sales/leads/:id" element={<LeadDetailPage />} />
            <Route path="/sales/meetings" element={<MeetingsPage />} />
            <Route path="/sales/marketers" element={<MarketersPage />} />
          </Route>
          <Route element={<PermissionRoute requiredPermission="proposals.view" />}>
            <Route path="/sales/proposals" element={<ProposalsPage />} />
            <Route path="/sales/proposals/new" element={<ProposalEditorPage />} />
            <Route path="/sales/proposals/:id" element={<ProposalEditorPage />} />
          </Route>
          <Route element={<PermissionRoute requiredPermission="sales_quotes.view" />}>
            <Route path="/sales/quotes" element={<QuotationsPage />} />
            <Route path="/sales/quotes/new" element={<QuoteEditorPage />} />
            <Route path="/sales/quotes/:id" element={<QuoteEditorPage />} />
          </Route>

          {/* Finance: GST invoices, client GST profiles, agency billing settings */}
          <Route element={<PermissionRoute requiredPermission="invoices.view" />}>
            <Route path="/finance/invoices" element={<InvoicesRegisterPage />} />
            <Route path="/finance/invoices/new" element={<InvoiceBuilderPage />} />
            <Route path="/finance/invoices/:id" element={<InvoiceViewPage />} />
            <Route path="/finance/invoices/:id/edit" element={<InvoiceBuilderPage />} />
            <Route path="/finance/clients" element={<ClientGstPage />} />
            <Route path="/finance/settings" element={<FinanceSettingsPage />} />
            <Route path="/finance/alerts" element={<BillingAlertsPage />} />
          </Route>
          <Route element={<PermissionRoute requiredPermission="finance.reports.view" />}>
            <Route path="/finance/reports" element={<FinanceReportsPage />} />
          </Route>
          {/* Miscellaneous: office expenses & purchases, EMI & loans, client ad funds */}
          <Route element={<PermissionRoute requiredPermission="expenses.view" />}>
            <Route path="/finance/expenses" element={<ExpensesPage />} />
            <Route path="/finance/loans" element={<LoansPage />} />
            <Route path="/finance/borrowed" element={<BorrowedMoneyPage />} />
          </Route>
          <Route element={<PermissionRoute requiredPermission="adfunds.view" />}>
            <Route path="/finance/ad-funds" element={<AdFundsPage />} />
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

          {/* D-Grow OS Service Management Module */}
          <Route element={<PermissionRoute requiredPermission="services.view" />}>
            <Route path="/services" element={<ServicesPage />} />
          </Route>

          {/* D-Grow OS Phase 1: Workflow Presets & Builder */}
          <Route element={<PermissionRoute requiredPermission="workflows.view" />}>
            <Route path="/workflows" element={<WorkflowPresetsPage />} />
            <Route path="/workflows/activity" element={<WorkflowActivityPage />} />
            <Route path="/workflows/builder" element={<WorkflowBuilderPage />} />
            <Route path="/workflows/:id" element={<WorkflowBuilderPage />} />
          </Route>

          {/* Phase 2: RBAC Protected Routes */}
          <Route element={<PermissionRoute requiredPermission="roles.view" />}>
            <Route path="/roles" element={<RolesPage />} />
            <Route path="/audit-logs" element={<AuditLogsPage />} />
          </Route>

          {/* D-Grow OS: Secure Client Password Manager & Credential Access Control */}
          <Route element={<PermissionRoute requiredAny={['credentials.view_all', 'credentials.manage', 'credentials.client_access', 'credentials.employee_view']} />}>
            <Route path="/password-manager" element={<PasswordManagerPage />} />
            <Route path="/shared-credentials" element={<PasswordManagerPage />} />
            <Route path="/authorized-credentials" element={<PasswordManagerPage />} />
            <Route path="/credentials" element={<PasswordManagerPage />} />
          </Route>

          <Route path="/unauthorized" element={<AccessDeniedPage />} />
        </Route>
      </Route>

      {/* Fallback Catch-All */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
