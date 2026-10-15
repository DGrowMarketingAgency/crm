import React, { useState, useEffect } from 'react';
import { reportsService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { ExportReportModal } from './ExportReportModal';
import {
  BarChart3,
  TrendingUp,
  FolderKanban,
  CheckSquare,
  Clock,
  Users,
  Download,
  Calendar,
  Filter,
  Search,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
  Briefcase,
  Play,
  RotateCcw,
  Check
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  CartesianGrid
} from 'recharts';

const CHART_COLORS = {
  primary: '#b91c1c',
  accent: '#ef4444',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  amber: '#f59e0b',
  rose: '#dc2626',
  slate: '#64748b'
};

const TASK_STATUS_COLORS = {
  todo: '#94a3b8',
  in_progress: '#3b82f6',
  in_review: '#8b5cf6',
  blocked: '#ef4444',
  completed: '#10b981'
};

export function ReportsPage() {
  const { hasPermission, isOwner } = usePermission();

  // Active Tab
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'projects' | 'tasks' | 'teams' | 'time' | 'clients'

  // Date Range State
  const [period, setPeriod] = useState('last_30_days');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Export Modal State
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // Data States
  const [dashboardData, setDashboardData] = useState(null);
  const [projectsData, setProjectsData] = useState({ projects: [], pagination: {} });
  const [tasksData, setTasksData] = useState({ tasks: [], pagination: {} });
  const [overdueTasks, setOverdueTasks] = useState([]);
  const [teamsData, setTeamsData] = useState([]);
  const [timeSummary, setTimeSummary] = useState(null);
  const [projectHours, setProjectHours] = useState([]);
  const [employeeHours, setEmployeeHours] = useState([]);
  const [clientsData, setClientsData] = useState([]);

  // Filters State for Tables
  const [projectSearch, setProjectSearch] = useState('');
  const [projectStatusFilter, setProjectStatusFilter] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Permissions
  const canViewProjects = isOwner || hasPermission('reports.view_projects');
  const canViewTasks = isOwner || hasPermission('reports.view_tasks');
  const canViewTeams = isOwner || hasPermission('reports.view_teams');
  const canViewTime = isOwner || hasPermission('reports.view_time');
  const canViewClients = isOwner || hasPermission('reports.view_clients');
  const canExport = isOwner || hasPermission('reports.export');

  useEffect(() => {
    loadActiveReportData();
  }, [activeTab, period, startDate, endDate, projectStatusFilter, taskStatusFilter]);

  const loadActiveReportData = async () => {
    setIsLoading(true);
    setError('');

    const queryParams = {
      period: period !== 'custom' ? period : undefined,
      startDate: period === 'custom' ? startDate : undefined,
      endDate: period === 'custom' ? endDate : undefined
    };

    try {
      if (activeTab === 'dashboard') {
        const res = await reportsService.getDashboard(queryParams);
        setDashboardData(res.data.data);
      } else if (activeTab === 'projects') {
        const res = await reportsService.getProjects({
          ...queryParams,
          status: projectStatusFilter || undefined,
          search: projectSearch || undefined,
          limit: 50
        });
        setProjectsData(res.data.data);
      } else if (activeTab === 'tasks') {
        const [taskRes, overdueRes] = await Promise.all([
          reportsService.getTasks({
            ...queryParams,
            status: taskStatusFilter || undefined,
            limit: 50
          }),
          reportsService.getOverdueTasks(queryParams)
        ]);
        setTasksData(taskRes.data.data);
        setOverdueTasks(overdueRes.data.data);
      } else if (activeTab === 'teams') {
        const res = await reportsService.getTeams(queryParams);
        setTeamsData(res.data.data);
      } else if (activeTab === 'time') {
        const [sumRes, projRes, empRes] = await Promise.all([
          reportsService.getTimeSummary(queryParams),
          reportsService.getProjectHours(queryParams),
          reportsService.getEmployeeHours(queryParams)
        ]);
        setTimeSummary(sumRes.data.data);
        setProjectHours(projRes.data.data);
        setEmployeeHours(empRes.data.data);
      } else if (activeTab === 'clients') {
        const res = await reportsService.getClients(queryParams);
        setClientsData(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load report data:', err);
      setError(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Failed to load reports. Please check your network or permissions.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <BarChart3 className="w-6 h-6 text-brand-700" />
            <span>Reports & Analytics</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time agency performance metrics, workload analytics, and secure data exports
          </p>
        </div>

        {/* Global Date Filter & Export Button */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 bg-white border border-slate-200/80 rounded-xl px-3 py-1.5 shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="text-xs font-semibold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
            >
              <option value="today">Today</option>
              <option value="last_7_days">Last 7 Days</option>
              <option value="last_30_days">Last 30 Days</option>
              <option value="this_month">This Month</option>
              <option value="previous_month">Previous Month</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {period === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-2xs focus:outline-none"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-2xs focus:outline-none"
              />
            </div>
          )}

          <button
            onClick={() => loadActiveReportData()}
            disabled={isLoading}
            className="p-2 text-slate-500 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200/80 rounded-xl shadow-2xs transition"
            title="Refresh Report Data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {canExport && (
            <button
              onClick={() => setExportModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-brand-700 hover:bg-brand-800 rounded-xl shadow-xs transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="font-semibold text-rose-700 text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 overflow-x-auto pb-px">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-lg transition border-b-2 flex items-center gap-1.5 ${
            activeTab === 'dashboard'
              ? 'border-brand-700 text-brand-800 bg-white'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Analytics Dashboard</span>
        </button>

        {canViewProjects && (
          <button
            onClick={() => setActiveTab('projects')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-lg transition border-b-2 flex items-center gap-1.5 ${
              activeTab === 'projects'
                ? 'border-brand-700 text-brand-800 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FolderKanban className="w-3.5 h-3.5" />
            <span>Projects Performance</span>
          </button>
        )}

        {canViewTasks && (
          <button
            onClick={() => setActiveTab('tasks')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-lg transition border-b-2 flex items-center gap-1.5 ${
              activeTab === 'tasks'
                ? 'border-brand-700 text-brand-800 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>Tasks & Overdue</span>
          </button>
        )}

        {canViewTeams && (
          <button
            onClick={() => setActiveTab('teams')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-lg transition border-b-2 flex items-center gap-1.5 ${
              activeTab === 'teams'
                ? 'border-brand-700 text-brand-800 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Team Workload</span>
          </button>
        )}

        {canViewTime && (
          <button
            onClick={() => setActiveTab('time')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-lg transition border-b-2 flex items-center gap-1.5 ${
              activeTab === 'time'
                ? 'border-brand-700 text-brand-800 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Time & Timesheets</span>
          </button>
        )}

        {canViewClients && (
          <button
            onClick={() => setActiveTab('clients')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-lg transition border-b-2 flex items-center gap-1.5 ${
              activeTab === 'clients'
                ? 'border-brand-700 text-brand-800 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>Client Overview</span>
          </button>
        )}
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-white rounded-2xl border border-slate-100 p-4" />
          ))}
        </div>
      )}

      {/* ======================================================== */}
      {/* 1. ANALYTICS DASHBOARD TAB */}
      {/* ======================================================== */}
      {!isLoading && activeTab === 'dashboard' && dashboardData && (
        <div className="space-y-6">
          {/* KPI Cards Row 1: Projects & Tasks */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Active Projects
              </span>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {dashboardData.kpis.activeProjects}
              </p>
              <span className="text-xs text-slate-500">
                Out of {dashboardData.kpis.totalProjects} accessible
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">
                Completed Tasks
              </span>
              <p className="text-2xl font-bold text-emerald-700 mt-1">
                {dashboardData.kpis.completedTasks}
              </p>
              <span className="text-xs text-slate-500">
                {dashboardData.kpis.totalTasks > 0
                  ? `${Math.round((dashboardData.kpis.completedTasks / dashboardData.kpis.totalTasks) * 100)}% completion rate`
                  : '0%'}
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600">
                Overdue Tasks
              </span>
              <p className="text-2xl font-bold text-rose-700 mt-1">
                {dashboardData.kpis.overdueTasks}
              </p>
              <span className="text-xs text-slate-500">Require immediate resolution</span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-purple-600">
                Tasks in Review
              </span>
              <p className="text-2xl font-bold text-purple-700 mt-1">
                {dashboardData.kpis.inReviewTasks}
              </p>
              <span className="text-xs text-slate-500">Pending manager decision</span>
            </div>
          </div>

          {/* KPI Cards Row 2: Time Tracking */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Total Tracked
              </span>
              <p className="text-xl font-bold text-slate-900 mt-1">
                {dashboardData.kpis.totalHours} hrs
              </p>
              <span className="text-xs text-slate-500">In selected period</span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">
                Approved Hours
              </span>
              <p className="text-xl font-bold text-emerald-700 mt-1">
                {dashboardData.kpis.approvedHours} hrs
              </p>
              <span className="text-xs text-slate-500">Officially verified work</span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">
                Billable Hours
              </span>
              <p className="text-xl font-bold text-emerald-800 mt-1">
                {dashboardData.kpis.billableHours} hrs
              </p>
              <span className="text-xs text-slate-500">
                {dashboardData.kpis.approvedHours > 0
                  ? `${Math.round((dashboardData.kpis.billableHours / dashboardData.kpis.approvedHours) * 100)}% of approved`
                  : '0%'}
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600">
                Pending Approval
              </span>
              <p className="text-xl font-bold text-amber-700 mt-1">
                {dashboardData.kpis.pendingHours} hrs
              </p>
              <span className="text-xs text-slate-500">Awaiting timesheet review</span>
            </div>
          </div>

          {/* Charts Row 1: Task Completion Trends & Task Status */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Task Completion Velocity</h3>
                <p className="text-xs text-slate-400">Completed task volume across selected period</p>
              </div>
              <div className="h-64">
                {dashboardData.taskCompletionTrends.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    No completed tasks in this date range.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dashboardData.taskCompletionTrends}>
                      <defs>
                        <linearGradient id="velocityColor" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#b91c1c" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#b91c1c" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="completedCount"
                        name="Completed Tasks"
                        stroke="#b91c1c"
                        fillOpacity={1}
                        fill="url(#velocityColor)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Task Status Distribution</h3>
                <p className="text-xs text-slate-400">Current workflow breakdown</p>
              </div>
              <div className="h-64 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={dashboardData.taskStatusDistribution}
                      dataKey="count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={45}
                      paddingAngle={3}
                    >
                      {dashboardData.taskStatusDistribution.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={TASK_STATUS_COLORS[entry.status] || '#94a3b8'}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Charts Row 2: Top Projects by Approved Hours & Billable Ratio */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Top Projects by Effort</h3>
                <p className="text-xs text-slate-400">Approved and billable hours breakdown</p>
              </div>
              <div className="h-64">
                {dashboardData.hoursByProject.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    No recorded project hours in this period.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dashboardData.hoursByProject}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="projectCode" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                      <Tooltip />
                      <Legend />
                      <Bar
                        dataKey="approvedHours"
                        name="Approved Hours"
                        fill="#b91c1c"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="billableHours"
                        name="Billable Hours"
                        fill="#ef4444"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Billable vs Non-Billable</h3>
                <p className="text-xs text-slate-400">Ratio of billable client effort</p>
              </div>
              <div className="h-64 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={dashboardData.billableVsNonBillable}
                      dataKey="hours"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={45}
                      paddingAngle={3}
                    >
                      <Cell fill="#b91c1c" />
                      <Cell fill="#94a3b8" />
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. PROJECT PERFORMANCE TAB */}
      {/* ======================================================== */}
      {!isLoading && activeTab === 'projects' && (
        <div className="space-y-4">
          {/* Table Filters */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search projects by name or code..."
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={projectStatusFilter}
                onChange={(e) => setProjectStatusFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none"
              >
                <option value="">All Project Statuses</option>
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          {/* Projects Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
            {projectsData.projects.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400">
                No project performance records match your filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3">Project</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Client</th>
                      <th className="px-4 py-3">Manager</th>
                      <th className="px-4 py-3">Task Progress</th>
                      <th className="px-4 py-3">Milestones</th>
                      <th className="px-4 py-3 text-right">Approved Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {projectsData.projects.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-bold text-emerald-800">
                          {p.project_code}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{p.name}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            p.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : p.status === 'active'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">{p.client_name}</td>
                        <td className="px-4 py-3">{p.manager_name}</td>
                        <td className="px-4 py-3 min-w-[140px]">
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-slate-500">
                              <span>{p.completed_tasks} / {p.total_tasks} tasks</span>
                              <span className="font-bold">{p.task_completion_rate}%</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-emerald-600 h-1.5 rounded-full"
                                style={{ width: `${p.task_completion_rate}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 min-w-[120px]">
                          <span className="text-[11px] font-medium text-slate-700">
                            {p.completed_milestones} / {p.total_milestones} ({p.milestone_completion_rate}%)
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">
                          {p.approved_hours}h
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. TASK PERFORMANCE TAB */}
      {/* ======================================================== */}
      {!isLoading && activeTab === 'tasks' && (
        <div className="space-y-6">
          {/* Overdue Callout Table */}
          {overdueTasks.length > 0 && (
            <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-4 shadow-2xs space-y-3">
              <div className="flex items-center gap-2 text-rose-800">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <h3 className="text-xs font-bold uppercase tracking-wider">
                  Critical Overdue Tasks ({overdueTasks.length})
                </h3>
              </div>
              <div className="overflow-x-auto bg-white rounded-xl border border-rose-100">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-rose-50/50 text-[11px] font-bold text-rose-900 border-b border-rose-100">
                    <tr>
                      <th className="px-4 py-2">Code</th>
                      <th className="px-4 py-2">Title</th>
                      <th className="px-4 py-2">Project</th>
                      <th className="px-4 py-2">Due Date</th>
                      <th className="px-4 py-2 text-right">Days Overdue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-50">
                    {overdueTasks.slice(0, 5).map((t) => (
                      <tr key={t.id}>
                        <td className="px-4 py-2 font-bold text-slate-900">{t.task_code}</td>
                        <td className="px-4 py-2 font-medium">{t.title}</td>
                        <td className="px-4 py-2">{t.project_name}</td>
                        <td className="px-4 py-2">{t.due_date ? t.due_date.slice(0, 10) : '—'}</td>
                        <td className="px-4 py-2 text-right font-bold text-rose-700">
                          {t.days_overdue} days
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
              All Tasks Performance
            </h3>
            <select
              value={taskStatusFilter}
              onChange={(e) => setTaskStatusFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="in_review">In Review</option>
              <option value="blocked">Blocked</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {/* Tasks Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
            {tasksData.tasks.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400">
                No task performance records found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3">Task Title</th>
                      <th className="px-4 py-3">Project</th>
                      <th className="px-4 py-3">Priority</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Due Date</th>
                      <th className="px-4 py-3">Assignees</th>
                      <th className="px-4 py-3 text-right">Tracked</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tasksData.tasks.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-bold text-slate-900">{t.task_code}</td>
                        <td className="px-4 py-3 font-semibold text-slate-800">{t.title}</td>
                        <td className="px-4 py-3 text-slate-500">{t.project_name}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            t.priority === 'urgent'
                              ? 'bg-rose-100 text-rose-800'
                              : t.priority === 'high'
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {t.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            t.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : t.status === 'in_progress'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {t.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {t.due_date ? t.due_date.slice(0, 10) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center -space-x-1.5 overflow-hidden">
                            {t.assignees.map((a) => (
                              <div
                                key={a.id}
                                title={a.name}
                                className="w-5 h-5 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-[9px] ring-2 ring-white"
                              >
                                {a.name[0]}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">
                          {t.tracked_hours}h
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. TEAM WORKLOAD TAB */}
      {/* ======================================================== */}
      {!isLoading && activeTab === 'teams' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {teamsData.map((tm) => (
            <div
              key={tm.id}
              className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">{tm.name}</h3>
                  <p className="text-xs text-slate-500">Leader: {tm.leader_name}</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {tm.member_count} Members
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Assigned Tasks</span>
                  <span className="text-lg font-bold text-slate-900">{tm.assigned_tasks}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Completed Tasks</span>
                  <span className="text-lg font-bold text-emerald-700">{tm.completed_tasks}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Approved Hours</span>
                  <span className="text-lg font-bold text-slate-800">{tm.approved_hours}h</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Billable Hours</span>
                  <span className="text-lg font-bold text-emerald-800">{tm.billable_hours}h</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. TIME & TIMESHEETS TAB */}
      {/* ======================================================== */}
      {!isLoading && activeTab === 'time' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          {timeSummary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Hours</span>
                <p className="text-xl font-bold text-slate-900 mt-1">{timeSummary.totalHours}h</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Approved</span>
                <p className="text-xl font-bold text-emerald-700 mt-1">{timeSummary.approvedHours}h</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600">Pending</span>
                <p className="text-xl font-bold text-amber-700 mt-1">{timeSummary.pendingHours}h</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Billable</span>
                <p className="text-xl font-bold text-emerald-800 mt-1">{timeSummary.billableHours}h</p>
              </div>
            </div>
          )}

          {/* Project Hours Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Tracked Hours by Project
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Project</th>
                    <th className="px-4 py-3">Total Tracked</th>
                    <th className="px-4 py-3">Approved</th>
                    <th className="px-4 py-3">Pending</th>
                    <th className="px-4 py-3 text-right">Billable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {projectHours.map((ph) => (
                    <tr key={ph.projectId} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-bold text-slate-900">{ph.projectCode}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{ph.projectName}</td>
                      <td className="px-4 py-3 font-medium">{ph.totalHours}h</td>
                      <td className="px-4 py-3 text-emerald-700 font-bold">{ph.approvedHours}h</td>
                      <td className="px-4 py-3 text-amber-600">{ph.pendingHours}h</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-800">{ph.billableHours}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 6. CLIENT OVERVIEW TAB */}
      {/* ======================================================== */}
      {!isLoading && activeTab === 'clients' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
          {clientsData.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">
              No client summaries available.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Company</th>
                    <th className="px-4 py-3">Active Projects</th>
                    <th className="px-4 py-3">Completed Projects</th>
                    <th className="px-4 py-3">Total Tasks</th>
                    <th className="px-4 py-3 text-right">Approved Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {clientsData.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-bold text-slate-900">{c.name}</td>
                      <td className="px-4 py-3 font-medium text-slate-700">{c.company_name}</td>
                      <td className="px-4 py-3">{c.active_projects}</td>
                      <td className="px-4 py-3 text-emerald-700 font-semibold">{c.completed_projects}</td>
                      <td className="px-4 py-3">{c.total_tasks}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-800">{c.approved_hours}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Export Modal */}
      <ExportReportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        initialReportType={activeTab === 'dashboard' ? 'projects' : activeTab}
        dateRange={{ period, startDate, endDate }}
      />
    </div>
  );
}
