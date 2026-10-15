/**
 * Centralized Permission Registry
 * Defines all available system permissions with human-readable metadata.
 */
export const PERMISSION_REGISTRY = [
  // Users Module
  {
    key: 'users.view',
    module: 'Users',
    action: 'view',
    label: 'View Users',
    description: 'Allows viewing user profiles and listings'
  },
  {
    key: 'users.create',
    module: 'Users',
    action: 'create',
    label: 'Create Users',
    description: 'Allows directly creating new user accounts'
  },
  {
    key: 'users.update',
    module: 'Users',
    action: 'update',
    label: 'Update Users',
    description: 'Allows editing user profile and contact details'
  },
  {
    key: 'users.delete',
    module: 'Users',
    action: 'delete',
    label: 'Delete Users',
    description: 'Allows deleting or removing user accounts'
  },
  {
    key: 'users.change_status',
    module: 'Users',
    action: 'change_status',
    label: 'Change User Status',
    description: 'Allows activating, deactivating, or suspending users'
  },
  {
    key: 'users.invite',
    module: 'Users',
    action: 'invite',
    label: 'Invite Users',
    description: 'Allows creating, resending, and revoking user invitations'
  },
  {
    key: 'users.manage_roles',
    module: 'Users',
    action: 'manage_roles',
    label: 'Manage User Roles',
    description: 'Allows assigning and removing user roles'
  },
  {
    key: 'users.view_teams',
    module: 'Users',
    action: 'view_teams',
    label: 'View User Teams',
    description: 'Allows viewing teams a user belongs to'
  },

  // Teams Module
  {
    key: 'teams.view',
    module: 'Teams',
    action: 'view',
    label: 'View Teams',
    description: 'Allows viewing agency teams and listings'
  },
  {
    key: 'teams.create',
    module: 'Teams',
    action: 'create',
    label: 'Create Teams',
    description: 'Allows creating new agency teams'
  },
  {
    key: 'teams.update',
    module: 'Teams',
    action: 'update',
    label: 'Update Teams',
    description: 'Allows editing team information and description'
  },
  {
    key: 'teams.delete',
    module: 'Teams',
    action: 'delete',
    label: 'Delete Teams',
    description: 'Allows archiving or removing agency teams'
  },
  {
    key: 'teams.view_members',
    module: 'Teams',
    action: 'view_members',
    label: 'View Team Members',
    description: 'Allows viewing members of agency teams'
  },
  {
    key: 'teams.manage_members',
    module: 'Teams',
    action: 'manage_members',
    label: 'Manage Team Members',
    description: 'Allows adding and removing members from teams'
  },
  {
    key: 'teams.assign_leader',
    module: 'Teams',
    action: 'assign_leader',
    label: 'Assign Team Leader',
    description: 'Allows designating or changing the leader of a team'
  },

  // Roles Module
  {
    key: 'roles.view',
    module: 'Roles',
    action: 'view',
    label: 'View Roles',
    description: 'Allows viewing roles and assigned permissions'
  },
  {
    key: 'roles.create',
    module: 'Roles',
    action: 'create',
    label: 'Create Roles',
    description: 'Allows creating new custom agency roles'
  },
  {
    key: 'roles.update',
    module: 'Roles',
    action: 'update',
    label: 'Update Roles',
    description: 'Allows modifying custom role definitions'
  },
  {
    key: 'roles.delete',
    module: 'Roles',
    action: 'delete',
    label: 'Delete Roles',
    description: 'Allows removing custom roles'
  },
  {
    key: 'roles.assign_permissions',
    module: 'Roles',
    action: 'assign_permissions',
    label: 'Assign Permissions',
    description: 'Allows modifying permission sets for custom roles'
  },
  {
    key: 'roles.assign_users',
    module: 'Roles',
    action: 'assign_users',
    label: 'Assign User Roles',
    description: 'Allows assigning or changing roles for users'
  },

  // Permissions Module
  {
    key: 'permissions.view',
    module: 'Permissions',
    action: 'view',
    label: 'View Permissions',
    description: 'Allows viewing the available permission registry'
  },

  // Settings Module
  {
    key: 'settings.view',
    module: 'Settings',
    action: 'view',
    label: 'View Settings',
    description: 'Allows viewing system and workspace configurations'
  },
  {
    key: 'settings.update',
    module: 'Settings',
    action: 'update',
    label: 'Update Settings',
    description: 'Allows modifying system and workspace configurations'
  },

  // Projects Module
  {
    key: 'projects.view',
    module: 'Projects',
    action: 'view',
    label: 'View Projects',
    description: 'Allows viewing agency projects directory and details'
  },
  {
    key: 'projects.create',
    module: 'Projects',
    action: 'create',
    label: 'Create Projects',
    description: 'Allows creating new agency projects'
  },
  {
    key: 'projects.update',
    module: 'Projects',
    action: 'update',
    label: 'Update Projects',
    description: 'Allows editing project metadata, dates, and specifications'
  },
  {
    key: 'projects.delete',
    module: 'Projects',
    action: 'delete',
    label: 'Delete Projects',
    description: 'Allows removing agency projects'
  },
  {
    key: 'projects.archive',
    module: 'Projects',
    action: 'archive',
    label: 'Archive Projects',
    description: 'Allows archiving completed or cancelled projects'
  },
  {
    key: 'projects.assign_manager',
    module: 'Projects',
    action: 'assign_manager',
    label: 'Assign Project Manager',
    description: 'Allows designating or changing the project manager'
  },
  {
    key: 'projects.manage_members',
    module: 'Projects',
    action: 'manage_members',
    label: 'Manage Project Members',
    description: 'Allows adding and removing individual project members'
  },
  {
    key: 'projects.manage_teams',
    module: 'Projects',
    action: 'manage_teams',
    label: 'Manage Project Teams',
    description: 'Allows assigning or removing participating teams from a project'
  },
  {
    key: 'projects.manage_clients',
    module: 'Projects',
    action: 'manage_clients',
    label: 'Manage Project Clients',
    description: 'Allows assigning or updating client associations for projects'
  },
  {
    key: 'projects.change_status',
    module: 'Projects',
    action: 'change_status',
    label: 'Change Project Status',
    description: 'Allows transitioning project lifecycle status'
  },
  {
    key: 'projects.view_activity',
    module: 'Projects',
    action: 'view_activity',
    label: 'View Project Activity',
    description: 'Allows viewing detailed activity and audit logs for projects'
  },

  // Milestones Module
  {
    key: 'milestones.view',
    module: 'Milestones',
    action: 'view',
    label: 'View Milestones',
    description: 'Allows viewing project milestones and deliverable timelines'
  },
  {
    key: 'milestones.create',
    module: 'Milestones',
    action: 'create',
    label: 'Create Milestones',
    description: 'Allows adding milestones to projects'
  },
  {
    key: 'milestones.update',
    module: 'Milestones',
    action: 'update',
    label: 'Update Milestones',
    description: 'Allows editing milestone title, description, and target dates'
  },
  {
    key: 'milestones.delete',
    module: 'Milestones',
    action: 'delete',
    label: 'Delete Milestones',
    description: 'Allows removing milestones from projects'
  },
  {
    key: 'milestones.complete',
    module: 'Milestones',
    action: 'complete',
    label: 'Complete Milestones',
    description: 'Allows marking milestones as completed or resolved'
  },
  {
    key: 'milestones.reorder',
    module: 'Milestones',
    action: 'reorder',
    label: 'Reorder Milestones',
    description: 'Allows updating the display order of project milestones'
  },

  // Clients Module
  {
    key: 'clients.view',
    module: 'Clients',
    action: 'view',
    label: 'View Clients',
    description: 'Allows viewing clients directory and details'
  },
  {
    key: 'clients.create',
    module: 'Clients',
    action: 'create',
    label: 'Create Clients',
    description: 'Allows creating new agency client profiles'
  },
  {
    key: 'clients.update',
    module: 'Clients',
    action: 'update',
    label: 'Update Clients',
    description: 'Allows editing client profiles and contacts'
  },
  {
    key: 'clients.delete',
    module: 'Clients',
    action: 'delete',
    label: 'Delete Clients',
    description: 'Allows archiving or deleting client records'
  },

  // Tasks Module
  {
    key: 'tasks.view',
    module: 'Tasks',
    action: 'view',
    label: 'View Tasks',
    description: 'Allows viewing tasks in accessible projects'
  },
  {
    key: 'tasks.create',
    module: 'Tasks',
    action: 'create',
    label: 'Create Tasks',
    description: 'Allows creating tasks in accessible projects'
  },
  {
    key: 'tasks.update',
    module: 'Tasks',
    action: 'update',
    label: 'Update Tasks',
    description: 'Allows editing task details, deadlines, and descriptions'
  },
  {
    key: 'tasks.delete',
    module: 'Tasks',
    action: 'delete',
    label: 'Delete Tasks',
    description: 'Allows removing tasks'
  },
  {
    key: 'tasks.assign',
    module: 'Tasks',
    action: 'assign',
    label: 'Assign Tasks',
    description: 'Allows assigning and reassigning task assignees'
  },
  {
    key: 'tasks.change_status',
    module: 'Tasks',
    action: 'change_status',
    label: 'Change Task Status',
    description: 'Allows transitioning task workflow statuses'
  },
  {
    key: 'tasks.reopen',
    module: 'Tasks',
    action: 'reopen',
    label: 'Reopen Tasks',
    description: 'Allows reopening completed tasks'
  },
  {
    key: 'tasks.archive',
    module: 'Tasks',
    action: 'archive',
    label: 'Archive Tasks',
    description: 'Allows archiving tasks'
  },
  {
    key: 'tasks.view_all',
    module: 'Tasks',
    action: 'view_all',
    label: 'View All Tasks',
    description: 'Allows viewing all tasks across all agency projects'
  },
  {
    key: 'tasks.manage_all',
    module: 'Tasks',
    action: 'manage_all',
    label: 'Manage All Tasks',
    description: 'Allows full administrative control across all agency tasks'
  },

  // Subtasks Module
  {
    key: 'subtasks.view',
    module: 'Subtasks',
    action: 'view',
    label: 'View Subtasks',
    description: 'Allows viewing nested subtasks'
  },
  {
    key: 'subtasks.create',
    module: 'Subtasks',
    action: 'create',
    label: 'Create Subtasks',
    description: 'Allows adding subtasks to tasks'
  },
  {
    key: 'subtasks.update',
    module: 'Subtasks',
    action: 'update',
    label: 'Update Subtasks',
    description: 'Allows updating subtask status and title'
  },
  {
    key: 'subtasks.delete',
    module: 'Subtasks',
    action: 'delete',
    label: 'Delete Subtasks',
    description: 'Allows deleting subtasks'
  },

  // Task Comments Module
  {
    key: 'task_comments.view',
    module: 'Comments',
    action: 'view',
    label: 'View Task Comments',
    description: 'Allows reading task discussions and comments'
  },
  {
    key: 'task_comments.create',
    module: 'Comments',
    action: 'create',
    label: 'Post Task Comments',
    description: 'Allows posting comments on accessible tasks'
  },
  {
    key: 'task_comments.update_own',
    module: 'Comments',
    action: 'update_own',
    label: 'Edit Own Comments',
    description: 'Allows editing comments posted by oneself'
  },
  {
    key: 'task_comments.delete_own',
    module: 'Comments',
    action: 'delete_own',
    label: 'Delete Own Comments',
    description: 'Allows deleting comments posted by oneself'
  },
  {
    key: 'task_comments.moderate',
    module: 'Comments',
    action: 'moderate',
    label: 'Moderate Comments',
    description: 'Allows editing or deleting any task comments'
  },

  // Task Attachments Module
  {
    key: 'task_attachments.view',
    module: 'Attachments',
    action: 'view',
    label: 'View Attachments',
    description: 'Allows viewing and downloading task attachments'
  },
  {
    key: 'task_attachments.upload',
    module: 'Attachments',
    action: 'upload',
    label: 'Upload Attachments',
    description: 'Allows uploading file attachments to tasks'
  },
  {
    key: 'task_attachments.delete_own',
    module: 'Attachments',
    action: 'delete_own',
    label: 'Delete Own Attachments',
    description: 'Allows deleting attachments uploaded by oneself'
  },
  {
    key: 'task_attachments.manage',
    module: 'Attachments',
    action: 'manage',
    label: 'Manage Attachments',
    description: 'Allows administrative management of task attachments'
  },

  // Task Approvals Module
  {
    key: 'approvals.view',
    module: 'Approvals',
    action: 'view',
    label: 'View Approvals',
    description: 'Allows viewing task review requests and approval decisions'
  },
  {
    key: 'approvals.submit',
    module: 'Approvals',
    action: 'submit',
    label: 'Submit for Review',
    description: 'Allows submitting tasks for management review and signoff'
  },
  {
    key: 'approvals.review',
    module: 'Approvals',
    action: 'review',
    label: 'Review Submissions',
    description: 'Allows reviewing submitted task deliverables'
  },
  {
    key: 'approvals.approve',
    module: 'Approvals',
    action: 'approve',
    label: 'Approve Tasks',
    description: 'Allows approving tasks and completing workflow review'
  },
  {
    key: 'approvals.request_revision',
    module: 'Approvals',
    action: 'request_revision',
    label: 'Request Revisions',
    description: 'Allows sending tasks back to in-progress with revision notes'
  },
  {
    key: 'approvals.cancel',
    module: 'Approvals',
    action: 'cancel',
    label: 'Cancel Review Request',
    description: 'Allows cancelling pending review requests and retracting submissions'
  },

  // Deliverables & Client Approvals Module (Phase 5)
  {
    key: 'deliverables.view',
    module: 'Deliverables',
    action: 'view',
    label: 'View Deliverables',
    description: 'Allows viewing task deliverables, submission versions, and review status'
  },
  {
    key: 'deliverables.submit',
    module: 'Deliverables',
    action: 'submit',
    label: 'Submit Deliverable',
    description: 'Allows submitting work for internal review or submitting revised work'
  },
  {
    key: 'deliverables.review_internal',
    module: 'Deliverables',
    action: 'review_internal',
    label: 'Internal Deliverable Review',
    description: 'Allows Account Managers and reviewers to approve work internally or request changes'
  },
  {
    key: 'deliverables.submit_client',
    module: 'Deliverables',
    action: 'submit_client',
    label: 'Submit to Client Portal',
    description: 'Allows publishing internally approved deliverables to client portal for client approval'
  },
  {
    key: 'deliverables.review_client',
    module: 'Deliverables',
    action: 'review_client',
    label: 'Client Deliverable Approval',
    description: 'Allows client users to approve deliverables in client portal'
  },
  {
    key: 'deliverables.request_revision',
    module: 'Deliverables',
    action: 'request_revision',
    label: 'Request Revision',
    description: 'Allows requesting revisions on deliverables with mandatory explanation'
  },

  // Support Tickets Module (Phase 6)
  {
    key: 'tickets.view',
    module: 'Support Tickets',
    action: 'view',
    label: 'View Support Tickets',
    description: 'Allows viewing support tickets and conversations within permitted scope'
  },
  {
    key: 'tickets.create',
    module: 'Support Tickets',
    action: 'create',
    label: 'Create Support Ticket',
    description: 'Allows creating support tickets through client portal or agency desk'
  },
  {
    key: 'tickets.assign',
    module: 'Support Tickets',
    action: 'assign',
    label: 'Assign Support Tickets',
    description: 'Allows assigning or reassigning tickets to Account Managers or employees'
  },
  {
    key: 'tickets.update',
    module: 'Support Tickets',
    action: 'update',
    label: 'Update Support Ticket',
    description: 'Allows updating ticket status, priority, and category'
  },
  {
    key: 'tickets.reply',
    module: 'Support Tickets',
    action: 'reply',
    label: 'Reply to Support Ticket',
    description: 'Allows adding client-visible messages to support tickets'
  },
  {
    key: 'tickets.internal_note',
    module: 'Support Tickets',
    action: 'internal_note',
    label: 'Add Internal Ticket Note',
    description: 'Allows adding internal-only notes to tickets hidden from clients'
  },
  {
    key: 'tickets.resolve',
    module: 'Support Tickets',
    action: 'resolve',
    label: 'Resolve / Close Support Ticket',
    description: 'Allows marking tickets as resolved or closed, or reopening them'
  },

  // Quotations Module (Phase 6)
  {
    key: 'quotations.view',
    module: 'Quotations',
    action: 'view',
    label: 'View Quotations',
    description: 'Allows viewing quotations within permitted client or agency scope'
  },
  {
    key: 'quotations.create',
    module: 'Quotations',
    action: 'create',
    label: 'Create Quotations',
    description: 'Allows drafting quotations with line items and financial calculations'
  },
  {
    key: 'quotations.update',
    module: 'Quotations',
    action: 'update',
    label: 'Update Quotations',
    description: 'Allows editing draft quotations and preparing revised versions'
  },
  {
    key: 'quotations.issue',
    module: 'Quotations',
    action: 'issue',
    label: 'Issue Quotations',
    description: 'Allows issuing quotations and making them available to the client portal'
  },
  {
    key: 'quotations.review_client',
    module: 'Quotations',
    action: 'review_client',
    label: 'Accept / Reject Quotation',
    description: 'Allows clients to accept or reject quotations addressed to them'
  },
  {
    key: 'quotations.convert',
    module: 'Quotations',
    action: 'convert',
    label: 'Convert Quotation to Invoice',
    description: 'Allows converting accepted quotations into issued invoices'
  },

  // Invoices Module (Phase 6)
  {
    key: 'invoices.view',
    module: 'Invoices',
    action: 'view',
    label: 'View Invoices',
    description: 'Allows viewing invoices, payment terms, and outstanding balances'
  },
  {
    key: 'invoices.create',
    module: 'Invoices',
    action: 'create',
    label: 'Create Invoices',
    description: 'Allows creating standalone invoices or amending invoice drafts'
  },
  {
    key: 'invoices.issue',
    module: 'Invoices',
    action: 'issue',
    label: 'Issue Invoices',
    description: 'Allows issuing invoices for client payment and record keeping'
  },
  {
    key: 'invoices.void',
    module: 'Invoices',
    action: 'void',
    label: 'Void Invoices',
    description: 'Allows voiding eligible invoices through authorized administrative workflow'
  },

  // Payments Module (Phase 6)
  {
    key: 'payments.view',
    module: 'Payments',
    action: 'view',
    label: 'View Payments',
    description: 'Allows viewing payment history, receipts, and transaction records'
  },
  {
    key: 'payments.record',
    module: 'Payments',
    action: 'record',
    label: 'Record Payments',
    description: 'Allows recording manual payments, bank transfers, and receipts against invoices'
  },

  // Notifications Module
  {
    key: 'notifications.view',
    module: 'Notifications',
    action: 'view',
    label: 'View Notifications',
    description: 'Allows viewing personal in-app notifications and alerts'
  },
  {
    key: 'notifications.manage_own',
    module: 'Notifications',
    action: 'manage_own',
    label: 'Manage Own Notifications',
    description: 'Allows marking personal notifications as read or deleting them'
  },
  {
    key: 'notifications.manage_preferences',
    module: 'Notifications',
    action: 'manage_preferences',
    label: 'Manage Notification Preferences',
    description: 'Allows configuring notification categories and email delivery'
  },
  {
    key: 'notification_settings.view',
    module: 'Notifications',
    action: 'view_settings',
    label: 'View Notification Settings',
    description: 'Allows viewing agency-wide notification and reminder configurations'
  },
  {
    key: 'notification_settings.update',
    module: 'Notifications',
    action: 'update_settings',
    label: 'Update Notification Settings',
    description: 'Allows managing agency-wide notification rules'
  },

  // Time Entries Module
  {
    key: 'time_entries.view_own',
    module: 'Time Tracking',
    action: 'view_own',
    label: 'View Own Time Entries',
    description: 'Allows viewing own recorded time entries and work logs'
  },
  {
    key: 'time_entries.create',
    module: 'Time Tracking',
    action: 'create',
    label: 'Log Time',
    description: 'Allows recording manual work time entries'
  },
  {
    key: 'time_entries.update_own',
    module: 'Time Tracking',
    action: 'update_own',
    label: 'Update Own Time Entries',
    description: 'Allows modifying own draft time entries'
  },
  {
    key: 'time_entries.delete_own',
    module: 'Time Tracking',
    action: 'delete_own',
    label: 'Delete Own Time Entries',
    description: 'Allows deleting own draft time entries'
  },
  {
    key: 'time_entries.view_all',
    module: 'Time Tracking',
    action: 'view_all',
    label: 'View All Time Entries',
    description: 'Allows viewing time entries across all agency members'
  },
  {
    key: 'time_entries.manage_all',
    module: 'Time Tracking',
    action: 'manage_all',
    label: 'Manage All Time Entries',
    description: 'Allows administrative management of all agency time entries'
  },

  // Timers Module
  {
    key: 'timers.start',
    module: 'Time Tracking',
    action: 'start_timer',
    label: 'Start Task Timer',
    description: 'Allows starting an active timer on assigned tasks'
  },
  {
    key: 'timers.stop_own',
    module: 'Time Tracking',
    action: 'stop_timer',
    label: 'Stop Own Timer',
    description: 'Allows stopping and saving elapsed timer logs'
  },
  {
    key: 'timers.view_own',
    module: 'Time Tracking',
    action: 'view_timer',
    label: 'View Own Active Timer',
    description: 'Allows querying and monitoring own running timer'
  },
  {
    key: 'timers.manage_all',
    module: 'Time Tracking',
    action: 'manage_timers',
    label: 'Manage All Timers',
    description: 'Allows administrative oversight of all running timers'
  },

  // Timesheets Module
  {
    key: 'timesheets.view_own',
    module: 'Timesheets',
    action: 'view_own',
    label: 'View Own Timesheets',
    description: 'Allows viewing own period timesheet reports'
  },
  {
    key: 'timesheets.submit',
    module: 'Timesheets',
    action: 'submit',
    label: 'Submit Timesheets',
    description: 'Allows submitting period timesheets for manager approval'
  },
  {
    key: 'timesheets.view_team',
    module: 'Timesheets',
    action: 'view_team',
    label: 'View Team Timesheets',
    description: 'Allows viewing timesheets for supervised team members'
  },
  {
    key: 'timesheets.review',
    module: 'Timesheets',
    action: 'review',
    label: 'Review Timesheets',
    description: 'Allows evaluating submitted timesheets'
  },
  {
    key: 'timesheets.approve',
    module: 'Timesheets',
    action: 'approve',
    label: 'Approve Timesheets',
    description: 'Allows approving employee timesheets'
  },
  {
    key: 'timesheets.reject',
    module: 'Timesheets',
    action: 'reject',
    label: 'Reject Timesheets',
    description: 'Allows rejecting submitted timesheets with feedback'
  },
  {
    key: 'timesheets.manage_all',
    module: 'Timesheets',
    action: 'manage_all',
    label: 'Manage All Timesheets',
    description: 'Allows administrative oversight across all agency timesheets'
  },

  // Time Reports Module
  {
    key: 'time_reports.view',
    module: 'Time Reports',
    action: 'view',
    label: 'View Time Reports',
    description: 'Allows viewing time tracking summaries and project effort breakdowns'
  },

  // Phase 8: Reports & Analytics Module
  {
    key: 'reports.view_dashboard',
    module: 'Reports',
    action: 'view_dashboard',
    label: 'View Reporting Dashboard',
    description: 'Allows viewing analytics dashboard, KPI metrics, and charts'
  },
  {
    key: 'reports.view_projects',
    module: 'Reports',
    action: 'view_projects',
    label: 'View Project Performance Reports',
    description: 'Allows viewing project performance, milestones, and task metrics'
  },
  {
    key: 'reports.view_tasks',
    module: 'Reports',
    action: 'view_tasks',
    label: 'View Task Performance Reports',
    description: 'Allows viewing task completion, overdue trends, and priority reports'
  },
  {
    key: 'reports.view_teams',
    module: 'Reports',
    action: 'view_teams',
    label: 'View Team Workload Reports',
    description: 'Allows viewing team workloads, task distribution, and tracked hours'
  },
  {
    key: 'reports.view_time',
    module: 'Reports',
    action: 'view_time',
    label: 'View Time & Timesheet Reports',
    description: 'Allows viewing billable, approved, and unapproved hours reports'
  },
  {
    key: 'reports.view_clients',
    module: 'Reports',
    action: 'view_clients',
    label: 'View Client Reports',
    description: 'Allows viewing client project summaries and deliverables'
  },
  {
    key: 'reports.export',
    module: 'Reports',
    action: 'export',
    label: 'Export Reports',
    description: 'Allows exporting reports to CSV and Excel XLSX formats'
  },
  {
    key: 'reports.view_all',
    module: 'Reports',
    action: 'view_all',
    label: 'View All Agency Reports',
    description: 'Allows unrestricted reporting access across all agency projects, teams, and employees'
  },

  // Phase 1 / D-Grow OS: Services & Workflows Module
  {
    key: 'services.view',
    module: 'Services',
    action: 'view',
    label: 'View Services',
    description: 'Allows viewing client services and service instances'
  },
  {
    key: 'services.bundle',
    module: 'Services',
    action: 'bundle',
    label: 'Bundle Services',
    description: 'Allows bundling services onto clients and triggering workflows'
  },
  {
    key: 'services.manage',
    module: 'Services',
    action: 'manage',
    label: 'Manage Services',
    description: 'Allows pausing, completing, or cancelling service instances'
  },
  {
    key: 'lifecycle.view',
    module: 'Lifecycle',
    action: 'view',
    label: 'View Client Lifecycle',
    description: 'Allows viewing Universal Client Lifecycle stages (L0-L6)'
  },
  {
    key: 'lifecycle.update',
    module: 'Lifecycle',
    action: 'update',
    label: 'Update Client Lifecycle',
    description: 'Allows transitioning client lifecycle stages'
  },

  // Phase 1 / D-Grow OS: Leads & BD Pipelines Module
  {
    key: 'leads.view',
    module: 'Leads',
    action: 'view',
    label: 'View Leads',
    description: 'Allows viewing leads across the 3 separate BD pipelines'
  },
  {
    key: 'leads.create',
    module: 'Leads',
    action: 'create',
    label: 'Create Leads',
    description: 'Allows adding new leads to BD pipelines'
  },
  {
    key: 'leads.update',
    module: 'Leads',
    action: 'update',
    label: 'Update Leads',
    description: 'Allows modifying lead details and advancing pipeline stages'
  },
  {
    key: 'leads.convert',
    module: 'Leads',
    action: 'convert',
    label: 'Convert Leads',
    description: 'Allows converting won leads into clients'
  },

  // D-Grow OS Phase 1: Departments Module
  {
    key: 'departments.view',
    module: 'Departments',
    action: 'view',
    label: 'View Departments',
    description: 'Allows viewing agency departments, member lists, and active presets'
  },
  {
    key: 'departments.create',
    module: 'Departments',
    action: 'create',
    label: 'Create Departments',
    description: 'Allows creating new agency departments'
  },
  {
    key: 'departments.update',
    module: 'Departments',
    action: 'update',
    label: 'Update Departments',
    description: 'Allows editing department name, description, status, and department manager'
  },
  {
    key: 'departments.delete',
    module: 'Departments',
    action: 'delete',
    label: 'Delete/Archive Departments',
    description: 'Allows archiving or deleting agency departments'
  },
  {
    key: 'departments.manage_members',
    module: 'Departments',
    action: 'manage_members',
    label: 'Manage Department Members',
    description: 'Allows assigning and removing employees from departments'
  },

  // D-Grow OS Phase 1: Workflow Presets Module
  {
    key: 'workflows.view',
    module: 'Workflows',
    action: 'view',
    label: 'View Workflow Presets',
    description: 'Allows viewing department workflow presets, stages, and task templates'
  },
  {
    key: 'workflows.create',
    module: 'Workflows',
    action: 'create',
    label: 'Create Workflow Presets',
    description: 'Allows creating new draft workflow presets and version drafts'
  },
  {
    key: 'workflows.update',
    module: 'Workflows',
    action: 'update',
    label: 'Update Workflow Presets',
    description: 'Allows editing draft preset stages, task templates, and dependencies'
  },
  {
    key: 'workflows.validate',
    module: 'Workflows',
    action: 'validate',
    label: 'Validate Workflow Presets',
    description: 'Allows running automated lifecycle validations on workflow versions'
  },
  {
    key: 'workflows.publish',
    module: 'Workflows',
    action: 'publish',
    label: 'Publish Workflow Presets',
    description: 'Allows publishing validated workflow presets making them immutable'
  },
  {
    key: 'workflows.archive',
    module: 'Workflows',
    action: 'archive',
    label: 'Archive Workflow Presets',
    description: 'Allows archiving published or draft workflow presets'
  },
  {
    key: 'workflows.execute',
    module: 'Workflows',
    action: 'execute',
    label: 'Execute Workflow Automations',
    description: 'Allows previewing, initializing, executing, and retrying workflow automations'
  },

  // D-Grow OS Phase 2: Client Management & Lifecycle Module
  {
    key: 'clients.view',
    module: 'Clients',
    action: 'view',
    label: 'View Clients',
    description: 'Allows viewing clients directory, dashboard, and profiles'
  },
  {
    key: 'clients.create',
    module: 'Clients',
    action: 'create',
    label: 'Create Clients',
    description: 'Allows registering and onboarding new clients'
  },
  {
    key: 'clients.update',
    module: 'Clients',
    action: 'update',
    label: 'Update Clients',
    description: 'Allows editing client details, business information, and operational notes'
  },
  {
    key: 'clients.delete',
    module: 'Clients',
    action: 'delete',
    label: 'Delete/Archive Clients',
    description: 'Allows deleting, archiving, or offboarding clients'
  },
  {
    key: 'clients.manage_contacts',
    module: 'Clients',
    action: 'manage_contacts',
    label: 'Manage Client Contacts',
    description: 'Allows managing multiple client contacts and portal access'
  },
  {
    key: 'clients.assign_am',
    module: 'Clients',
    action: 'assign_am',
    label: 'Assign Account Manager',
    description: 'Allows assigning and reassigning client Account Managers and onboarding owners'
  },
  {
    key: 'clients.manage_onboarding',
    module: 'Clients',
    action: 'manage_onboarding',
    label: 'Manage Onboarding Checklist',
    description: 'Allows managing client onboarding checklist items and tracking completion'
  },
  {
    key: 'clients.manage_services',
    module: 'Clients',
    action: 'manage_services',
    label: 'Manage Client Services',
    description: 'Allows configuring client services, presets, scope, and deliverables'
  },
  {
    key: 'clients.manage_documents',
    module: 'Clients',
    action: 'manage_documents',
    label: 'Manage Client Documents',
    description: 'Allows uploading, viewing, and managing client files and documents'
  },
  {
    key: 'clients.export',
    module: 'Clients',
    action: 'export',
    label: 'Export Clients',
    description: 'Allows exporting client listings and lifecycle records'
  },

  // D-Grow OS Phase 7: Internal Team Chat & Real-Time Communication
  {
    key: 'chat.view',
    module: 'Chat',
    action: 'view',
    label: 'View Chat',
    description: 'Allows accessing the internal team chat interface and viewing conversation history'
  },
  {
    key: 'chat.create_direct',
    module: 'Chat',
    action: 'create_direct',
    label: 'Create Direct Messages',
    description: 'Allows starting 1:1 direct conversations with internal team members'
  },
  {
    key: 'chat.create_group',
    module: 'Chat',
    action: 'create_group',
    label: 'Create Group Conversations',
    description: 'Allows creating custom group chat conversations'
  },
  {
    key: 'chat.send',
    module: 'Chat',
    action: 'send',
    label: 'Send Messages',
    description: 'Allows sending messages, attachments, and replies in conversations'
  },
  {
    key: 'chat.manage_members',
    module: 'Chat',
    action: 'manage_members',
    label: 'Manage Conversation Members',
    description: 'Allows adding and removing members in group conversations'
  },

  // Client Content & Work Calendar Module
  {
    key: 'calendar.view',
    module: 'Calendar',
    action: 'view',
    label: 'View Calendar',
    description: 'Allows viewing client monthly content and work schedule'
  },
  {
    key: 'calendar.create',
    module: 'Calendar',
    action: 'create',
    label: 'Create Calendar Events',
    description: 'Allows scheduling posts, shoots, SEO activities, and meetings'
  },
  {
    key: 'calendar.update',
    module: 'Calendar',
    action: 'update',
    label: 'Update Calendar Events',
    description: 'Allows editing dates, assignees, formats, and recurrence series'
  },
  {
    key: 'calendar.delete',
    module: 'Calendar',
    action: 'delete',
    label: 'Delete Calendar Events',
    description: 'Allows removing or cancelling calendar events and recurring series'
  },
  {
    key: 'calendar.publish',
    module: 'Calendar',
    action: 'publish',
    label: 'Record Publication',
    description: 'Allows confirming live publication with URL and notes'
  }
];

/**
 * Initial Default System Roles
 */
export const DEFAULT_SYSTEM_ROLES = [
  {
    name: 'Owner',
    slug: 'owner',
    description: 'Ultimate organization authority with full unrestricted access to all modules and configurations.',
    is_system: true,
    allPermissions: true
  },
  {
    name: 'Admin',
    slug: 'admin',
    description: 'Administrative access for managing users, teams, roles, permissions, projects, tasks, and workspace settings.',
    is_system: true,
    permissionKeys: [
      'users.view', 'users.create', 'users.update', 'users.change_status', 'users.invite', 'users.manage_roles', 'users.view_teams',
      'teams.view', 'teams.create', 'teams.update', 'teams.delete', 'teams.view_members', 'teams.manage_members', 'teams.assign_leader',
      'departments.view', 'departments.create', 'departments.update', 'departments.delete', 'departments.manage_members',
      'workflows.view', 'workflows.create', 'workflows.update', 'workflows.validate', 'workflows.publish', 'workflows.archive', 'workflows.execute',
      'projects.view', 'projects.create', 'projects.update', 'projects.delete', 'projects.archive', 'projects.assign_manager', 'projects.manage_members', 'projects.manage_teams', 'projects.manage_clients', 'projects.change_status', 'projects.view_activity',
      'milestones.view', 'milestones.create', 'milestones.update', 'milestones.delete', 'milestones.complete', 'milestones.reorder',
      'clients.view', 'clients.create', 'clients.update', 'clients.delete', 'clients.manage_contacts', 'clients.assign_am', 'clients.manage_onboarding', 'clients.manage_services', 'clients.manage_documents', 'clients.export',
      'services.view', 'services.bundle', 'services.manage', 'lifecycle.view', 'lifecycle.update',
      'tasks.view', 'tasks.create', 'tasks.update', 'tasks.delete', 'tasks.assign', 'tasks.change_status', 'tasks.reopen', 'tasks.archive', 'tasks.view_all', 'tasks.manage_all',
      'subtasks.view', 'subtasks.create', 'subtasks.update', 'subtasks.delete',
      'task_comments.view', 'task_comments.create', 'task_comments.update_own', 'task_comments.delete_own', 'task_comments.moderate',
      'task_attachments.view', 'task_attachments.upload', 'task_attachments.delete_own', 'task_attachments.manage',
      'approvals.view', 'approvals.submit', 'approvals.review', 'approvals.approve', 'approvals.request_revision', 'approvals.cancel',
      'deliverables.view', 'deliverables.submit', 'deliverables.review_internal', 'deliverables.submit_client', 'deliverables.review_client', 'deliverables.request_revision',
      'tickets.view', 'tickets.create', 'tickets.assign', 'tickets.update', 'tickets.reply', 'tickets.internal_note', 'tickets.resolve',
      'quotations.view', 'quotations.create', 'quotations.update', 'quotations.issue', 'quotations.review_client', 'quotations.convert',
      'invoices.view', 'invoices.create', 'invoices.issue', 'invoices.void',
      'payments.view', 'payments.record',
      'chat.view', 'chat.create_direct', 'chat.create_group', 'chat.send', 'chat.manage_members',
      'notifications.view', 'notifications.manage_own', 'notifications.manage_preferences',
      'notification_settings.view', 'notification_settings.update',
      'time_entries.view_own', 'time_entries.create', 'time_entries.update_own', 'time_entries.delete_own', 'time_entries.view_all', 'time_entries.manage_all',
      'timers.start', 'timers.stop_own', 'timers.view_own', 'timers.manage_all',
      'timesheets.view_own', 'timesheets.submit', 'timesheets.view_team', 'timesheets.review', 'timesheets.approve', 'timesheets.reject', 'timesheets.manage_all',
      'time_reports.view',
      'reports.view_dashboard', 'reports.view_projects', 'reports.view_tasks', 'reports.view_teams', 'reports.view_time', 'reports.view_clients', 'reports.export', 'reports.view_all',
      'roles.view', 'roles.create', 'roles.update', 'roles.delete', 'roles.assign_permissions', 'roles.assign_users',
      'permissions.view',
      'calendar.view', 'calendar.create', 'calendar.update', 'calendar.delete', 'calendar.publish',
      'settings.view', 'settings.update'
    ]
  },
  {
    name: 'Project Manager',
    slug: 'project-manager',
    description: 'Operational lead coordinating projects, deliverables, milestones, tasks, resources, and teams.',
    is_system: true,
    permissionKeys: [
      'users.view', 'users.view_teams',
      'teams.view', 'teams.view_members', 'teams.manage_members',
      'departments.view',
      'workflows.view', 'workflows.create', 'workflows.update', 'workflows.validate', 'workflows.execute',
      'projects.view', 'projects.create', 'projects.update', 'projects.archive', 'projects.manage_members', 'projects.manage_teams', 'projects.change_status', 'projects.view_activity',
      'milestones.view', 'milestones.create', 'milestones.update', 'milestones.delete', 'milestones.complete', 'milestones.reorder',
      'clients.view',
      'tasks.view', 'tasks.create', 'tasks.update', 'tasks.delete', 'tasks.assign', 'tasks.change_status', 'tasks.reopen', 'tasks.archive',
      'subtasks.view', 'subtasks.create', 'subtasks.update', 'subtasks.delete',
      'task_comments.view', 'task_comments.create', 'task_comments.update_own', 'task_comments.delete_own', 'task_comments.moderate',
      'task_attachments.view', 'task_attachments.upload', 'task_attachments.delete_own', 'task_attachments.manage',
      'approvals.view', 'approvals.submit', 'approvals.review', 'approvals.approve', 'approvals.request_revision', 'approvals.cancel',
      'deliverables.view', 'deliverables.submit', 'deliverables.review_internal', 'deliverables.submit_client', 'deliverables.review_client', 'deliverables.request_revision',
      'tickets.view', 'tickets.update', 'tickets.reply', 'tickets.internal_note',
      'quotations.view',
      'invoices.view',
      'payments.view',
      'chat.view', 'chat.create_direct', 'chat.create_group', 'chat.send', 'chat.manage_members',
      'notifications.view', 'notifications.manage_own', 'notifications.manage_preferences',
      'notification_settings.view', 'notification_settings.update',
      'time_entries.view_own', 'time_entries.create', 'time_entries.update_own', 'time_entries.delete_own', 'time_entries.view_all',
      'timers.start', 'timers.stop_own', 'timers.view_own',
      'timesheets.view_own', 'timesheets.submit', 'timesheets.view_team', 'timesheets.review', 'timesheets.approve', 'timesheets.reject',
      'time_reports.view',
      'reports.view_dashboard', 'reports.view_projects', 'reports.view_tasks', 'reports.view_teams', 'reports.view_time', 'reports.view_clients', 'reports.export',
      'roles.view',
      'permissions.view',
      'calendar.view', 'calendar.create', 'calendar.update', 'calendar.delete', 'calendar.publish',
      'settings.view'
    ]
  },
  {
    name: 'Team Leader',
    slug: 'team-leader',
    description: 'Supervises sprint deliverables, tasks, and team member workflows.',
    is_system: true,
    permissionKeys: [
      'users.view', 'users.view_teams',
      'teams.view', 'teams.view_members',
      'departments.view',
      'workflows.view',
      'projects.view', 'projects.view_activity',
      'milestones.view',
      'tasks.view', 'tasks.create', 'tasks.update', 'tasks.assign', 'tasks.change_status',
      'subtasks.view', 'subtasks.create', 'subtasks.update',
      'task_comments.view', 'task_comments.create', 'task_comments.update_own', 'task_comments.delete_own',
      'task_attachments.view', 'task_attachments.upload', 'task_attachments.delete_own',
      'approvals.view', 'approvals.submit', 'approvals.review', 'approvals.approve', 'approvals.request_revision', 'approvals.cancel',
      'deliverables.view', 'deliverables.submit', 'deliverables.review_internal', 'deliverables.request_revision',
      'tickets.view', 'tickets.update', 'tickets.reply', 'tickets.internal_note',
      'quotations.view',
      'invoices.view',
      'chat.view', 'chat.create_direct', 'chat.create_group', 'chat.send', 'chat.manage_members',
      'notifications.view', 'notifications.manage_own', 'notifications.manage_preferences',
      'time_entries.view_own', 'time_entries.create', 'time_entries.update_own', 'time_entries.delete_own',
      'timers.start', 'timers.stop_own', 'timers.view_own',
      'timesheets.view_own', 'timesheets.submit', 'timesheets.view_team', 'timesheets.review', 'timesheets.approve', 'timesheets.reject',
      'time_reports.view',
      'reports.view_dashboard', 'reports.view_projects', 'reports.view_tasks', 'reports.view_teams', 'reports.view_time', 'reports.export',
      'permissions.view',
      'calendar.view', 'calendar.create', 'calendar.update'
    ]
  },
  {
    name: 'Employee',
    slug: 'employee',
    description: 'Standard staff member completing assigned tasks and reporting progress.',
    is_system: true,
    permissionKeys: [
      'teams.view',
      'departments.view',
      'workflows.view',
      'projects.view',
      'milestones.view',
      'tasks.view', 'tasks.change_status',
      'subtasks.view', 'subtasks.create', 'subtasks.update',
      'task_comments.view', 'task_comments.create', 'task_comments.update_own', 'task_comments.delete_own',
      'task_attachments.view', 'task_attachments.upload', 'task_attachments.delete_own',
      'approvals.view', 'approvals.submit', 'approvals.cancel',
      'deliverables.view', 'deliverables.submit',
      'tickets.view', 'tickets.reply', 'tickets.internal_note',
      'chat.view', 'chat.create_direct', 'chat.create_group', 'chat.send', 'chat.manage_members',
      'notifications.view', 'notifications.manage_own', 'notifications.manage_preferences',
      'time_entries.view_own', 'time_entries.create', 'time_entries.update_own', 'time_entries.delete_own',
      'timers.start', 'timers.stop_own', 'timers.view_own',
      'timesheets.view_own', 'timesheets.submit',
      'time_reports.view',
      'reports.view_dashboard', 'reports.view_tasks', 'reports.view_time',
      'permissions.view',
      'calendar.view', 'calendar.create', 'calendar.update'
    ]
  },
  {
    name: 'Client',
    slug: 'client',
    description: 'External client accessing shared project progress and milestone deliverables.',
    is_system: true,
    permissionKeys: [
      'projects.view',
      'milestones.view',
      'tasks.view',
      'subtasks.view',
      'task_comments.view', 'task_comments.create', 'task_comments.update_own',
      'task_attachments.view',
      'deliverables.view', 'deliverables.review_client', 'deliverables.request_revision',
      'tickets.view', 'tickets.create', 'tickets.reply',
      'quotations.view', 'quotations.review_client',
      'invoices.view',
      'payments.view',
      'notifications.view', 'notifications.manage_own', 'notifications.manage_preferences',
      'time_reports.view',
      'reports.view_dashboard', 'reports.view_projects', 'reports.view_tasks', 'reports.view_clients',
      'clients.view',
      'services.view',
      'lifecycle.view',
      'permissions.view',
      'calendar.view'
    ]
  },
  {
    name: 'Account Manager',
    slug: 'account-manager',
    description: 'Owns L1-L6 client lifecycle, service bundling, task assignments, and client reviews.',
    is_system: true,
    permissionKeys: [
      'users.view', 'users.view_teams',
      'clients.view', 'clients.create', 'clients.update', 'clients.manage_contacts', 'clients.manage_onboarding', 'clients.manage_services', 'clients.manage_documents',
      'workflows.view', 'workflows.execute',
      'services.view', 'services.bundle', 'services.manage',
      'lifecycle.view', 'lifecycle.update',
      'projects.view', 'projects.create', 'projects.update', 'projects.view_activity',
      'milestones.view', 'milestones.create', 'milestones.update',
      'tasks.view', 'tasks.create', 'tasks.update', 'tasks.assign', 'tasks.change_status', 'tasks.reopen',
      'subtasks.view', 'subtasks.create', 'subtasks.update',
      'task_comments.view', 'task_comments.create', 'task_comments.update_own',
      'task_attachments.view', 'task_attachments.upload', 'task_attachments.delete_own',
      'approvals.view', 'approvals.submit', 'approvals.review', 'approvals.approve', 'approvals.request_revision',
      'deliverables.view', 'deliverables.submit', 'deliverables.review_internal', 'deliverables.submit_client', 'deliverables.review_client', 'deliverables.request_revision',
      'tickets.view', 'tickets.create', 'tickets.assign', 'tickets.update', 'tickets.reply', 'tickets.internal_note', 'tickets.resolve',
      'quotations.view', 'quotations.create', 'quotations.update', 'quotations.issue', 'quotations.convert',
      'invoices.view', 'invoices.create', 'invoices.issue', 'invoices.void',
      'payments.view', 'payments.record',
      'chat.view', 'chat.create_direct', 'chat.create_group', 'chat.send', 'chat.manage_members',
      'leads.view', 'leads.create', 'leads.update', 'leads.convert',
      'time_entries.view_own', 'time_entries.create', 'time_entries.update_own',
      'timers.start', 'timers.stop_own', 'timers.view_own',
      'timesheets.view_own', 'timesheets.submit',
      'notifications.view', 'notifications.manage_own', 'notifications.manage_preferences',
      'reports.view_dashboard', 'reports.view_projects', 'reports.view_tasks', 'reports.view_clients',
      'permissions.view',
      'calendar.view', 'calendar.create', 'calendar.update', 'calendar.delete', 'calendar.publish'
    ]
  },
  {
    name: 'Field Executive',
    slug: 'field-executive',
    description: 'Field business development executive capturing zone leads and logging visits.',
    is_system: true,
    permissionKeys: [
      'leads.view', 'leads.create', 'leads.update',
      'tasks.view', 'tasks.change_status',
      'task_comments.view', 'task_comments.create',
      'time_entries.view_own', 'time_entries.create',
      'timers.start', 'timers.stop_own', 'timers.view_own',
      'timesheets.view_own', 'timesheets.submit',
      'chat.view', 'chat.create_direct', 'chat.create_group', 'chat.send',
      'notifications.view', 'notifications.manage_own', 'notifications.manage_preferences',
      'permissions.view'
    ]
  },
  {
    name: 'SEO Executive',
    slug: 'seo-exec',
    description: 'SEO, AEO, and GEO execution specialist executing search ranking and local audits.',
    is_system: true,
    permissionKeys: [
      'tasks.view', 'tasks.change_status',
      'subtasks.view', 'subtasks.create', 'subtasks.update',
      'task_comments.view', 'task_comments.create', 'task_comments.update_own',
      'task_attachments.view', 'task_attachments.upload', 'task_attachments.delete_own',
      'approvals.view', 'approvals.submit',
      'deliverables.view', 'deliverables.submit',
      'time_entries.view_own', 'time_entries.create', 'time_entries.update_own',
      'timers.start', 'timers.stop_own', 'timers.view_own',
      'timesheets.view_own', 'timesheets.submit',
      'chat.view', 'chat.create_direct', 'chat.create_group', 'chat.send',
      'notifications.view', 'notifications.manage_own', 'notifications.manage_preferences',
      'permissions.view'
    ]
  },
  {
    name: 'Performance Marketing Executive',
    slug: 'perf-marketing-exec',
    description: 'Paid ads executive managing Google Ads, Meta campaigns, and conversion tracking.',
    is_system: true,
    permissionKeys: [
      'tasks.view', 'tasks.change_status',
      'subtasks.view', 'subtasks.create', 'subtasks.update',
      'task_comments.view', 'task_comments.create', 'task_comments.update_own',
      'task_attachments.view', 'task_attachments.upload', 'task_attachments.delete_own',
      'approvals.view', 'approvals.submit',
      'deliverables.view', 'deliverables.submit',
      'time_entries.view_own', 'time_entries.create', 'time_entries.update_own',
      'timers.start', 'timers.stop_own', 'timers.view_own',
      'timesheets.view_own', 'timesheets.submit',
      'chat.view', 'chat.create_direct', 'chat.create_group', 'chat.send',
      'notifications.view', 'notifications.manage_own', 'notifications.manage_preferences',
      'permissions.view'
    ]
  },
  {
    name: 'Content Executive',
    slug: 'content-exec',
    description: 'Content creator drafting copy, articles, captions, and ad creatives.',
    is_system: true,
    permissionKeys: [
      'tasks.view', 'tasks.change_status',
      'subtasks.view', 'subtasks.create', 'subtasks.update',
      'task_comments.view', 'task_comments.create', 'task_comments.update_own',
      'task_attachments.view', 'task_attachments.upload', 'task_attachments.delete_own',
      'approvals.view', 'approvals.submit',
      'deliverables.view', 'deliverables.submit',
      'time_entries.view_own', 'time_entries.create', 'time_entries.update_own',
      'timers.start', 'timers.stop_own', 'timers.view_own',
      'timesheets.view_own', 'timesheets.submit',
      'chat.view', 'chat.create_direct', 'chat.create_group', 'chat.send',
      'notifications.view', 'notifications.manage_own', 'notifications.manage_preferences',
      'permissions.view'
    ]
  },
  {
    name: 'Design Executive',
    slug: 'design-exec',
    description: 'Graphic designer producing brand collateral, banners, UI, and social posts.',
    is_system: true,
    permissionKeys: [
      'tasks.view', 'tasks.change_status',
      'subtasks.view', 'subtasks.create', 'subtasks.update',
      'task_comments.view', 'task_comments.create', 'task_comments.update_own',
      'task_attachments.view', 'task_attachments.upload', 'task_attachments.delete_own',
      'approvals.view', 'approvals.submit',
      'deliverables.view', 'deliverables.submit',
      'time_entries.view_own', 'time_entries.create', 'time_entries.update_own',
      'timers.start', 'timers.stop_own', 'timers.view_own',
      'timesheets.view_own', 'timesheets.submit',
      'chat.view', 'chat.create_direct', 'chat.create_group', 'chat.send',
      'notifications.view', 'notifications.manage_own', 'notifications.manage_preferences',
      'permissions.view'
    ]
  },
  {
    name: 'Video Executive',
    slug: 'video-exec',
    description: 'Video producer and editor creating reels, shorts, shoots, and long-form videos.',
    is_system: true,
    permissionKeys: [
      'tasks.view', 'tasks.change_status',
      'subtasks.view', 'subtasks.create', 'subtasks.update',
      'task_comments.view', 'task_comments.create', 'task_comments.update_own',
      'task_attachments.view', 'task_attachments.upload', 'task_attachments.delete_own',
      'approvals.view', 'approvals.submit',
      'deliverables.view', 'deliverables.submit',
      'time_entries.view_own', 'time_entries.create', 'time_entries.update_own',
      'timers.start', 'timers.stop_own', 'timers.view_own',
      'timesheets.view_own', 'timesheets.submit',
      'chat.view', 'chat.create_direct', 'chat.create_group', 'chat.send',
      'notifications.view', 'notifications.manage_own', 'notifications.manage_preferences',
      'permissions.view'
    ]
  },
  {
    name: 'Dev Executive',
    slug: 'dev-exec',
    description: 'Software and web developer building client landing pages, websites, and automations.',
    is_system: true,
    permissionKeys: [
      'tasks.view', 'tasks.change_status',
      'subtasks.view', 'subtasks.create', 'subtasks.update',
      'task_comments.view', 'task_comments.create', 'task_comments.update_own',
      'task_attachments.view', 'task_attachments.upload', 'task_attachments.delete_own',
      'approvals.view', 'approvals.submit',
      'deliverables.view', 'deliverables.submit',
      'time_entries.view_own', 'time_entries.create', 'time_entries.update_own',
      'timers.start', 'timers.stop_own', 'timers.view_own',
      'timesheets.view_own', 'timesheets.submit',
      'chat.view', 'chat.create_direct', 'chat.create_group', 'chat.send',
      'notifications.view', 'notifications.manage_own', 'notifications.manage_preferences',
      'permissions.view'
    ]
  },
  {
    name: 'HR / Admin',
    slug: 'hr-admin',
    description: 'HR Administrator managing employee directory, attendance, leave, and payroll.',
    is_system: true,
    permissionKeys: [
      'users.view', 'users.create', 'users.update', 'users.change_status', 'users.invite', 'users.view_teams',
      'teams.view', 'teams.view_members',
      'timesheets.view_team', 'timesheets.review', 'timesheets.approve', 'timesheets.reject',
      'chat.view', 'chat.create_direct', 'chat.create_group', 'chat.send', 'chat.manage_members',
      'notifications.view', 'notifications.manage_own', 'notifications.manage_preferences',
      'reports.view_dashboard',
      'permissions.view'
    ]
  }
];


