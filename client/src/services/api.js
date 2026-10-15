import axios from 'axios';

// Determine API base URL dynamically: use proxy on localhost, direct backend URL in production
export const API_BASE_URL = import.meta.env.VITE_API_URL || 
  (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? '/api'
    : 'https://server.dgrowmarketing.in/api');

// Create configured Axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});


let cachedCsrfToken = '';

// Helper to get cookie value by name
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

// Ensure CSRF token is attached to state-changing requests
api.interceptors.request.use((config) => {
  const method = config.method?.toLowerCase();
  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    const csrfToken = getCookie('xsrf_token') || cachedCsrfToken;
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
  }
  return config;
});

// Flag to prevent multiple simultaneous refresh loops
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Response interceptor to handle transparent token refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Do not attempt refresh on login, refresh itself, or already retried requests
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => api(originalRequest))
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await api.post('/auth/refresh');
        processQueue(null);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export const authService = {
  getCsrfToken: async () => {
    const res = await api.get('/auth/csrf-token');
    if (res.data?.csrfToken) {
      cachedCsrfToken = res.data.csrfToken;
    }
    return res;
  },
  login: (credentials) => api.post('/auth/login', credentials),
  refresh: () => api.post('/auth/refresh'),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/auth/me')
};

export const rbacService = {
  getMyPermissions: () => api.get('/auth/me/permissions'),
  getPermissions: () => api.get('/permissions'),
  getGroupedPermissions: () => api.get('/permissions/grouped'),
  getRoles: () => api.get('/roles'),
  getRole: (id) => api.get(`/roles/${id}`),
  createRole: (data) => api.post('/roles', data),
  updateRole: (id, data) => api.put(`/roles/${id}`, data),
  deleteRole: (id) => api.delete(`/roles/${id}`),
  getRolePermissions: (roleId) => api.get(`/roles/${roleId}/permissions`),
  setRolePermissions: (roleId, permissionIds) => api.put(`/roles/${roleId}/permissions`, { permissionIds }),
  getUserRoles: (userId) => api.get(`/users/${userId}/roles`),
  setUserRoles: (userId, roleIds) => api.put(`/users/${userId}/roles`, { roleIds }),
  getAuditLogs: (params) => api.get('/audit-logs', { params })
};

export const usersService = {
  getUsers: (params) => api.get('/users', { params }),
  getUser: (id) => api.get(`/users/${id}`),
  createUser: (data) => api.post('/users', data),
  updateUser: (id, data) => api.put(`/users/${id}`, data),
  changeStatus: (id, status) => api.patch(`/users/${id}/status`, { status }),
  getUserTeams: (id) => api.get(`/users/${id}/teams`),
  createInvitation: (data) => api.post('/invitations', data),
  getInvitations: () => api.get('/invitations'),
  resendInvitation: (id) => api.post(`/invitations/${id}/resend`),
  revokeInvitation: (id) => api.post(`/invitations/${id}/revoke`),
  acceptInvitation: (data) => api.post('/auth/accept-invitation', data)
};

export const teamsService = {
  getTeams: (params) => api.get('/teams', { params }),
  getTeam: (id) => api.get(`/teams/${id}`),
  createTeam: (data) => api.post('/teams', data),
  updateTeam: (id, data) => api.put(`/teams/${id}`, data),
  deleteTeam: (id) => api.delete(`/teams/${id}`),
  getTeamMembers: (id) => api.get(`/teams/${id}/members`),
  addMember: (teamId, data) => api.post(`/teams/${teamId}/members`, data),
  removeMember: (teamId, userId) => api.delete(`/teams/${teamId}/members/${userId}`),
  assignLeader: (teamId, leaderId) => api.put(`/teams/${teamId}/leader`, { leaderId })
};

export const clientsService = {
  getClients: (params) => api.get('/clients', { params }),
  getDashboardStats: () => api.get('/clients/dashboard/stats'),
  getClient: (id) => api.get(`/clients/${id}`),
  createClient: (data) => api.post('/clients', data),
  updateClient: (id, data) => api.put(`/clients/${id}`, data),
  deleteClient: (id) => api.delete(`/clients/${id}`),
  exportClients: () => api.get('/clients/export', { responseType: 'blob' }),

  // Workspace & Activity
  getWorkspace: (id) => api.get(`/clients/${id}/workspace`),
  getActivity: (id) => api.get(`/clients/${id}/activity`),
  getClientProjects: (id) => api.get(`/clients/${id}/projects`),
  getProjects: (id) => api.get(`/clients/${id}/projects`),

  // Lifecycle
  getLifecycle: (id) => api.get(`/clients/${id}/lifecycle`),
  updateLifecycle: (id, data) => api.put(`/clients/${id}/lifecycle`, typeof data === 'object' ? data : { stage: data }),

  // Account Managers
  getEligibleAccountManagers: () => api.get('/clients/meta/account-managers'),
  assignAccountManager: (id, data) => api.post(`/clients/${id}/assign-account-manager`, data),
  getAccountManagerHistory: (id) => api.get(`/clients/${id}/account-manager-history`),

  // Contacts
  getContacts: (id) => api.get(`/clients/${id}/contacts`),
  addContact: (id, data) => api.post(`/clients/${id}/contacts`, data),
  updateContact: (id, contactId, data) => api.put(`/clients/${id}/contacts/${contactId}`, data),
  deleteContact: (id, contactId) => api.delete(`/clients/${id}/contacts/${contactId}`),
  setPrimaryContact: (id, contactId) => api.put(`/clients/${id}/contacts/${contactId}/primary`),

  // Onboarding Checklist
  getOnboardingChecklist: (id) => api.get(`/clients/${id}/onboarding`),
  addOnboardingItem: (id, data) => api.post(`/clients/${id}/onboarding/items`, data),
  updateOnboardingItem: (id, itemId, data) => api.patch(`/clients/${id}/onboarding/items/${itemId}`, data),
  deleteOnboardingItem: (id, itemId) => api.delete(`/clients/${id}/onboarding/items/${itemId}`),

  // Services
  getClientServices: (id) => api.get(`/clients/${id}/services`),
  getServices: (id) => api.get(`/clients/${id}/services`),
  createService: (id, data) => api.post(`/clients/${id}/services`, data),
  updateService: (id, serviceId, data) => api.put(`/clients/${id}/services/${serviceId}`, data),
  bundleServices: (id, data) => api.post(`/clients/${id}/services`, data),
  setPortalCredentials: (id, data) => api.post(`/clients/${id}/portal-account`, data)
};

export const clientService = clientsService;

export const projectsService = {
  getProjects: (params) => api.get('/projects', { params }),
  getMetrics: () => api.get('/projects/metrics'),
  getProject: (id) => api.get(`/projects/${id}`),
  createProject: (data) => api.post('/projects', data),
  updateProject: (id, data) => api.put(`/projects/${id}`, data),
  changeStatus: (id, status) => api.patch(`/projects/${id}/status`, { status }),
  archiveProject: (id) => api.post(`/projects/${id}/archive`),
  getMembers: (id) => api.get(`/projects/${id}/members`),
  updateMembers: (id, members) => api.put(`/projects/${id}/members`, { members }),
  getTeams: (id) => api.get(`/projects/${id}/teams`),
  updateTeams: (id, teamIds) => api.put(`/projects/${id}/teams`, { teamIds }),
  getActivity: (id) => api.get(`/projects/${id}/activity`),
  getMilestones: (id) => api.get(`/projects/${id}/milestones`),
  createMilestone: (id, data) => api.post(`/projects/${id}/milestones`, data),
  updateMilestone: (id, milestoneId, data) => api.put(`/projects/${id}/milestones/${milestoneId}`, data),
  changeMilestoneStatus: (id, milestoneId, status) => api.patch(`/projects/${id}/milestones/${milestoneId}/status`, { status }),
  deleteMilestone: (id, milestoneId) => api.delete(`/projects/${id}/milestones/${milestoneId}`),
  reorderMilestones: (id, orders) => api.patch(`/projects/${id}/milestones/reorder`, { orders })
};

export const tasksService = {
  getTasks: (params) => api.get('/tasks', { params }),
  getMyTasks: (params) => api.get('/tasks/my-tasks', { params }),
  getProjectTasks: (projectId, params) => api.get(`/projects/${projectId}/tasks`, { params }),
  getTask: (id) => api.get(`/tasks/${id}`),
  createTask: (data) => api.post('/tasks', data),
  updateTask: (id, data) => api.put(`/tasks/${id}`, data),
  changeStatus: (id, status, comment) =>
    api.patch(`/tasks/${id}/status`, typeof status === 'object' ? status : { status, comment }),
  reopenTask: (id, comment) => api.post(`/tasks/${id}/reopen`, { comment }),
  archiveTask: (id) => api.post(`/tasks/${id}/archive`),
  deleteTask: (id) => api.delete(`/tasks/${id}`),
  getAssignees: (id) => api.get(`/tasks/${id}/assignees`),
  updateAssignees: (id, assigneeIds) => api.put(`/tasks/${id}/assignees`, { assigneeIds }),
  getSubtasks: (id) => api.get(`/tasks/${id}/subtasks`),
  createSubtask: (id, data) => api.post(`/tasks/${id}/subtasks`, data),
  getComments: (id, params) => api.get(`/tasks/${id}/comments`, { params }),
  createComment: (id, commentText) => api.post(`/tasks/${id}/comments`, { commentText }),
  updateComment: (id, commentId, commentText) => api.put(`/tasks/${id}/comments/${commentId}`, { commentText }),
  deleteComment: (id, commentId) => api.delete(`/tasks/${id}/comments/${commentId}`),
  getAttachments: (id) => api.get(`/tasks/${id}/attachments`),
  uploadAttachment: (id, formData) => api.post(`/tasks/${id}/attachments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  deleteAttachment: (id, attachmentId) => api.delete(`/tasks/${id}/attachments/${attachmentId}`),
  downloadAttachment: (id, attachmentId) => api.get(`/tasks/${id}/attachments/${attachmentId}/download`, {
    responseType: 'blob'
  })
};

export const approvalsService = {
  submitReview: (taskId, submissionNotes) => api.post(`/tasks/${taskId}/submit-review`, { submissionNotes }),
  getApprovals: (taskId) => api.get(`/tasks/${taskId}/approvals`),
  approve: (taskId, approvalId, feedback) => api.post(`/tasks/${taskId}/approvals/${approvalId}/approve`, { feedback }),
  requestRevision: (taskId, approvalId, reviewerFeedback) => api.post(`/tasks/${taskId}/approvals/${approvalId}/request-revision`, { reviewerFeedback }),
  cancel: (taskId, approvalId) => api.post(`/tasks/${taskId}/approvals/${approvalId}/cancel`),
  getApprovalHistory: (taskId) => api.get(`/tasks/${taskId}/approval-history`)
};

export const notificationsService = {
  getNotifications: (params) => api.get('/notifications', { params }),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markAsRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllAsRead: () => api.patch('/notifications/read-all'),
  deleteNotification: (id) => api.delete(`/notifications/${id}`),
  getPreferences: () => api.get('/notifications/preferences'),
  updatePreferences: (data) => api.put('/notifications/preferences', data)
};

export const timeService = {
  // Timers
  startTimer: (taskId, description) => api.post('/timers/start', { taskId, description }),
  stopTimer: (id, data) => api.post(`/timers/${id}/stop`, data),
  getActiveTimer: () => api.get('/timers/active'),
  getTimer: (id) => api.get(`/timers/${id}`),

  // Time Entries
  getTimeEntries: (params) => api.get('/time-entries', { params }),
  getTimeEntry: (id) => api.get(`/time-entries/${id}`),
  createTimeEntry: (data) => api.post('/time-entries', data),
  updateTimeEntry: (id, data) => api.put(`/time-entries/${id}`, data),
  deleteTimeEntry: (id) => api.delete(`/time-entries/${id}`),

  // Timesheets
  getTimesheets: (params) => api.get('/timesheets', { params }),
  getTimesheet: (id) => api.get(`/timesheets/${id}`),
  createTimesheet: (data) => api.post('/timesheets', data),
  submitTimesheet: (id) => api.post(`/timesheets/${id}/submit`),
  approveTimesheet: (id) => api.post(`/timesheets/${id}/approve`),
  rejectTimesheet: (id, reviewerComment) => api.post(`/timesheets/${id}/reject`, { reviewerComment }),
  getUserTimesheets: (userId, params) => api.get(`/users/${userId}/timesheets`, { params }),

  // Summaries & Reports
  getSummary: (params) => api.get('/time-reports/summary', { params }),
  getProjectTimeSummary: (projectId) => api.get(`/projects/${projectId}/time-summary`),
  getTaskTimeSummary: (taskId) => api.get(`/tasks/${taskId}/time-summary`)
};

export const reportsService = {
  getDashboard: (params) => api.get('/reports/dashboard', { params }),
  getProjects: (params) => api.get('/reports/projects', { params }),
  getProjectById: (id) => api.get(`/reports/projects/${id}`),
  getTasks: (params) => api.get('/reports/tasks', { params }),
  getOverdueTasks: (params) => api.get('/reports/overdue-tasks', { params }),
  getTaskCompletion: (params) => api.get('/reports/task-completion', { params }),
  getTeams: (params) => api.get('/reports/teams', { params }),
  getTeamById: (id, params) => api.get(`/reports/teams/${id}`, { params }),
  getTimeSummary: (params) => api.get('/reports/time-summary', { params }),
  getProjectHours: (params) => api.get('/reports/project-hours', { params }),
  getEmployeeHours: (params) => api.get('/reports/employee-hours', { params }),
  getClients: (params) => api.get('/reports/clients', { params }),
  exportReport: (data) => api.post('/reports/exports', data, { responseType: 'blob' })
};

export const servicesCatalogService = {
  getCatalog: () => api.get('/services/catalog')
};

export const leadsService = {
  getLeads: (params) => api.get('/leads', { params }),
  getLead: (id) => api.get(`/leads/${id}`),
  createLead: (data) => api.post('/leads', data),
  updateLead: (id, data) => api.put(`/leads/${id}`, data),
  convertLead: (id, data) => api.post(`/leads/${id}/convert`, data)
};

export const departmentsService = {
  getDepartments: (params) => api.get('/departments', { params }),
  getDepartment: (id) => api.get(`/departments/${id}`),
  createDepartment: (data) => api.post('/departments', data),
  updateDepartment: (id, data) => api.put(`/departments/${id}`, data),
  deleteDepartment: (id, params) => api.delete(`/departments/${id}`, { params }),
  getMembers: (id) => api.get(`/departments/${id}/members`),
  addMember: (id, data) => api.post(`/departments/${id}/members`, data),
  removeMember: (id, userId) => api.delete(`/departments/${id}/members/${userId}`),
  getPresets: (id) => api.get(`/departments/${id}/presets`)
};

export const workflowPresetsService = {
  getPresets: (params) => api.get('/workflow-presets', { params }),
  getPreset: (id, params) => api.get(`/workflow-presets/${id}`, { params }),
  createPreset: (data) => api.post('/workflow-presets', data),
  updatePreset: (id, data) => api.put(`/workflow-presets/${id}`, data),
  archivePreset: (id) => api.post(`/workflow-presets/${id}/archive`),
  getVersions: (id) => api.get(`/workflow-presets/${id}/versions`),
  createDraftVersion: (id) => api.post(`/workflow-presets/${id}/create-draft`),
  updateVersionSettings: (id, versionId, data) => api.put(`/workflow-presets/${id}/versions/${versionId}`, data),
  addStage: (id, versionId, data) => api.post(`/workflow-presets/${id}/versions/${versionId}/stages`, data),
  updateStage: (id, versionId, stageId, data) => api.put(`/workflow-presets/${id}/versions/${versionId}/stages/${stageId}`, data),
  deleteStage: (id, versionId, stageId) => api.delete(`/workflow-presets/${id}/versions/${versionId}/stages/${stageId}`),
  reorderStages: (id, versionId, data) => api.put(`/workflow-presets/${id}/versions/${versionId}/stages/reorder`, data),
  addTask: (id, versionId, data) => api.post(`/workflow-presets/${id}/versions/${versionId}/tasks`, data),
  updateTask: (id, versionId, taskId, data) => api.put(`/workflow-presets/${id}/versions/${versionId}/tasks/${taskId}`, data),
  deleteTask: (id, versionId, taskId) => api.delete(`/workflow-presets/${id}/versions/${versionId}/tasks/${taskId}`),
  reorderTasks: (id, versionId, data) => api.put(`/workflow-presets/${id}/versions/${versionId}/tasks/reorder`, data),
  addDependency: (id, versionId, taskId, data) => api.post(`/workflow-presets/${id}/versions/${versionId}/tasks/${taskId}/dependencies`, data),
  removeDependency: (id, versionId, taskId, depTaskId) => api.delete(`/workflow-presets/${id}/versions/${versionId}/tasks/${taskId}/dependencies/${depTaskId}`),
  validateVersion: (id, versionId) => api.post(`/workflow-presets/${id}/versions/${versionId}/validate`),
  publishVersion: (id, versionId) => api.post(`/workflow-presets/${id}/versions/${versionId}/publish`)
};

export const automationService = {
  preview: (data) => api.post('/automation/preview', data),
  execute: (data) => api.post('/automation/execute', data),
  getExecutions: (params) => api.get('/automation/executions', { params }),
  getExecution: (id) => api.get(`/automation/executions/${id}`),
  getExecutionTasks: (id) => api.get(`/automation/executions/${id}/tasks`),
  getExecutionErrors: (id) => api.get(`/automation/executions/${id}/errors`),
  retryExecution: (id) => api.post(`/automation/executions/${id}/retry`),
  evaluateDependencies: (data) => api.post('/automation/evaluate-dependencies', data)
};

export const deliverablesService = {
  submitReview: (taskId, formData) => api.post(`/tasks/${taskId}/deliverables/submit-review`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getTaskDeliverables: (taskId) => api.get(`/tasks/${taskId}/deliverables`),
  getDeliverable: (id) => api.get(`/deliverables/${id}`),
  reviewInternal: (id, data) => api.post(`/deliverables/${id}/review-internal`, data),
  clientApprove: (id, data) => api.post(`/deliverables/${id}/client-approve`, data),
  clientRequestRevision: (id, data) => api.post(`/deliverables/${id}/client-request-revision`, data),
  getClientDeliverables: (clientId, params) => api.get(`/clients/${clientId}/deliverables`, { params }),
  getReviewQueue: () => api.get('/am/approvals-queue'),
  getDownloadUrl: (id) => `${API_BASE_URL}/deliverables/${id}/download`
};

export const ticketsService = {
  getStats: () => api.get('/tickets/stats'),
  list: (params) => api.get('/tickets', { params }),
  get: (id) => api.get(`/tickets/${id}`),
  create: (data) => api.post('/tickets', data),
  addMessage: (id, data) => api.post(`/tickets/${id}/messages`, data),
  update: (id, data) => api.patch(`/tickets/${id}`, data)
};

export const billingService = {
  getStats: () => api.get('/billing/stats'),
  listQuotations: (params) => api.get('/quotations', { params }),
  getQuotation: (id) => api.get(`/quotations/${id}`),
  createQuotation: (data) => api.post('/quotations', data),
  issueQuotation: (id) => api.post(`/quotations/${id}/issue`),
  clientReviewQuotation: (id, data) => api.post(`/quotations/${id}/review`, data),
  convertQuotation: (id) => api.post(`/quotations/${id}/convert`),

  listInvoices: (params) => api.get('/invoices', { params }),
  getInvoice: (id) => api.get(`/invoices/${id}`),
  createInvoice: (data) => api.post('/invoices', data),
  issueInvoice: (id) => api.post(`/invoices/${id}/issue`),
  voidInvoice: (id) => api.post(`/invoices/${id}/void`),

  recordPayment: (id, data) => api.post(`/invoices/${id}/payments`, data),
  getPaymentReceipt: (id) => api.get(`/payments/${id}/receipt`),
  getDocumentUrl: (type, id) => `${API_BASE_URL}/billing/documents/${type}/${id}`
};

export const chatService = {
  getUnreadCount: () => api.get('/chat/unread-count'),
  searchColleagues: (params) => api.get('/chat/colleagues', { params }),
  listConversations: (params) => api.get('/chat/conversations', { params }),
  getOrCreateDirect: (targetUserId) => api.post('/chat/conversations/direct', { targetUserId }),
  createGroup: (data) => api.post('/chat/conversations/group', data),
  getOrCreateDepartment: (departmentId) => api.get(`/chat/conversations/department/${departmentId}`),
  getOrCreateProject: (projectId) => api.get(`/chat/conversations/project/${projectId}`),
  getConversation: (id) => api.get(`/chat/conversations/${id}`),
  addMembers: (id, memberIds) => api.post(`/chat/conversations/${id}/members`, { memberIds }),
  removeMember: (id, userId) => api.delete(`/chat/conversations/${id}/members/${userId}`),
  getMessages: (id, params) => api.get(`/chat/conversations/${id}/messages`, { params }),
  sendMessage: (id, formData) => api.post(`/chat/conversations/${id}/messages`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  sendTextMessage: (id, data) => api.post(`/chat/conversations/${id}/messages`, data),
  markAsRead: (id, data) => api.post(`/chat/conversations/${id}/read`, data),
  markDelivered: (id, data) => api.post(`/chat/conversations/${id}/delivered`, data),
  getMessageInfo: (messageId) => api.get(`/chat/messages/${messageId}/info`),
  editMessage: (messageId, data) => api.patch(`/chat/messages/${messageId}`, data),
  deleteMessage: (messageId) => api.delete(`/chat/messages/${messageId}`),
  getAttachmentUrl: (messageId) => `${API_BASE_URL}/chat/attachments/${messageId}/download`
};

export const hrService = {
  getDashboard: () => api.get('/hr/dashboard'),
  getEmployees: (params) => api.get('/hr/employees', { params }),
  getEmployeeProfile: (id) => api.get(`/hr/employees/${id}`),
  updateEmployeeProfile: (id, data) => api.put(`/hr/employees/${id}`, data),
  getEmployeePerformance: (userId) => api.get(`/hr/employees/${userId}/performance`),

  getTodayAttendance: () => api.get('/hr/attendance/today'),
  checkIn: (data) => api.post('/hr/attendance/check-in', data),
  checkOut: (data) => api.post('/hr/attendance/check-out', data),
  getAttendanceHistory: (params) => api.get('/hr/attendance/history', { params }),
  getUserAttendanceHistory: (userId, params) => api.get(`/hr/attendance/user/${userId}`, { params }),
  getTeamAttendance: (params) => api.get('/hr/attendance/team', { params }),
  requestAttendanceCorrection: (data) => api.post('/hr/attendance/corrections', data),
  getAttendanceCorrections: (params) => api.get('/hr/attendance/corrections', { params }),
  reviewAttendanceCorrection: (id, data) => api.put(`/hr/attendance/corrections/${id}/review`, data),

  getLeaveTypes: () => api.get('/hr/leave/types'),
  getLeaveBalances: (params) => api.get('/hr/leave/balances', { params }),
  getUserLeaveBalances: (userId, params) => api.get(`/hr/leave/balances/user/${userId}`, { params }),
  applyLeave: (data) => api.post('/hr/leave/apply', data),
  cancelLeave: (id) => api.post(`/hr/leave/${id}/cancel`),
  getLeaveRequests: (params) => api.get('/hr/leave/requests', { params }),
  reviewLeave: (id, data) => api.put(`/hr/leave/requests/${id}/review`, data),

  getSalaryComponents: () => api.get('/hr/salary/components'),
  assignSalary: (userId, data) => api.post(`/hr/salary/assign/${userId}`, data),

  createPayrollRun: (data) => api.post('/hr/payroll/runs', data),
  getPayrollRuns: (params) => api.get('/hr/payroll/runs', { params }),
  getPayrollRunDetails: (id) => api.get(`/hr/payroll/runs/${id}`),
  updatePayrollStatus: (id, data) => api.put(`/hr/payroll/runs/${id}/status`, data),

  getMyPayslips: (params) => api.get('/hr/payslips/my', { params }),
  getPayslip: (id) => api.get(`/hr/payslips/${id}`)
};

export const calendarService = {
  getEvents: (params) => api.get('/calendar', { params }),
  getFilterOptions: () => api.get('/calendar/options'),
  getEventById: (id) => api.get(`/calendar/${id}`),
  createEvent: (data) => api.post('/calendar', data),
  updateEvent: (id, data) => api.put(`/calendar/${id}`, data),
  deleteEvent: (id, params) => api.delete(`/calendar/${id}`, { params }),
  publishEvent: (id, data) => api.post(`/calendar/${id}/publish`, data)
};

export const credentialsService = {
  getCredentials: (params) => api.get('/credentials', { params }),
  getCredentialDetails: (id) => api.get(`/credentials/${id}`),
  createCredential: (data) => api.post('/credentials', data),
  updateCredential: (id, data) => api.put(`/credentials/${id}`, data),
  revealCredential: (id) => api.post(`/credentials/${id}/reveal`),
  grantAccess: (id, data) => api.post(`/credentials/${id}/grants`, data),
  updateGrant: (id, grantId, data) => api.patch(`/credentials/${id}/grants/${grantId}`, data),
  revokeGrant: (id, grantId) => api.delete(`/credentials/${id}/grants/${grantId}`),
  clientRevokeAllAccess: (id) => api.post(`/credentials/${id}/revoke-my-access`),
  getAuditHistory: (id) => api.get(`/credentials/${id}/audit-history`),
  archiveCredential: (id) => api.delete(`/credentials/${id}`),
  getEligibleEmployees: () => api.get('/credentials/meta/employees')
};

export default api;



