# Agency Task & Project Management System — Phases 1 through 8

A professional, enterprise-grade Agency Task & Project Management System built for digital marketing agencies and software development companies.

- **Phase 1**: Core project foundation, MySQL 8 database integration, secure authentication architecture with refresh-token rotation and reuse detection, initial Owner account bootstrap script, and a responsive frontend login interface.
- **Phase 2**: Role-Based Access Control (RBAC) with default system roles, custom role management, granular permission matrices, transactional role assignments, server-side authorization middleware, privilege escalation safeguards, and immutable security audit logs.
- **Phase 3**: User Management, Secure Single-Use Invitations Lifecycle, Session Revocation on Status Changes, Team Management, Designated Team Leader Enforcement, and Transactional Membership Controls.
- **Phase 4**: Project Management, Client Assignment, Participating Teams & Project Members Allocation, Project Milestones Lifecycle with Ordering & Completion, Resource-Level Authorization, Scoped Dashboard Metrics, and Project Activity History.
- **Phase 5**: Complete Task Management, Project-Scoped Codes (`DG-1`), Multi-Assignees, Workflow Status Engine, Discussion Threads, Secure Attachments (10MB limits, disk streaming), Subtasks with Circular Dependency Prevention, and Kanban Board / List Views.
- **Phase 6**: Workflow Automation, Task Approvals & Resubmission History, Self-Approval Prevention, In-App Notification Center, Authenticated Real-Time Socket.IO Notifications, MySQL-Backed Asynchronous Email Queue with Retries & Exponential Backoff, Idempotent Automated Deadline Reminders, and User Notification Preferences.
- **Phase 7**: Time Tracking, Task Timers with Single-Active-Timer Concurrency Enforcement, Manual Work Logs, Weekly/Monthly Timesheets, Approval/Rejection Lifecycle with Self-Approval Guards, Billable vs Non-Billable Tracking, Task/Project Effort Summaries, and Audit Logging.
- **Phase 8**: Advanced Reports, Analytics & Data Export: Management KPI Dashboard (12 metrics), Project Performance & Milestones, Task Velocity & Overdue Reports, Team Workload Distribution, Billable vs Non-Billable Time Tracking, Client-Facing Project Overviews with strict client isolation, Interactive Recharts Visualizations, Secure CSV & Excel XLSX Exports with Spreadsheet Formula Injection (CWE-1236) protection, and Export Audit Logging.

---

## 1. Prerequisites

- **Node.js**: v18.0.0+ (Tested on Node.js v22+)
- **npm**: v9.0.0+ (Tested on npm v11+)
- **MySQL Server**: 8.0+ running locally or remotely (InnoDB, utf8mb4)

---

## 2. Directory Structure

```
agency-manager/
├── client/                     # Vite + React + Tailwind CSS Frontend
│   ├── src/
│   │   ├── app/                # AuthContext & PermissionContext providers
│   │   ├── components/         # Shared UI components
│   │   ├── layouts/            # DashboardLayout (Sidebar navigation, header, profile)
│   │   ├── pages/
│   │   │   ├── auth/           # LoginPage, AcceptInvitationPage
│   │   │   ├── dashboard/      # DashboardPage (Overview & RBAC metrics)
│   │   │   ├── rbac/           # RolesPage, PermissionMatrixModal, RoleModal, AuditLogsPage, AccessDeniedPage
│   │   │   ├── users/          # UsersPage, UserModal, InviteUserModal, InvitationsModal, UserDetailsModal
│   │   │   ├── teams/          # TeamsPage, TeamDetailsPage, TeamModal
│   │   │   └── projects/       # ProjectsPage, ProjectDetailsPage, ProjectModal, MilestoneModal
│   │   ├── routes/             # ProtectedRoute, PublicRoute, PermissionRoute, AppRoutes
│   │   ├── services/           # Axios instance with authService, rbacService, usersService, teamsService, projectsService, clientsService
│   │   ├── hooks/              # useAuth & usePermission hooks
│   │   ├── utils/              # Helper utilities
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
├── server/                     # Node.js + Express + MySQL Backend
│   ├── src/
│   │   ├── config/             # env.js (Zod validation), db.js (mysql2 pool)
│   │   ├── middleware/         # authenticate, authorize (requirePermission), errorHandler, rateLimiter, validate
│   │   ├── modules/
│   │   │   ├── auth/           # Controller, Service, Routes, Validation
│   │   │   ├── rbac/           # Registry, Seeder, Controller, Service, Routes, Validation
│   │   │   ├── users/          # Controller, Service, Routes, Validation
│   │   │   ├── teams/          # Controller, Service, Routes, Validation
│   │   │   ├── clients/        # Controller, Service, Routes, Validation
│   │   │   ├── projects/       # Controller, Service, Policy (Resource-level access), Routes, Validation
│   │   │   ├── milestones/     # Controller, Service, Routes, Validation
│   │   │   └── audit/          # AuditService (Immutable audit logs)
│   │   ├── scripts/            # bootstrap-owner.js (One-time Owner setup)
│   │   ├── utils/              # cookies, tokens, csrf
│   │   ├── app.js              # Express app assembly & middleware
│   │   └── server.js           # HTTP listener with DB connectivity check & RBAC seeder
│   ├── test/                   # Automated Vitest test suite (auth, rbac, users_teams, projects)
│   ├── .env.example            # Environment configuration template
│   ├── .env                    # Local environment variables
│   └── package.json
├── database/
│   ├── schema.sql              # Unified complete schema (Phases 1 through 8, 29 tables)
│   └── migrations/
│       ├── 002_rbac_schema.sql        # Versioned Phase 2 RBAC migration
│       ├── 003_users_teams_schema.sql # Versioned Phase 3 Users & Teams migration
│       ├── 004_projects_schema.sql    # Versioned Phase 4 Projects & Milestones migration
│       ├── 005_tasks_schema.sql       # Versioned Phase 5 Tasks & Kanban migration
│       ├── 006_approvals_notifications_schema.sql # Versioned Phase 6 Approvals & Notifications migration
│       ├── 007_time_tracking_schema.sql # Versioned Phase 7 Time Tracking & Timesheets migration
│       └── 008_reports_analytics_schema.sql # Versioned Phase 8 Reports, Analytics & Exports migration
├── .gitignore
├── README.md
└── package.json                # Root convenience scripts
```

---

## 3. Database Setup & Migrations

### Fresh Database Setup
Import the complete unified schema:
```bash
mysql -u root -p < database/schema.sql
```

### Upgrading an Existing Database to Phase 8
Apply the versioned migration:
```bash
mysql -u root -p < database/migrations/008_reports_analytics_schema.sql
```

The database includes 29 tables:
1. `users`: Stores user accounts, status (`active`, `inactive`, `suspended`), password hashes, and timestamps.
2. `refresh_tokens`: Stores cryptographically random opaque token SHA-256 hashes, token family, expiration, and revocation timestamps.
3. `roles`: Stores system and custom roles with unique names and slugs.
4. `permissions`: Stores registered granular permissions.
5. `user_roles`: Many-to-many pivot mapping users to roles.
6. `role_permissions`: Many-to-many pivot mapping roles to permissions.
7. `audit_logs`: Immutable audit trail of administrative and security events.
8. `invitations`: Stores pending user invitations with cryptographically random SHA-256 token hashes.
9. `teams`: Stores agency teams, descriptions, designated `leader_id`, and status (`active`, `inactive`).
10. `team_members`: Composite primary key `(team_id, user_id)` mapping memberships with `team_role` (`member` or `leader`).
11. `clients`: Stores external client accounts with contact details, company name, and optional portal user linkages.
12. `projects`: Stores agency projects, codes, manager ID, client ID, status, priority, visibility, start/due dates, objectives, and archive state.
13. `project_members`: Composite primary key `(project_id, user_id)` mapping project members with `project_role` (`manager`, `member`, `client`).
14. `project_teams`: Junction table `(project_id, team_id)` linking participating teams.
15. `project_milestones`: Stores milestone deliverables, status, display order, target deadlines, and completion timestamps.
16. `tasks`: Stores project tasks, scoped codes (`DG-1`), priority, workflow status, estimated effort, and due dates.
17. `task_assignees`: Pivot mapping tasks to assignees.
18. `task_subtasks`: Subtasks with recursive parent check.
19. `task_comments`: Task discussion threads.
20. `task_attachments`: Secure attachment uploads with MIME verification.
21. `task_activity_log`: Audit trail for task transitions and modifications.
22. `task_approvals`: Formal approval workflow and status decisions.
23. `task_approval_history`: Historical log of review requests and feedback.
24. `notifications`: In-app notification records.
25. `notification_preferences`: Per-user notification settings.
26. `timesheets`: Weekly or monthly employee reporting periods with approval lifecycle.
27. `time_entries`: Work logs associated with tasks and projects with billable flags and approval statuses.
28. `active_timers`: Dedicated table with unique `user_id` constraint guaranteeing at most one running timer per user.
29. `report_exports`: Asynchronous and synchronous data export tracking with format (`csv`, `xlsx`), report type, sanitized filters, file sizes, row counts, and download audit links.

---

## 4. Centralized Permission Registry (85 Permissions Total)

Seeded idempotently on server startup:

### Reports & Analytics (Phase 8)
- `reports.view_dashboard`: View reporting dashboard KPI metrics and visualizations.
- `reports.view_projects`: View project-level performance, milestone delivery, and effort reports.
- `reports.view_tasks`: View task completion velocity, status distribution, and overdue task reports.
- `reports.view_teams`: View team workload distribution and member allocation reports.
- `reports.view_time`: View agency-wide billable, non-billable, approved, and unapproved time summaries.
- `reports.view_clients`: View client-facing project and milestone delivery summaries with client isolation.
- `reports.export`: Generate and download CSV and Excel XLSX data exports.
- `reports.view_all`: Organization-wide reporting visibility across all agency projects and teams.

### Time Tracking & Timesheets (Phase 7)
- `time_entries.view_own`: View own recorded time entries and logs.
- `time_entries.create`: Log time manually against accessible tasks.
- `time_entries.update_own`: Edit own draft time entries.
- `time_entries.delete_own`: Delete own draft time entries.
- `time_entries.view_all`: View time entries across all agency members.
- `time_entries.manage_all`: Edit or delete any time entry (administrative).
- `timers.start`: Start an active task timer.
- `timers.stop_own`: Stop own active timer and convert to work log.
- `timers.view_own`: View own active running timer.
- `timers.manage_all`: Manage active timers across all users.
- `timesheets.view_own`: View own timesheets.
- `timesheets.submit`: Submit draft timesheet for manager review.
- `timesheets.view_team`: View timesheets submitted by team or project members.
- `timesheets.review`: Access manager timesheet review queues.
- `timesheets.approve`: Approve submitted timesheets (self-approval prohibited).
- `timesheets.reject`: Reject submitted timesheets with required explanation.
- `timesheets.manage_all`: Manage all agency timesheets.
- `time_reports.view`: View project effort summaries and time breakdown metrics.

### Approvals & Notifications (Phase 6)
- `approvals.submit`, `approvals.view`, `approvals.approve`, `approvals.request_revision`, `approvals.cancel`, `notifications.view`, `notifications.manage_preferences`

### Tasks (Phase 5)
- `tasks.view`, `tasks.view_all`, `tasks.create`, `tasks.update`, `tasks.delete`, `tasks.change_status`, `tasks.reopen`, `tasks.assign`, `subtasks.create`, `subtasks.update`, `subtasks.delete`, `task_comments.create`, `task_comments.update_own`, `task_comments.delete_own`, `task_attachments.upload`, `task_attachments.delete`

### Projects & Milestones (Phase 4)
- `projects.view`, `projects.create`, `projects.update`, `projects.delete`, `projects.archive`, `projects.assign_manager`, `projects.manage_members`, `projects.manage_teams`, `projects.manage_clients`, `projects.change_status`, `projects.view_activity`
- `milestones.view`, `milestones.create`, `milestones.update`, `milestones.delete`, `milestones.complete`, `milestones.reorder`

### Clients
- `clients.view`, `clients.create`, `clients.update`, `clients.delete`

### Users & Teams (Phase 3)
- `users.view`, `users.create`, `users.update`, `users.delete`, `users.change_status`, `users.invite`, `users.manage_roles`, `users.view_teams`
- `teams.view`, `teams.create`, `teams.update`, `teams.delete`, `teams.view_members`, `teams.manage_members`, `teams.assign_leader`

### Roles & Settings (Phase 2)
- `roles.view`, `roles.create`, `roles.update`, `roles.delete`, `roles.assign_permissions`, `roles.assign_users`, `permissions.view`, `settings.view`, `settings.update`

---

## 5. Security & Resource-Level Authorization Architecture

1. **Resource-Level Access Scoping (`ProjectsPolicy`)**:
   - Organization-wide access is restricted to users with `Owner` or `Admin` privileges.
   - For all other users (Project Managers, Team Leaders, Employees, Clients), access to any project requires explicit relationship:
     - The user is the designated `project_manager_id` of the project, OR
     - The user is an assigned member in `project_members`, OR
     - The user belongs to a team assigned in `project_teams`, OR
     - The project is associated with a client record linked to the user's ID or email.
   - **Isolation Guarantee**: Unrelated PMs cannot view or modify other PMs' projects. Team leaders cannot view projects outside their teams. Clients are strictly isolated to their own projects.
2. **Transactional Integrity & Rollback**:
   - Creating a project transactionally assigns the project manager to `project_members`, adds participating members, and assigns teams in a single database transaction.
   - If any member ID or team ID is invalid or inactive, the entire project creation is rolled back with zero orphaned rows.
3. **Milestone Integrity**:
   - Milestones enforce strict parent-project ownership (`WHERE id = ? AND project_id = ?`) preventing cross-project tampering.
   - Completing a milestone automatically sets `completed_at = NOW()`; transitioning away resets `completed_at = NULL`.
4. **Audit Logging**:
   - Project creation, updates, manager changes, team assignments, member modifications, status transitions, archival, and milestone events are recorded in `audit_logs`.

---

## 6. API Endpoints Documentation

### Project Management
| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `GET` | `/api/projects` | `projects.view` | List projects with search, filters (status, priority, client, team), sorting, and pagination (access scoped) |
| `GET` | `/api/projects/metrics` | `projects.view` | Get real database metrics (total, active, on hold, completed, overdue, upcoming milestones) scoped to user |
| `GET` | `/api/projects/:id` | `projects.view` | Get project overview, client, manager, teams, members, and milestone progress |
| `POST` | `/api/projects` | `projects.create` | Create a project transactionally with team and member assignments (CSRF) |
| `PUT` | `/api/projects/:id` | `projects.update` | Update project metadata, priority, dates, and specifications (CSRF) |
| `PATCH` | `/api/projects/:id/status` | `projects.change_status` | Transition project status and set `completed_at` (CSRF) |
| `POST` | `/api/projects/:id/archive` | `projects.archive` | Archive a completed or cancelled project (CSRF) |
| `GET` | `/api/projects/:id/members` | `projects.view` | List assigned project members |
| `PUT` | `/api/projects/:id/members` | `projects.manage_members` | Replace project members transactionally (PM preserved) (CSRF) |
| `GET` | `/api/projects/:id/teams` | `projects.view` | List assigned participating teams |
| `PUT` | `/api/projects/:id/teams` | `projects.manage_teams` | Replace participating teams transactionally (CSRF) |
| `GET` | `/api/projects/:id/activity` | `projects.view_activity` | Get audit activity history for project and milestones |

### Client-Associated Endpoints
| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `GET` | `/api/clients` | `clients.view` | List client organizations |
| `GET` | `/api/clients/:id` | `clients.view` | Get client details |
| `POST` | `/api/clients` | `clients.create` | Create a new client profile (CSRF) |
| `PUT` | `/api/clients/:id` | `clients.update` | Update client profile (CSRF) |
| `DELETE` | `/api/clients/:id` | `clients.delete` | Delete client (rejects if associated projects exist) (CSRF) |
| `GET` | `/api/clients/:id/projects` | `projects.view` | List projects associated with this client (access scoped) |

### Milestone Management
| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `GET` | `/api/projects/:id/milestones` | `milestones.view` | List project milestones ordered by sequence and due date |
| `POST` | `/api/projects/:id/milestones` | `milestones.create` | Create a milestone for a project (CSRF) |
| `PATCH` | `/api/projects/:id/milestones/reorder` | `milestones.reorder` | Reorder milestones transactionally (CSRF) |
| `PUT` | `/api/projects/:id/milestones/:milestoneId` | `milestones.update` | Update milestone details, target date, and status (CSRF) |
| `PATCH` | `/api/projects/:id/milestones/:milestoneId/status` | `milestones.update` | Change milestone status and update completion timestamp (CSRF) |
| `DELETE` | `/api/projects/:id/milestones/:milestoneId` | `milestones.delete` | Delete a milestone (CSRF) |

---

## 7. Phase 5 — Task Management Module

### Architecture & Features
- **Task Hierarchy & Identifiers**: Project-scoped auto-generated unique task identifiers (e.g. `DG-1`, `DG-2`), hierarchical parent-child subtasks with circular dependency prevention, and milestone linkages.
- **Multi-Assignee Model**: Many-to-many task assignments (`task_assignees`) with project eligibility verification and transactional updates.
- **Workflow State Machine**: Strictly validated transitions:
  - `todo` → `in_progress`
  - `in_progress` → `in_review`, `blocked`, `completed`
  - `in_review` → `in_progress`, `completed`
  - `blocked` → `in_progress`
  - `completed` → `in_progress` (reopen, restricted to authorized users)
- **Discussion & Comments**: Threaded task discussions (`task_comments`) with author edit/delete rules and moderation.
- **Task Attachments**: Private file storage (`task_attachments`) with 10MB limits, MIME validation, server-controlled unique storage keys, path traversal protection, and authorized streaming downloads.
- **Kanban Board & List Views**: Real-time drag-and-drop board with server-enforced workflow transitions, list view, My Tasks view, and Overdue tasks filtering.

### Task Management Endpoints
| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `GET` | `/api/tasks` | `tasks.view` | List tasks with filters (search, project, status, priority, assignee, overdue, pagination) |
| `GET` | `/api/tasks/my-tasks` | `tasks.view` | List tasks assigned to the current user |
| `GET` | `/api/projects/:id/tasks` | `tasks.view` | List tasks for a specific accessible project |
| `GET` | `/api/tasks/:id` | `tasks.view` | Get full task details including assignees, subtasks, and transition history |
| `POST` | `/api/tasks` | `tasks.create` | Create a task transactionally with assignees, labels, and milestone (CSRF) |
| `PUT` | `/api/tasks/:id` | `tasks.update` | Update task details, priority, dates, and labels (CSRF) |
| `PATCH` | `/api/tasks/:id/status` | `tasks.change_status` | Advance task workflow status with validated transition matrix and history (CSRF) |
| `POST` | `/api/tasks/:id/reopen` | `tasks.reopen` | Reopen a completed task back to in-progress with transition audit (CSRF) |
| `POST` | `/api/tasks/:id/archive` | `tasks.archive` | Archive task (soft-delete / archive flag) (CSRF) |
| `DELETE` | `/api/tasks/:id` | `tasks.delete` | Delete task and clean up dependencies (CSRF) |
| `GET` | `/api/tasks/:id/assignees` | `tasks.view` | Get current task assignees |
| `PUT` | `/api/tasks/:id/assignees` | `tasks.assign` | Update task assignees transactionally with project eligibility validation (CSRF) |
| `GET` | `/api/tasks/:id/subtasks` | `subtasks.view` | List direct subtasks for a parent task |
| `POST` | `/api/tasks/:id/subtasks` | `subtasks.create` | Create a subtask under the parent task in the same project (CSRF) |
| `GET` | `/api/tasks/:id/comments` | `task_comments.view` | Get task comments thread |
| `POST` | `/api/tasks/:id/comments` | `task_comments.create` | Post a new comment (CSRF) |
| `PUT` | `/api/tasks/:id/comments/:commentId` | `task_comments.update_own` | Edit comment text (author or moderator) (CSRF) |
| `DELETE` | `/api/tasks/:id/comments/:commentId` | `task_comments.delete_own` | Delete comment (author or moderator) (CSRF) |
| `GET` | `/api/tasks/:id/attachments` | `task_attachments.view` | List uploaded attachments for the task |
| `POST` | `/api/tasks/:id/attachments` | `task_attachments.upload` | Upload secure attachment (max 10MB, safe mime types) (CSRF) |
| `GET` | `/api/tasks/:id/attachments/:attachmentId/download` | `task_attachments.view` | Stream attachment download to authorized viewer |
| `DELETE` | `/api/tasks/:id/attachments/:attachmentId` | `task_attachments.delete_own` | Delete attachment and remove physical disk file (CSRF) |

---

## 8. Running the Application & Automated Tests

### Start Backend (Port 5000)
```bash
cd server
npm run dev
```

### Start Frontend (Port 5173 or 5174)
```bash
cd client
npm run dev
```

---

## 8. Phase 6 — Workflow Automation, Task Approvals & Notifications

### Architecture & Features
- **Task Approval State Machine**:
  - Validated transitions:
    - `in_progress` → `in_review` via `POST /api/tasks/:id/submit-review` (creates pending record in `task_approvals`)
    - `in_review` → `completed` via `POST /api/tasks/:id/approvals/:approvalId/approve`
    - `in_review` → `in_progress` via `POST /api/tasks/:id/approvals/:approvalId/request-revision` (requires reviewer feedback)
    - `in_review` → `in_progress` via `POST /api/tasks/:id/approvals/:approvalId/cancel` (cancelled by submitter or authorized manager)
  - **Self-Approval Prevention**: An employee submitting their work cannot approve their own submission (enforced server-side with HTTP 403 unless an explicit Owner override applies).
  - **Resubmission History Preservation**: Previous approval cycles, notes, and reviewer comments are never overwritten; every cycle is retained chronologically in `task_approvals`.
- **In-App Notification Center**:
  - Isolated recipient delivery (`notifications` table).
  - Unread badge counter, mark as read, mark all as read, soft deletion, and pagination.
  - Safe application-relative action URLs.
  - Granular triggers: task assignment, review submitted, approved, revisions requested, blocked, deadline approaching, and overdue.
- **Real-Time Notification Delivery (Socket.IO)**:
  - Authenticated via existing JWT cookie and authorization handshake.
  - Server-controlled private user rooms (`user:<userId>`).
  - No client-supplied user ID trust; immediate fallback to REST polling if disconnected.
- **Asynchronous Email Queue Architecture**:
  - MySQL-backed job queue (`email_jobs`) for non-blocking task transitions.
  - Worker claiming with bounded exponential backoff retries (`attempts`, `next_retry_at`, `max_attempts = 5`).
  - Nodemailer SMTP transporter with automatic mock fallback for development and testing.
  - Professional HTML & plain-text responsive templates.
  - User notification preference filtering.
- **Automated Deadline Reminders**:
  - Scheduled background worker running daily boundary checks:
    - 24 hours prior to due date
    - On the due date
    - Daily overdue reminders (up to 5 days overdue)
  - Excludes completed, archived, and cancelled tasks.
  - Persistent idempotency logging (`deadline_reminder_logs`) preventing duplicate notifications across restarts.

### Phase 6 API Endpoints

#### Task Approval Workflow
| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `POST` | `/api/tasks/:id/submit-review` | `approvals.submit` | Submit task for formal review (CSRF) |
| `GET` | `/api/tasks/:id/approvals` | `approvals.view` | Get all review records for a task |
| `POST` | `/api/tasks/:id/approvals/:approvalId/approve` | `approvals.approve` | Approve task submission and mark completed (CSRF) |
| `POST` | `/api/tasks/:id/approvals/:approvalId/request-revision` | `approvals.request_revision` | Request revisions with mandatory feedback (CSRF) |
| `POST` | `/api/tasks/:id/approvals/:approvalId/cancel` | `approvals.cancel` | Cancel an active review request (CSRF) |
| `GET` | `/api/tasks/:id/approval-history` | `approvals.view` | Get chronological approval history for a task |

#### Notifications & Preferences
| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `GET` | `/api/notifications` | `notifications.view` | List user notifications (filters: `unreadOnly`, pagination) |
| `GET` | `/api/notifications/unread-count` | `notifications.view` | Get unread notification count badge |
| `PATCH` | `/api/notifications/:id/read` | `notifications.view` | Mark specific notification as read (CSRF) |
| `PATCH` | `/api/notifications/read-all` | `notifications.view` | Mark all user notifications as read (CSRF) |
| `DELETE` | `/api/notifications/:id` | `notifications.view` | Delete a notification (CSRF) |
| `GET` | `/api/notifications/preferences` | `notifications.view` | Get current user's notification preferences |
| `PUT` | `/api/notifications/preferences` | `notifications.manage_preferences` | Update email and category preferences (CSRF) |

### Phase 7 API Endpoints

#### Task Timers
| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `POST` | `/api/timers/start` | `timers.start` | Start an active task timer (CSRF, single-active-timer enforced) |
| `POST` | `/api/timers/:id/stop` | `timers.stop_own` | Stop active timer and convert elapsed time to draft work log (CSRF) |
| `GET` | `/api/timers/active` | `timers.view_own` | Get currently running timer for the authenticated user |
| `GET` | `/api/timers/:id` | `timers.view_own` | Get timer by ID |

#### Time Entries (Manual Work Logs)
| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `GET` | `/api/time-entries` | `time_entries.view_own` | List time entries (filters: `userId`, `projectId`, `taskId`, `startDate`, `endDate`, pagination) |
| `GET` | `/api/time-entries/:id` | `time_entries.view_own` | Get specific time entry details |
| `POST` | `/api/time-entries` | `time_entries.create` | Create a manual time entry (CSRF, duration & date validated) |
| `PUT` | `/api/time-entries/:id` | `time_entries.update_own` | Update draft time entry (locked once submitted or approved) (CSRF) |
| `DELETE` | `/api/time-entries/:id` | `time_entries.delete_own` | Delete draft time entry (CSRF) |

#### Timesheets
| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `GET` | `/api/timesheets` | `timesheets.view_own` | List timesheets (scoped to own or team/all based on permissions) |
| `GET` | `/api/timesheets/:id` | `timesheets.view_own` | Get timesheet details and associated work logs |
| `POST` | `/api/timesheets` | `timesheets.submit` | Prepare/create a timesheet for a reporting period (CSRF) |
| `POST` | `/api/timesheets/:id/submit` | `timesheets.submit` | Submit timesheet for manager review (locks draft entries) (CSRF) |
| `POST` | `/api/timesheets/:id/approve` | `timesheets.approve` | Approve timesheet (self-approval prohibited) (CSRF) |
| `POST` | `/api/timesheets/:id/reject` | `timesheets.reject` | Reject timesheet with required comment (unlocks entries) (CSRF) |
| `GET` | `/api/users/:id/timesheets` | `timesheets.view_team` | Get timesheets for a specific employee |

#### Time Summaries & Effort Breakdowns
| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `GET` | `/api/time-reports/summary` | `time_reports.view` | Overall agency tracked, billable, and non-billable summary |
| `GET` | `/api/projects/:id/time-summary` | `time_reports.view` | Project-level effort, billable hours, and task breakdown |
| `GET` | `/api/tasks/:id/time-summary` | `time_entries.view_own` | Task-level effort and billable breakdown |

### Phase 8 API Endpoints

#### Reporting Dashboard & Overview
| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `GET` | `/api/reports/dashboard` | `reports.view_dashboard` | Executive management KPI cards (12 metrics) & summary charts (date-range filtered) |

#### Project Performance Reports
| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `GET` | `/api/reports/projects` | `reports.view_projects` | Filterable project-level performance, milestone progress, and hours breakdown |
| `GET` | `/api/reports/projects/:id` | `reports.view_projects` | Detailed project drill-down with milestone and task metrics |

#### Task Performance Reports
| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `GET` | `/api/reports/tasks` | `reports.view_tasks` | Task performance breakdown with status, priority, and assignee filters |
| `GET` | `/api/reports/overdue-tasks` | `reports.view_tasks` | Overdue task list with days overdue calculations |
| `GET` | `/api/reports/task-completion` | `reports.view_tasks` | Task completion velocity trends over time |

#### Team Workload Reports
| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `GET` | `/api/reports/teams` | `reports.view_teams` | Team-level workload overview and task assignment counts |
| `GET` | `/api/reports/teams/:id` | `reports.view_teams` | Specific team drill-down with authorized member breakdown |

#### Time & Timesheet Reports
| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `GET` | `/api/reports/time-summary` | `reports.view_time` | Total, billable, non-billable, approved, and unapproved hour metrics |
| `GET` | `/api/reports/project-hours` | `reports.view_time` | Tracked hours breakdown grouped by project |
| `GET` | `/api/reports/employee-hours` | `reports.view_time` | Tracked hours breakdown grouped by employee (authorized users only) |

#### Client Reports
| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `GET` | `/api/reports/clients` | `reports.view_clients` | Client project overviews with strict client tenant isolation |

#### Data Exports (CSV & Excel XLSX)
| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `POST` | `/api/reports/exports` | `reports.export` | Generate secure CSV or Excel XLSX export with formula injection sanitization (CSRF) |
| `GET` | `/api/reports/exports/:id/download` | `reports.export` | Secure file download with audit logging and access scoping |

---

## 9. Running the Application & Automated Tests

### Start Backend (Port 5000)
```bash
cd server
npm run dev
```

### Start Frontend (Port 5173 or 5174)
```bash
cd client
npm run dev
```

### Run Full Test Suite
```bash
cd server
npm test
```
All **157 automated tests** pass across 8 test suites:
- `auth.test.js`: Authentication, JWT cookies, refresh rotation, reuse detection (17 tests)
- `rbac.test.js`: Custom roles, granular permissions, Owner protection (18 tests)
- `users_teams.test.js`: User management, invitations, status transitions, team leader rules, transactional memberships (21 tests)
- `projects.test.js`: Project creation, code uniqueness, PM and client validation, resource access control, milestone lifecycle, activity logging (20 tests)
- `tasks.test.js`: Task creation, multi-assignees, project isolation, workflow state transitions, reopening rules, subtasks, circular prevention, comments, attachments upload/download authorization, pagination (23 tests)
- `approvals_notifications.test.js`: Task review submission, self-approval prevention, revision requests, resubmissions, recipient isolation, unread counters, preferences, email queue processing, reminder idempotency (16 tests)
- `time_tracking.test.js`: Task timer start/stop, concurrent timer rejection, single active timer DB invariant, server elapsed calculation, manual work logs, duration validation, submitted/approved lock protections, weekly timesheets, manager review & self-approval prevention, billable breakdowns, audit logging, and transactional rollbacks (22 tests)
- `reports_analytics.test.js`: Management KPI calculations, date-range filtering, timezone boundary handling, project performance & milestone progress, overdue task days calculation, task velocity, team workload distribution, approved vs draft time isolation, client reporting isolation, query validation, spreadsheet formula injection sanitization (CWE-1236), Excel XLSX & CSV generation, and audit logging (20 tests)

---

## 10. Phase 8 Completion Confirmation

Phase 8 is fully implemented, verified, and tested. In accordance with strict development boundaries:
- **STOP after Phase 8.** Do not begin invoicing, payroll, or accounting modules until this phase has been reviewed and approved.


