import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { usePermission } from '../../hooks/usePermission';
import {
  reportsService,
  usersService,
  clientsService,
  leadsService
} from '../../services/api';
import {
  Users,
  Building2,
  FolderKanban,
  CheckSquare,
  TrendingUp,
  Clock,
  ShieldCheck,
  Lock,
  ArrowRight,
  Loader2,
  RefreshCw,
  PlusCircle,
  AlertCircle,
  CheckCircle2,
  Briefcase,
  Layers,
  ChevronRight
} from 'lucide-react';

export function DashboardPage() {
  const { user } = useAuth();
  const { permissions, hasPermission, isOwner } = usePermission();

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Live metrics states
  const [dashboardData, setDashboardData] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [clientCount, setClientCount] = useState(0);
  const [leadsCount, setLeadsCount] = useState(0);

  const fetchLiveMetrics = async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    else setIsLoading(true);
    setError('');

    try {
      const [dashRes, usersRes, clientsRes, leadsRes] = await Promise.allSettled([
        hasPermission('reports.view_dashboard')
          ? reportsService.getDashboard({ period: '30d' })
          : Promise.resolve({ data: null }),
        hasPermission('users.view')
          ? usersService.getUsers({ limit: 50 })
          : Promise.resolve({ data: { users: [] } }),
        hasPermission('clients.view')
          ? clientsService.getClients({ limit: 1 })
          : Promise.resolve({ data: { total: 0 } }),
        hasPermission('leads.view')
          ? leadsService.getLeads({ limit: 1 })
          : Promise.resolve({ data: { total: 0 } })
      ]);

      if (dashRes.status === 'fulfilled' && dashRes.value?.data) {
        setDashboardData(dashRes.value.data);
      }

      if (usersRes.status === 'fulfilled' && usersRes.value?.data) {
        setTeamMembers(usersRes.value.data.users || []);
      }

      if (clientsRes.status === 'fulfilled' && clientsRes.value?.data) {
        setClientCount(clientsRes.value.data.total ?? clientsRes.value.data.clients?.length ?? 0);
      }

      if (leadsRes.status === 'fulfilled' && leadsRes.value?.data) {
        setLeadsCount(leadsRes.value.data.total ?? leadsRes.value.data.leads?.length ?? 0);
      }
    } catch (err) {
      console.error('Failed to load metrics:', err);
      setError('Failed to fetch some live metrics.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLiveMetrics();
  }, []);

  const kpis = dashboardData?.kpis || {
    totalProjects: 0,
    activeProjects: 0,
    completedProjects: 0,
    totalTasks: 0,
    completedTasks: 0,
    inProgressTasks: 0,
    inReviewTasks: 0,
    totalHours: 0
  };

  return (
    <div className="space-y-6">
      {/* 1. Executive Welcome Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-md bg-[#e3272e] text-white text-[11px] font-bold uppercase tracking-wider shadow-sm shadow-red-600/30">
                D-GROW OS
              </span>
              <span className="text-xs font-semibold text-slate-400">Live Executive Matrix</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
              Welcome back, {user?.name || 'Administrator'}!
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Agency Operations, Client Pipelines, Workload Matrices & Leadership Governance.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-800 text-xs font-semibold">
              Primary Role: {user?.role?.toUpperCase()}
            </span>
            <span
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                user?.status === 'active'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
            >
              Status: {user?.status?.toUpperCase()}
            </span>
            <button
              onClick={() => fetchLiveMetrics(true)}
              disabled={isRefreshing}
              title="Refresh Live Data"
              className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#e3272e]' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Real Operational Metrics (6 Matrix Cards) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Card 1: Team Members */}
        <Link
          to="/users"
          className="group bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm hover:border-[#e3272e]/50 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-400 group-hover:text-[#e3272e]">
            <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Users className="w-4 h-4" />
            </div>
            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900 block leading-tight">
              {teamMembers.length}
            </span>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mt-0.5">
              Agency Team
            </span>
          </div>
        </Link>

        {/* Card 2: Clients */}
        <Link
          to="/clients"
          className="group bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm hover:border-[#e3272e]/50 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-400 group-hover:text-[#e3272e]">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Building2 className="w-4 h-4" />
            </div>
            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900 block leading-tight">
              {clientCount}
            </span>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mt-0.5">
              Total Clients
            </span>
          </div>
        </Link>

        {/* Card 3: Active Projects */}
        <Link
          to="/projects"
          className="group bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm hover:border-[#e3272e]/50 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-400 group-hover:text-[#e3272e]">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center group-hover:scale-105 transition-transform">
              <FolderKanban className="w-4 h-4" />
            </div>
            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900 block leading-tight">
              {kpis.activeProjects || 0}
            </span>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mt-0.5">
              Active Projects
            </span>
          </div>
        </Link>

        {/* Card 4: Tasks */}
        <Link
          to="/tasks"
          className="group bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm hover:border-[#e3272e]/50 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-400 group-hover:text-[#e3272e]">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center group-hover:scale-105 transition-transform">
              <CheckSquare className="w-4 h-4" />
            </div>
            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900 block leading-tight">
              {kpis.totalTasks || 0}
            </span>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mt-0.5">
              Task Board
            </span>
          </div>
        </Link>

        {/* Card 5: BD Pipelines & Leads */}
        <Link
          to="/leads"
          className="group bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm hover:border-[#e3272e]/50 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-400 group-hover:text-[#e3272e]">
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center group-hover:scale-105 transition-transform">
              <TrendingUp className="w-4 h-4" />
            </div>
            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900 block leading-tight">
              {leadsCount}
            </span>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mt-0.5">
              BD Pipeline Leads
            </span>
          </div>
        </Link>

        {/* Card 6: Hours Tracked */}
        <Link
          to="/time"
          className="group bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm hover:border-[#e3272e]/50 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-400 group-hover:text-[#e3272e]">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Clock className="w-4 h-4" />
            </div>
            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900 block leading-tight">
              {kpis.totalHours || 0}h
            </span>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mt-0.5">
              Hours Logged
            </span>
          </div>
        </Link>
      </div>

      {/* 3. Agency Team & Multi-Designations Matrix */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#e3272e]" />
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Agency Team & Multi-Designation Matrix
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Real agency accounts reconciled with designated roles and permissions.
            </p>
          </div>
          <Link
            to="/users"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#e3272e] hover:text-red-700"
          >
            <span>Manage Team Directory</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {isLoading ? (
          <div className="py-12 flex justify-center items-center">
            <Loader2 className="w-6 h-6 animate-spin text-[#e3272e]" />
          </div>
        ) : teamMembers.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No team members provisioned yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-600 font-semibold">
                <tr>
                  <th className="px-5 py-3">Team Member</th>
                  <th className="px-5 py-3">Designations</th>
                  <th className="px-5 py-3">System Roles</th>
                  <th className="px-5 py-3">Department</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {teamMembers.slice(0, 5).map((member) => (
                  <tr key={member.id} className="hover:bg-slate-50/50 transition-colors">
                    {/* Name & Email */}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#e3272e] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm shadow-red-700/30">
                          {member.name[0]?.toUpperCase() || 'U'}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-900 block leading-tight">
                            {member.name}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {member.email}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Multi-Designations */}
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1 max-w-[280px]">
                        {member.designations && member.designations.length > 0 ? (
                          member.designations.map((des, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-rose-50 text-rose-900 border border-rose-200"
                            >
                              {des}
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </div>
                    </td>

                    {/* Assigned Roles */}
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {member.roles && member.roles.length > 0 ? (
                          member.roles.map((r) => (
                            <span
                              key={r.id}
                              className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${
                                r.slug === 'owner'
                                  ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                  : r.slug === 'admin'
                                  ? 'bg-red-50 text-red-800 border border-red-200'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {r.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] text-slate-400 capitalize">
                            {member.primary_role || 'Member'}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Department */}
                    <td className="px-5 py-3 font-medium text-slate-700">
                      {member.department || '—'}
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3">
                      <span
                        className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                          member.status === 'active'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {member.status === 'inactive' ? 'Pending Invite' : member.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Directory Link Footer if more than 5 members */}
        {teamMembers.length > 5 && (
          <div className="px-5 py-3 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">
              Showing top 5 of {teamMembers.length} team members
            </span>
            <Link
              to="/users"
              className="font-semibold text-[#e3272e] hover:text-red-700 inline-flex items-center gap-1 transition-colors"
            >
              <span>View All {teamMembers.length} in Directory</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
      </div>

      {/* 4. Operational Columns & Empty States */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Task Board Operational Status */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-[#e3272e]" />
              <h3 className="text-sm font-bold text-slate-900">Task Board Pipeline</h3>
            </div>
            <Link
              to="/tasks"
              className="text-xs font-semibold text-[#e3272e] hover:text-red-700 flex items-center gap-1"
            >
              <span>View Board</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* 5-Column Distribution Indicators */}
          <div className="grid grid-cols-4 gap-2.5 mt-4">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
              <span className="text-xs font-semibold text-slate-500 block">To Do</span>
              <span className="text-xl font-bold text-slate-800 block mt-1">
                {kpis.todoTasks || 0}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-100 text-center">
              <span className="text-xs font-semibold text-blue-700 block">In Progress</span>
              <span className="text-xl font-bold text-blue-900 block mt-1">
                {kpis.inProgressTasks || 0}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-100 text-center">
              <span className="text-xs font-semibold text-amber-700 block">In Review</span>
              <span className="text-xl font-bold text-amber-900 block mt-1">
                {kpis.inReviewTasks || 0}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-100 text-center">
              <span className="text-xs font-semibold text-emerald-700 block">Completed</span>
              <span className="text-xl font-bold text-emerald-900 block mt-1">
                {kpis.completedTasks || 0}
              </span>
            </div>
          </div>

          {/* Accurate Clean Empty State */}
          {kpis.totalTasks === 0 && (
            <div className="mt-5 p-6 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-semibold text-slate-700">All task columns are clear</p>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                No active internal tasks or client deliverable assignments exist. Create a task or trigger a service workflow.
              </p>
              <div className="pt-2">
                <Link
                  to="/tasks"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#e3272e] hover:bg-red-700 rounded-lg shadow-sm"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Create Task</span>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Right: Clients & Project Delivery Pipeline */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#e3272e]" />
              <h3 className="text-sm font-bold text-slate-900">Clients & Service Delivery</h3>
            </div>
            <Link
              to="/clients"
              className="text-xs font-semibold text-[#e3272e] hover:text-red-700 flex items-center gap-1"
            >
              <span>View Clients</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-2.5 mt-4">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
              <span className="text-xs font-semibold text-slate-500 block">Total Clients</span>
              <span className="text-xl font-bold text-slate-800 block mt-1">
                {clientCount}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-100 text-center">
              <span className="text-xs font-semibold text-blue-700 block">Active Projects</span>
              <span className="text-xl font-bold text-blue-900 block mt-1">
                {kpis.activeProjects || 0}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-purple-50/60 border border-purple-100 text-center">
              <span className="text-xs font-semibold text-purple-700 block">BD Funnels</span>
              <span className="text-xl font-bold text-purple-900 block mt-1">
                {leadsCount}
              </span>
            </div>
          </div>

          {/* Accurate Clean Empty State */}
          {clientCount === 0 && (
            <div className="mt-5 p-6 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-center space-y-2">
              <Briefcase className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-semibold text-slate-700">No active clients in pipeline</p>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                No active clients in pipeline. Ready to onboard new agency clients and projects.
              </p>
              <div className="pt-2">
                <Link
                  to="/clients"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#e3272e] hover:bg-red-700 rounded-lg shadow-sm"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Onboard First Client</span>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 5. RBAC & Security Quick Links */}
      {hasPermission('roles.view') && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Link
            to="/roles"
            className="group p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:border-[#e3272e]/50 hover:shadow-md transition-all flex items-start justify-between"
          >
            <div className="space-y-1.5">
              <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                Custom Roles & Permissions Matrix
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed max-w-sm">
                Fine-tune granular permission matrices across all agency modules and enforce strict role boundaries.
              </p>
            </div>
            <span className="p-2 rounded-lg bg-slate-50 text-slate-400 group-hover:text-brand-700 group-hover:bg-brand-50 transition-colors">
              <ArrowRight className="w-4 h-4" />
            </span>
          </Link>

          <Link
            to="/audit-logs"
            className="group p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:border-[#e3272e]/50 hover:shadow-md transition-all flex items-start justify-between"
          >
            <div className="space-y-1.5">
              <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                Security Audit Trail
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed max-w-sm">
                Inspect immutable audit logs for role modifications, user privilege events, and security access logs.
              </p>
            </div>
            <span className="p-2 rounded-lg bg-slate-50 text-slate-400 group-hover:text-slate-900 group-hover:bg-slate-100 transition-colors">
              <ArrowRight className="w-4 h-4" />
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}
