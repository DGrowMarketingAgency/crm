import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsService, clientsService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { ProjectModal } from './ProjectModal';
import {
  FolderKanban,
  Plus,
  Search,
  Filter,
  Calendar,
  User,
  Users,
  Flag,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  ArrowUpDown,
  LayoutGrid,
  Table as TableIcon,
  Loader2,
  AlertCircle,
  Archive,
  ChevronRight,
  TrendingUp,
  ShieldCheck,
  Building2
} from 'lucide-react';

export function ProjectsPage() {
  const navigate = useNavigate();
  const { hasPermission, isOwner } = usePermission();

  const [projects, setProjects] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 12;

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedPriority, setSelectedPriority] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'

  // Dropdown data
  const [clientsList, setClientsList] = useState([]);

  // Modals & States
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const canCreate = isOwner || hasPermission('projects.create');
  const canUpdate = isOwner || hasPermission('projects.update');

  useEffect(() => {
    loadClients();
    fetchMetrics();
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [page, searchTerm, selectedStatus, selectedPriority, selectedClient, sortBy]);

  const loadClients = async () => {
    try {
      const res = await clientsService.getClients({ limit: 100 });
      setClientsList(res.data.clients || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMetrics = async () => {
    try {
      const res = await projectsService.getMetrics();
      setMetrics(res.data.metrics);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchProjects = async () => {
    setIsLoading(true);
    setError('');
    try {
      const offset = (page - 1) * limit;
      const res = await projectsService.getProjects({
        search: searchTerm,
        status: selectedStatus,
        priority: selectedPriority,
        clientId: selectedClient,
        sortBy,
        limit,
        offset
      });
      setProjects(res.data.projects || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.error?.message || (typeof err.response?.data?.error === 'string' ? err.response?.data?.error : (err.message || 'Failed to load projects.'));
      setError(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  const handleOpenCreate = () => {
    setEditingProject(null);
    setProjectModalOpen(true);
  };

  const handleOpenEdit = (proj, e) => {
    e.stopPropagation();
    setEditingProject(proj);
    setProjectModalOpen(true);
  };

  const totalPages = Math.ceil(total / limit) || 1;

  // Health Pill styling
  const getHealthBadge = (health) => {
    switch (health) {
      case 'completed':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">Completed</span>;
      case 'on_track':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">On Track</span>;
      case 'at_risk':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">At Risk</span>;
      case 'delayed':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">Delayed</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">Pending</span>;
    }
  };

  // Priority Pill styling
  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'urgent':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800 uppercase">Urgent</span>;
      case 'high':
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-orange-100 text-orange-800 uppercase">High</span>;
      case 'medium':
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 uppercase">Medium</span>;
      case 'low':
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-700 uppercase">Low</span>;
    }
  };

  // Status Pill styling
  const getStatusBadge = (status) => {
    switch (status) {
      case 'active':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 capitalize">Active</span>;
      case 'completed':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 capitalize">Completed</span>;
      case 'on_hold':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 capitalize">On Hold</span>;
      case 'cancelled':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 capitalize">Cancelled</span>;
      case 'planning':
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 capitalize">Planning</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FolderKanban className="h-7 w-7 text-emerald-600" />
            Project Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Coordinate client accounts, project teams, deliverable timelines, and milestone completion.
          </p>
        </div>

        {canCreate && (
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition shadow-sm self-start sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            Create Project
          </button>
        )}
      </div>

      {/* Notifications */}
      {notice && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-3 text-emerald-800 text-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span className="font-medium">{notice}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-3 text-rose-800 text-sm">
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Metrics Dashboard Cards */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">Total Projects</span>
            <span className="text-2xl font-bold text-gray-900 mt-1 block">{metrics.totalProjects}</span>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider block">Active</span>
            <span className="text-2xl font-bold text-emerald-700 mt-1 block">{metrics.activeProjects}</span>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider block">Completed</span>
            <span className="text-2xl font-bold text-blue-700 mt-1 block">{metrics.completedProjects}</span>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider block">On Hold</span>
            <span className="text-2xl font-bold text-amber-700 mt-1 block">{metrics.onHoldProjects}</span>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Planning</span>
            <span className="text-2xl font-bold text-slate-700 mt-1 block">{metrics.planningProjects}</span>
          </div>
          <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-sm bg-rose-50/30">
            <span className="text-xs font-semibold text-rose-600 uppercase tracking-wider block">Overdue</span>
            <span className="text-2xl font-bold text-rose-700 mt-1 block">{metrics.overdueProjects}</span>
          </div>
        </div>
      )}

      {/* Search, Filter & View Controls */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col lg:flex-row gap-3 justify-between items-stretch lg:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search projects by name, code, or description..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">All Statuses</option>
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="on_hold">On Hold</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {/* Priority Filter */}
          <select
            value={selectedPriority}
            onChange={(e) => {
              setSelectedPriority(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Client Filter */}
          <select
            value={selectedClient}
            onChange={(e) => {
              setSelectedClient(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 max-w-[150px]"
          >
            <option value="">All Clients</option>
            {clientsList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name || c.name}
              </option>
            ))}
          </select>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="created_at">Recently Created</option>
            <option value="due_date">Due Date</option>
            <option value="name">Project Name</option>
            <option value="priority">Priority</option>
          </select>

          {/* Grid vs Table View Toggle */}
          <div className="flex border border-gray-300 rounded-lg overflow-hidden shrink-0">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 text-xs ${
                viewMode === 'grid' ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-gray-500 hover:bg-gray-50'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 text-xs border-l border-gray-200 ${
                viewMode === 'table' ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-gray-500 hover:bg-gray-50'
              }`}
              title="Table View"
            >
              <TableIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Projects List Content */}
      {isLoading ? (
        <div className="p-16 text-center bg-white rounded-xl border border-gray-200">
          <Loader2 className="h-8 w-8 text-emerald-600 animate-spin mx-auto" />
          <p className="mt-3 text-sm text-gray-500">Loading accessible projects...</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="p-14 text-center bg-white rounded-xl border border-gray-200">
          <FolderKanban className="h-12 w-12 text-gray-300 mx-auto" />
          <h3 className="mt-4 text-base font-semibold text-gray-900">No projects found</h3>
          <p className="mt-1 text-sm text-gray-500 max-w-sm mx-auto">
            {searchTerm || selectedStatus || selectedPriority || selectedClient
              ? 'No projects match your current filters.'
              : 'Create a new project or get assigned to participate in projects.'}
          </p>
          {canCreate && !searchTerm && !selectedStatus && (
            <button
              onClick={handleOpenCreate}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
            >
              <Plus className="h-4 w-4" />
              Create Project
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid Cards View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map((proj) => (
            <div
              key={proj.id}
              onClick={() => navigate(`/projects/${proj.id}`)}
              className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-emerald-300 transition cursor-pointer p-5 flex flex-col justify-between group"
            >
              <div>
                {/* Header: Code & Health */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                    {proj.project_code}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {getHealthBadge(proj.health)}
                    {getPriorityBadge(proj.priority)}
                  </div>
                </div>

                {/* Name */}
                <h3 className="font-bold text-gray-900 text-base group-hover:text-emerald-700 transition line-clamp-1 mt-1">
                  {proj.name}
                </h3>

                {/* Client & Description */}
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5 text-gray-400" />
                  {proj.client_name ? (
                    <span className="font-medium text-gray-700">{proj.client_company || proj.client_name}</span>
                  ) : (
                    <span className="italic text-gray-400">Internal Agency</span>
                  )}
                </p>

                <p className="text-xs text-gray-600 line-clamp-2 mt-2 min-h-[32px]">
                  {proj.description || <span className="italic text-gray-400">No project description provided.</span>}
                </p>

                {/* Milestone Progress Bar */}
                <div className="mt-4 pt-3 border-t border-gray-100">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-500 font-medium">Milestones</span>
                    <span className="font-semibold text-gray-900">
                      {proj.completed_milestones} / {proj.total_milestones} ({proj.milestone_progress}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        proj.milestone_progress === 100
                          ? 'bg-blue-600'
                          : proj.health === 'delayed'
                          ? 'bg-rose-500'
                          : 'bg-emerald-600'
                      }`}
                      style={{ width: `${proj.milestone_progress}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div className="mt-5 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                <div className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-gray-400" />
                  <span className="font-medium text-gray-800 truncate max-w-[110px]" title={proj.manager_name}>
                    {proj.manager_name}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {proj.due_date && (
                    <span className="flex items-center gap-1 text-[11px] text-gray-500">
                      <Calendar className="h-3 w-3" />
                      {new Date(proj.due_date).toLocaleDateString()}
                    </span>
                  )}
                  {getStatusBadge(proj.status)}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Table View */
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
              <thead className="bg-gray-50 text-gray-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Code / Project</th>
                  <th className="px-5 py-3">Client</th>
                  <th className="px-5 py-3">Manager</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Priority</th>
                  <th className="px-5 py-3">Progress</th>
                  <th className="px-5 py-3">Due Date</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {projects.map((proj) => (
                  <tr
                    key={proj.id}
                    onClick={() => navigate(`/projects/${proj.id}`)}
                    className="hover:bg-gray-50 transition cursor-pointer"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-gray-700">{proj.project_code}</span>
                        <span className="font-semibold text-gray-900 truncate max-w-xs">{proj.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-gray-700">
                      {proj.client_company || proj.client_name || <span className="italic text-gray-400">Internal</span>}
                    </td>
                    <td className="px-5 py-3.5 text-gray-700 font-medium">
                      {proj.manager_name}
                    </td>
                    <td className="px-5 py-3.5">
                      {getStatusBadge(proj.status)}
                    </td>
                    <td className="px-5 py-3.5">
                      {getPriorityBadge(proj.priority)}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2 w-28">
                        <div className="flex-1 bg-gray-100 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-emerald-600 h-full rounded-full"
                            style={{ width: `${proj.milestone_progress}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-semibold text-gray-700">{proj.milestone_progress}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-gray-500">
                      {proj.due_date ? new Date(proj.due_date).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-5 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => navigate(`/projects/${proj.id}`)}
                        className="text-emerald-600 hover:text-emerald-800 font-semibold"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {!isLoading && projects.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between bg-white px-4 py-3 rounded-xl border border-gray-200">
          <p className="text-xs text-gray-500">
            Showing <span className="font-medium">{(page - 1) * limit + 1}</span> to{' '}
            <span className="font-medium">{Math.min(page * limit, total)}</span> of{' '}
            <span className="font-medium">{total}</span> projects
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page === 1}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="px-3 py-1.5 text-xs text-gray-600 font-medium">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              disabled={page === totalPages}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Project Modal (Create/Edit) */}
      <ProjectModal
        isOpen={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        project={editingProject}
        onSuccess={(msg) => {
          showToast(msg);
          fetchMetrics();
          fetchProjects();
        }}
      />
    </div>
  );
}
