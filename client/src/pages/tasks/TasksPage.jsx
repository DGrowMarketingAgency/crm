import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { tasksService, projectsService, usersService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { TaskModal } from './TaskModal';
import {
  CheckSquare,
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
  LayoutGrid,
  Table as TableIcon,
  Loader2,
  AlertCircle,
  FolderKanban,
  Kanban,
  ListFilter,
  ArrowUpDown,
  Tag,
  ChevronRight,
  ExternalLink,
  ChevronLeft,
  Lock
} from 'lucide-react';

const STATUS_COLUMNS = [
  { key: 'todo', label: 'To Do', color: 'border-slate-300 bg-slate-50/50', badge: 'bg-slate-100 text-slate-700' },
  { key: 'in_progress', label: 'In Progress', color: 'border-blue-300 bg-blue-50/30', badge: 'bg-blue-50 text-blue-700' },
  { key: 'client_review', label: 'Client Review', color: 'border-purple-300 bg-purple-50/30', badge: 'bg-purple-50 text-purple-700' },
  { key: 'revision', label: 'Revision', color: 'border-amber-300 bg-amber-50/30', badge: 'bg-amber-50 text-amber-700' },
  { key: 'done', label: 'Done', color: 'border-emerald-300 bg-emerald-50/30', badge: 'bg-emerald-50 text-emerald-700' }
];

const PRIORITY_BADGES = {
  low: { label: 'Low', class: 'bg-slate-100 text-slate-700 border-slate-200' },
  medium: { label: 'Medium', class: 'bg-amber-50 text-amber-700 border-amber-200' },
  high: { label: 'High', class: 'bg-orange-50 text-orange-700 border-orange-200' },
  urgent: { label: 'Urgent', class: 'bg-rose-50 text-rose-700 border-rose-200 font-bold' }
};

export function TasksPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasPermission, isOwner, user: currentUser } = usePermission();

  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'my' | 'overdue'
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'kanban'

  // Data lists
  const [tasks, setTasks] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;

  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProject, setSelectedProject] = useState(searchParams.get('projectId') || '');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedPriority, setSelectedPriority] = useState('');
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  // Dropdowns data
  const [projectsList, setProjectsList] = useState([]);
  const [usersList, setUsersList] = useState([]);

  // Modals & UI states
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draggedTaskId, setDraggedTaskId] = useState(null);

  const canCreate = isOwner || hasPermission('tasks.create');

  useEffect(() => {
    loadFilterOptions();
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [
    activeTab,
    page,
    searchTerm,
    selectedProject,
    selectedStatus,
    selectedPriority,
    selectedAssignee,
    sortBy,
    sortOrder
  ]);

  const loadFilterOptions = async () => {
    try {
      const [pRes, uRes] = await Promise.all([
        projectsService.getProjects({ limit: 100 }),
        usersService.getUsers({ status: 'active', limit: 100 })
      ]);
      setProjectsList(pRes.data.projects || []);
      setUsersList(uRes.data.users || []);
    } catch (e) {
      console.error('Failed to load filter options:', e);
    }
  };

  const fetchTasks = async () => {
    setIsLoading(true);
    setError('');
    try {
      const offset = (page - 1) * limit;
      let res;

      const params = {
        search: searchTerm,
        projectId: selectedProject || undefined,
        status: selectedStatus || undefined,
        priority: selectedPriority || undefined,
        assigneeId: selectedAssignee || undefined,
        sortBy,
        sortOrder,
        limit,
        offset
      };

      if (activeTab === 'my') {
        res = await tasksService.getMyTasks(params);
      } else if (activeTab === 'overdue') {
        res = await tasksService.getTasks({
          ...params,
          isOverdue: true
        });
      } else {
        res = await tasksService.getTasks(params);
      }

      setTasks(res.data.tasks || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error('Fetch tasks error:', err);
      setError('Failed to load tasks. Please check your network or permissions.');
    } finally {
      setIsLoading(false);
    }
  };

  // Kanban Drag and Drop Handler
  const handleDragStart = (e, taskId) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.setData('text/plain', taskId);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = async (e, targetStatus) => {
    e.preventDefault();
    const taskId = draggedTaskId || Number(e.dataTransfer.getData('text/plain'));
    if (!taskId) return;

    const taskToUpdate = tasks.find((t) => t.id === taskId);
    const currentCol = taskToUpdate ? (taskToUpdate.column_status || taskToUpdate.status) : '';
    if (!taskToUpdate || currentCol === targetStatus) return;

    // Optimistic UI update
    const previousTasks = [...tasks];
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              column_status: targetStatus,
              status:
                targetStatus === 'done'
                  ? 'completed'
                  : targetStatus === 'client_review'
                  ? 'in_review'
                  : 'in_progress'
            }
          : t
      )
    );

    try {
      await tasksService.changeStatus(taskId, { column_status: targetStatus });
      setNotice(`Task #${taskToUpdate.task_code || taskId} moved to ${targetStatus.replace('_', ' ')}`);
      setTimeout(() => setNotice(''), 3500);
    } catch (err) {
      console.error('Status change error:', err);
      // Revert optimistic update
      setTasks(previousTasks);
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          'Status transition rejected. Invalid workflow path or missing permission.'
      );
      setTimeout(() => setError(''), 4500);
    } finally {
      setDraggedTaskId(null);
    }
  };

  const isOverdue = (task) => {
    if (!task.due_date || task.status === 'completed') return false;
    const now = new Date();
    const due = new Date(task.due_date);
    return due < now;
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-700 mb-1">
            <CheckSquare className="w-4 h-4" />
            <span>Workflow & Execution</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Task Management & Boards
          </h1>
          <p className="text-sm text-slate-500">
            Create, assign, coordinate subtasks, and track agency deliverables
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canCreate && (
            <button
              onClick={() => {
                setEditingTask(null);
                setTaskModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-brand-700 hover:bg-brand-800 rounded-xl shadow-md shadow-brand-700/20 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Create Task</span>
            </button>
          )}
        </div>
      </div>

      {/* Notice / Error banners */}
      {notice && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{notice}</span>
          </div>
          <button onClick={() => setNotice('')} className="text-emerald-700 hover:text-emerald-900 text-xs font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="text-rose-700 hover:text-rose-900 text-xs font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {/* Navigation Tabs & View Mode Switcher */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-slate-200 pb-3">
        {/* Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto">
          <button
            onClick={() => {
              setActiveTab('all');
              setPage(1);
            }}
            className={`px-3.5 py-2 text-sm font-medium rounded-lg transition shrink-0 ${
              activeTab === 'all'
                ? 'bg-brand-50 text-brand-700 font-semibold'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            All Tasks
          </button>
          <button
            onClick={() => {
              setActiveTab('my');
              setPage(1);
            }}
            className={`px-3.5 py-2 text-sm font-medium rounded-lg transition shrink-0 ${
              activeTab === 'my'
                ? 'bg-brand-50 text-brand-700 font-semibold'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            My Assigned Tasks
          </button>
          <button
            onClick={() => {
              setActiveTab('overdue');
              setPage(1);
            }}
            className={`px-3.5 py-2 text-sm font-medium rounded-lg transition shrink-0 flex items-center gap-1.5 ${
              activeTab === 'overdue'
                ? 'bg-rose-50 text-rose-700 font-semibold'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-rose-500" />
            <span>Overdue Tasks</span>
          </button>
        </div>

        {/* View Switcher: List vs Kanban */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
          <button
            onClick={() => setViewMode('list')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              viewMode === 'list'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span>List</span>
          </button>
          <button
            onClick={() => setViewMode('kanban')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              viewMode === 'kanban'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Kanban className="w-3.5 h-3.5" />
            <span>Kanban Board</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search Input */}
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              placeholder="Search title, code..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition"
            />
          </div>

          {/* Project Filter */}
          <div>
            <select
              value={selectedProject}
              onChange={(e) => {
                setSelectedProject(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-700 transition"
            >
              <option value="">All Projects</option>
              {projectsList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter (Hidden when in Kanban view) */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-700 transition"
            >
              <option value="">All Statuses</option>
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="in_review">In Review</option>
              <option value="blocked">Blocked</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {/* Priority Filter */}
          <div>
            <select
              value={selectedPriority}
              onChange={(e) => {
                setSelectedPriority(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-700 transition"
            >
              <option value="">All Priorities</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          {/* Assignee Filter */}
          <div>
            <select
              value={selectedAssignee}
              onChange={(e) => {
                setSelectedAssignee(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-700 transition"
            >
              <option value="">All Assignees</option>
              {usersList.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Sort controls */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <span>Sort by:</span>
            <button
              onClick={() => {
                setSortBy('created_at');
                setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
              }}
              className={`font-semibold hover:text-brand-700 flex items-center gap-1 ${
                sortBy === 'created_at' ? 'text-brand-700' : 'text-slate-600'
              }`}
            >
              Created Date {sortBy === 'created_at' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>
            <button
              onClick={() => {
                setSortBy('due_date');
                setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
              }}
              className={`font-semibold hover:text-brand-700 flex items-center gap-1 ${
                sortBy === 'due_date' ? 'text-brand-700' : 'text-slate-600'
              }`}
            >
              Deadline {sortBy === 'due_date' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>
            <button
              onClick={() => {
                setSortBy('priority');
                setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
              }}
              className={`font-semibold hover:text-brand-700 flex items-center gap-1 ${
                sortBy === 'priority' ? 'text-brand-700' : 'text-slate-600'
              }`}
            >
              Priority {sortBy === 'priority' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>
          </div>

          <div>
            Showing <span className="font-semibold text-slate-800">{tasks.length}</span> of{' '}
            <span className="font-semibold text-slate-800">{total}</span> tasks
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
          <p className="text-sm font-medium">Loading tasks...</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="py-20 bg-white rounded-2xl border border-slate-200/80 p-8 text-center max-w-lg mx-auto shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-brand-50 border border-brand-100 text-brand-700 flex items-center justify-center mx-auto mb-4">
            <CheckSquare className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1">No Tasks Found</h3>
          <p className="text-xs text-slate-500 mb-6">
            {searchTerm || selectedProject || selectedStatus
              ? 'Try modifying your filters or search keywords.'
              : 'Get started by creating your first task in an active project.'}
          </p>
          {canCreate && (
            <button
              onClick={() => {
                setEditingTask(null);
                setTaskModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-700 hover:bg-brand-800 rounded-xl shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              <span>Create Task</span>
            </button>
          )}
        </div>
      ) : viewMode === 'kanban' ? (
        /* KANBAN BOARD VIEW */
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 items-start overflow-x-auto pb-4">
          {STATUS_COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => {
              const taskCol = t.column_status || (t.status === 'completed' ? 'done' : (t.status === 'in_review' ? 'client_review' : t.status));
              return taskCol === col.key;
            });

            return (
              <div
                key={col.key}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, col.key)}
                className={`flex flex-col rounded-2xl border ${col.color} p-3.5 min-h-[500px] transition`}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200/60">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${col.badge}`}>
                      {col.label}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                    {colTasks.length}
                  </span>
                </div>

                {/* Task Cards */}
                <div className="space-y-3 flex-1 overflow-y-auto">
                  {colTasks.length === 0 ? (
                    <div className="text-center py-10 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                      Drop tasks here
                    </div>
                  ) : (
                    colTasks.map((t) => {
                      const overdue = isOverdue(t);
                      const priorityStyle = PRIORITY_BADGES[t.priority] || PRIORITY_BADGES.medium;

                      return (
                        <div
                          key={t.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, t.id)}
                          onClick={() => navigate(`/tasks/${t.id}`)}
                          className={`bg-white rounded-xl p-3.5 border shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing transition group ${
                            overdue ? 'border-rose-300' : 'border-slate-200 hover:border-brand-500/50'
                          }`}
                        >
                          {/* Task Code & Priority */}
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-mono font-bold text-slate-500 group-hover:text-brand-700 transition">
                              {t.task_code || `#${t.id}`}
                            </span>
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${priorityStyle.class}`}
                            >
                              {priorityStyle.label}
                            </span>
                          </div>

                          {/* D-Grow OS Badges: Source, Deliverable (CR), Revisions */}
                          <div className="flex flex-wrap items-center gap-1.5 mb-2">
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                                t.source === 'Workflow'
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              }`}
                            >
                              {t.source || 'Manual'}
                            </span>
                            {t.status === 'blocked' && (
                              <span
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1"
                                title="Blocked by prerequisite tasks"
                              >
                                <Lock className="w-3 h-3 text-amber-600" />
                                <span>Blocked</span>
                              </span>
                            )}
                            {Boolean(t.is_client_deliverable) && (
                              <span
                                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1"
                                title="Client Deliverable Review"
                              >
                                <CheckCircle2 className="w-3 h-3 text-purple-600" />
                                <span>CR</span>
                              </span>
                            )}
                            {Number(t.revision_count) > 0 && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300">
                                Rev #{t.revision_count}
                              </span>
                            )}
                          </div>

                          {/* Title */}
                          <h4 className="text-sm font-semibold text-slate-900 line-clamp-2 mb-2 leading-snug group-hover:text-brand-800 transition">
                            {t.title}
                          </h4>

                          {/* Client Name if present */}
                          {t.client_name && (
                            <p className="text-[11px] font-medium text-brand-700 mb-1 truncate">
                              🏢 {t.client_name}
                            </p>
                          )}

                          {/* Project Name */}
                          {t.project_name && (
                            <p className="text-[11px] font-medium text-slate-500 mb-2 truncate">
                              📁 {t.project_name}
                            </p>
                          )}

                          {/* Subtasks Progress */}
                          {t.subtask_count > 0 && (
                            <div className="flex items-center gap-2 mb-2.5">
                              <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="bg-brand-600 h-full rounded-full transition-all"
                                  style={{
                                    width: `${Math.round(
                                      (t.completed_subtask_count / t.subtask_count) * 100
                                    )}%`
                                  }}
                                />
                              </div>
                              <span className="text-[10px] font-medium text-slate-500 shrink-0">
                                {t.completed_subtask_count}/{t.subtask_count}
                              </span>
                            </div>
                          )}

                          {/* Card Footer: Due Date & Assignees */}
                          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                            {t.due_date ? (
                              <div
                                className={`flex items-center gap-1 text-[11px] font-medium ${
                                  overdue ? 'text-rose-600 font-semibold' : 'text-slate-500'
                                }`}
                              >
                                {overdue ? (
                                  <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                                ) : (
                                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                )}
                                <span>{t.due_date.slice(0, 10)}</span>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400">No due date</span>
                            )}

                            {/* Assignee Avatars */}
                            <div className="flex items-center -space-x-1.5 overflow-hidden">
                              {(t.assignees || []).slice(0, 3).map((a, i) => (
                                <div
                                  key={a.id || i}
                                  title={a.name}
                                  className="w-6 h-6 rounded-full bg-brand-700 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-xs"
                                >
                                  {a.name?.charAt(0).toUpperCase() || 'U'}
                                </div>
                              ))}
                              {(t.assignees || []).length > 3 && (
                                <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center justify-center border-2 border-white">
                                  +{t.assignees.length - 3}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* LIST VIEW */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-4">Task</th>
                  <th className="py-3.5 px-4">Project</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Priority</th>
                  <th className="py-3.5 px-4">Assignees</th>
                  <th className="py-3.5 px-4">Due Date</th>
                  <th className="py-3.5 px-4">Subtasks</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tasks.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-12 text-center text-xs text-slate-400">
                      No tasks found matching current filters.
                    </td>
                  </tr>
                ) : (
                  tasks.map((t) => {
                  const overdue = isOverdue(t);
                  const priorityStyle = PRIORITY_BADGES[t.priority] || PRIORITY_BADGES.medium;
                  const statusInfo =
                    STATUS_COLUMNS.find((s) => s.key === t.status) || STATUS_COLUMNS[0];

                  return (
                    <tr
                      key={t.id}
                      className="hover:bg-slate-50/80 transition cursor-pointer"
                      onClick={() => navigate(`/tasks/${t.id}`)}
                    >
                      {/* Task Info */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <span className="text-xs font-mono font-bold text-slate-500 shrink-0">
                            {t.task_code || `#${t.id}`}
                          </span>
                          <span className="font-semibold text-slate-900 hover:text-brand-700 line-clamp-1 transition">
                            {t.title}
                          </span>
                        </div>
                      </td>

                      {/* Project */}
                      <td className="py-3.5 px-4">
                        <span className="text-xs font-medium text-slate-600 block truncate max-w-[150px]">
                          {t.project_name || '—'}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                            t.status === 'blocked' ? 'bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1 w-fit' : statusInfo.badge
                          }`}
                        >
                          {t.status === 'blocked' && <Lock className="w-3 h-3 text-amber-700" />}
                          {t.status === 'blocked' ? 'Blocked' : statusInfo.label}
                        </span>
                      </td>

                      {/* Priority */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${priorityStyle.class}`}
                        >
                          {priorityStyle.label}
                        </span>
                      </td>

                      {/* Assignees */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center -space-x-1.5 overflow-hidden">
                          {(t.assignees || []).length === 0 ? (
                            <span className="text-xs text-slate-400">Unassigned</span>
                          ) : (
                            (t.assignees || []).slice(0, 3).map((a, i) => (
                              <div
                                key={a.id || i}
                                title={a.name}
                                className="w-6 h-6 rounded-full bg-brand-700 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-xs"
                              >
                                {a.name?.charAt(0).toUpperCase() || 'U'}
                              </div>
                            ))
                          )}
                          {(t.assignees || []).length > 3 && (
                            <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center justify-center border-2 border-white">
                              +{t.assignees.length - 3}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Due Date */}
                      <td className="py-3.5 px-4">
                        {t.due_date ? (
                          <div
                            className={`flex items-center gap-1.5 text-xs font-medium ${
                              overdue ? 'text-rose-600 font-bold' : 'text-slate-600'
                            }`}
                          >
                            {overdue && <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />}
                            <span>{t.due_date.slice(0, 10)}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      {/* Subtasks */}
                      <td className="py-3.5 px-4">
                        {t.subtask_count > 0 ? (
                          <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                            {t.completed_subtask_count}/{t.subtask_count} done
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => navigate(`/tasks/${t.id}`)}
                          className="p-1.5 text-slate-400 hover:text-brand-700 hover:bg-slate-100 rounded-lg transition"
                          title="View Details"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > limit && (
            <div className="p-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Page {page} of {Math.ceil(total / limit)}
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition"
                >
                  Previous
                </button>
                <button
                  disabled={page >= Math.ceil(total / limit)}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Task Creation / Edit Modal */}
      <TaskModal
        isOpen={taskModalOpen}
        onClose={() => {
          setTaskModalOpen(false);
          setEditingTask(null);
        }}
        task={editingTask}
        defaultProjectId={selectedProject}
        onSuccess={() => {
          fetchTasks();
          setNotice(editingTask ? 'Task updated successfully' : 'Task created successfully');
          setTimeout(() => setNotice(''), 3500);
        }}
      />
    </div>
  );
}
