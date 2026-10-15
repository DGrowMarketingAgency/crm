import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { projectsService, usersService, teamsService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { ProjectModal } from './ProjectModal';
import { MilestoneModal } from './MilestoneModal';
import { WorkflowPreviewModal } from '../../components/automation/WorkflowPreviewModal';
import { WorkflowExecutionStatus } from '../../components/automation/WorkflowExecutionStatus';
import {
  FolderKanban,
  ArrowLeft,
  Edit2,
  Calendar,
  Building2,
  User,
  Users,
  Flag,
  CheckCircle2,
  Clock,
  Archive,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  Layers,
  History,
  Settings,
  UserCheck,
  Check,
  X,
  ExternalLink,
  ChevronRight,
  CheckSquare,
  Sparkles
} from 'lucide-react';

export function ProjectDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission, isOwner, user } = usePermission();

  const [project, setProject] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'milestones' | 'team' | 'activity' | 'settings'

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isMilestoneModalOpen, setIsMilestoneModalOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState(null);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

  // Activity Log
  const [activityLogs, setActivityLogs] = useState([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);

  // Permissions
  const canUpdate = isOwner || hasPermission('projects.update');
  const canChangeStatus = isOwner || hasPermission('projects.change_status');
  const canArchive = isOwner || hasPermission('projects.archive');
  const canManageMembers = isOwner || hasPermission('projects.manage_members');
  const canManageMilestones = isOwner || hasPermission('milestones.update');
  const canCreateMilestone = isOwner || hasPermission('milestones.create');

  useEffect(() => {
    fetchProjectDetails();
  }, [id]);

  useEffect(() => {
    if (activeTab === 'activity') {
      loadActivity();
    }
  }, [activeTab, id]);

  const fetchProjectDetails = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await projectsService.getProject(id);
      setProject(res.data.project);
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.error?.message || (typeof err.response?.data?.error === 'string' ? err.response?.data?.error : (err.message || 'Failed to load project details.'));
      setError(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const loadActivity = async () => {
    setIsLoadingActivity(true);
    try {
      const res = await projectsService.getActivity(id);
      setActivityLogs(res.data.activity || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingActivity(false);
    }
  };

  const showToast = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  const handleToggleMilestoneComplete = async (milestone) => {
    const nextStatus = milestone.status === 'completed' ? 'in_progress' : 'completed';
    try {
      await projectsService.changeMilestoneStatus(id, milestone.id, nextStatus);
      showToast(`Milestone marked as ${nextStatus}.`);
      fetchProjectDetails();
    } catch (err) {
      const errMsg = err.response?.data?.error?.message || (typeof err.response?.data?.error === 'string' ? err.response?.data?.error : (err.message || 'Failed to update milestone status.'));
      setError(errMsg);
    }
  };

  const handleDeleteMilestone = async (milestoneId) => {
    if (!window.confirm('Are you sure you want to delete this milestone?')) return;
    try {
      await projectsService.deleteMilestone(id, milestoneId);
      showToast('Milestone deleted.');
      fetchProjectDetails();
    } catch (err) {
      const errMsg = err.response?.data?.error?.message || (typeof err.response?.data?.error === 'string' ? err.response?.data?.error : (err.message || 'Failed to delete milestone.'));
      setError(errMsg);
    }
  };

  const handleArchiveProject = async () => {
    try {
      await projectsService.archiveProject(id);
      showToast('Project has been archived.');
      setIsArchiveModalOpen(false);
      fetchProjectDetails();
    } catch (err) {
      const errMsg = err.response?.data?.error?.message || (typeof err.response?.data?.error === 'string' ? err.response?.data?.error : (err.message || 'Failed to archive project.'));
      setError(errMsg);
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      await projectsService.changeStatus(id, newStatus);
      showToast(`Project status changed to ${newStatus}.`);
      fetchProjectDetails();
    } catch (err) {
      const errMsg = err.response?.data?.error?.message || (typeof err.response?.data?.error === 'string' ? err.response?.data?.error : (err.message || 'Failed to change project status.'));
      setError(errMsg);
    }
  };

  if (isLoading) {
    return (
      <div className="p-16 text-center bg-white rounded-xl border border-gray-200">
        <Loader2 className="h-8 w-8 text-emerald-600 animate-spin mx-auto" />
        <p className="mt-3 text-sm text-gray-500">Loading project details and deliverables...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="space-y-4">
        <Link
          to="/projects"
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-emerald-600 font-medium"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Projects
        </Link>
        <div className="p-8 text-center bg-white rounded-xl border border-rose-200 text-rose-800">
          <AlertCircle className="h-10 w-10 text-rose-500 mx-auto mb-2" />
          <h2 className="text-lg font-bold">Error Accessing Project</h2>
          <p className="text-sm mt-1">{error || 'Project not found or you do not have permission to access it.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Link
              to="/projects"
              className="p-2 text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition shrink-0 mt-0.5"
              title="Back to Projects"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                  {project.project_code}
                </span>
                <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
                {project.is_archived && (
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-gray-100 text-gray-600 border border-gray-300">
                    Archived
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 mt-1.5">
                <span className="flex items-center gap-1 text-gray-700">
                  <Building2 className="h-3.5 w-3.5 text-gray-400" />
                  {project.client_company || project.client_name ? (
                    <span className="font-medium">{project.client_company || project.client_name}</span>
                  ) : (
                    <span className="italic text-gray-400">Internal Agency</span>
                  )}
                </span>

                <span className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5 text-gray-400" />
                  <span>PM: <strong>{project.manager_name}</strong></span>
                </span>

                {project.due_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-gray-400" />
                    <span>Target: {new Date(project.due_date).toLocaleDateString()}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2.5 self-start md:self-auto">
            <Link
              to={`/tasks?projectId=${project.id}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-semibold hover:bg-emerald-100 shadow-xs transition"
            >
              <CheckSquare className="h-3.5 w-3.5" />
              <span>Project Tasks</span>
            </Link>

            {project.workflow_preset_id && (
              <button
                onClick={() => setIsPreviewModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-[#10b981]/30 bg-emerald-50 text-[#047857] rounded-lg text-xs font-bold hover:bg-emerald-100 shadow-xs transition"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Preview Workflow</span>
              </button>
            )}

            {canUpdate && (
              <button
                onClick={() => setIsEditModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-gray-300 bg-white text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-50 shadow-sm transition"
              >
                <Edit2 className="h-3.5 w-3.5 text-gray-500" />
                Edit Project
              </button>
            )}

            {canChangeStatus && (
              <select
                value={project.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-xs font-semibold bg-white focus:ring-2 focus:ring-emerald-500 capitalize"
              >
                <option value="planning">Status: Planning</option>
                <option value="active">Status: Active</option>
                <option value="on_hold">Status: On Hold</option>
                <option value="completed">Status: Completed</option>
                <option value="cancelled">Status: Cancelled</option>
              </select>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-100 pt-2 -mb-2 overflow-x-auto gap-6 text-sm">
          {[
            { key: 'overview', label: 'Overview', icon: FolderKanban },
            { key: 'workflow', label: 'Workflow Engine', icon: Sparkles },
            { key: 'milestones', label: `Milestones (${project.milestones?.length || 0})`, icon: Flag },
            { key: 'team', label: `Team & Members (${project.members?.length || 0})`, icon: Users },
            { key: 'activity', label: 'Activity History', icon: History },
            { key: 'settings', label: 'Settings', icon: Settings }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`pb-3 font-semibold text-xs flex items-center gap-1.5 transition-colors border-b-2 whitespace-nowrap ${
                  isActive
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Notifications */}
      {notice && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-3 text-emerald-800 text-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span className="font-medium">{notice}</span>
        </div>
      )}

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Description & Objectives */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                Project Overview & Scope
              </h2>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                {project.description || <span className="italic text-gray-400">No project description provided.</span>}
              </p>

              {project.objectives && (
                <div className="mt-6 pt-5 border-t border-gray-100">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                    Key Deliverable Objectives
                  </h3>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                    {project.objectives}
                  </p>
                </div>
              )}

              {project.notes && (
                <div className="mt-6 pt-5 border-t border-gray-100">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                    Internal Specifications & Notes
                  </h3>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                    {project.notes}
                  </p>
                </div>
              )}
            </div>

            {/* Upcoming Milestones Widget */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                  <Flag className="h-4 w-4 text-emerald-600" />
                  Upcoming Milestones
                </h2>
                <button
                  onClick={() => setActiveTab('milestones')}
                  className="text-xs text-emerald-600 font-semibold hover:underline"
                >
                  View All
                </button>
              </div>

              {project.milestones?.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No milestones defined for this project.</p>
              ) : (
                <div className="space-y-2.5">
                  {project.milestones.slice(0, 4).map((m) => (
                    <div
                      key={m.id}
                      className="p-3 rounded-lg border border-gray-100 bg-gray-50/50 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            m.status === 'completed'
                              ? 'bg-blue-600'
                              : m.status === 'in_progress'
                              ? 'bg-emerald-500'
                              : 'bg-gray-300'
                          }`}
                        />
                        <span className="font-semibold text-gray-900">{m.title}</span>
                      </div>
                      <span className="text-gray-500">
                        {m.due_date ? new Date(m.due_date).toLocaleDateString() : 'No date'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar Stats & Timeline */}
          <div className="space-y-6">
            {/* Progress Card */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
                Milestone Completion
              </h2>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-2xl font-bold text-gray-900">{project.milestone_progress}%</span>
                <span className="text-xs text-gray-500 font-medium">
                  {project.completed_milestones} / {project.total_milestones} done
                </span>
              </div>
              <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden mt-2">
                <div
                  className="bg-emerald-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${project.milestone_progress}%` }}
                />
              </div>

              <div className="mt-5 pt-4 border-t border-gray-100 space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Priority:</span>
                  <span className="font-semibold text-gray-800 uppercase">{project.priority}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Visibility:</span>
                  <span className="font-semibold text-gray-800 capitalize">{project.visibility}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Start Date:</span>
                  <span className="font-medium text-gray-800">
                    {project.start_date ? new Date(project.start_date).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Target Due Date:</span>
                  <span className="font-medium text-gray-800">
                    {project.due_date ? new Date(project.due_date).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Team Info */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5">
                <Users className="h-4 w-4 text-emerald-600" />
                Staff Allocation
              </h2>
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-gray-400 block font-medium">Project Manager</span>
                  <span className="font-bold text-gray-900 text-sm mt-0.5 block">{project.manager_name}</span>
                  <span className="text-gray-500 text-[11px]">{project.manager_email}</span>
                </div>
                <div className="pt-2 border-t border-gray-100 flex justify-between">
                  <span className="text-gray-500">Assigned Teams:</span>
                  <span className="font-semibold text-gray-900">{project.teams?.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Assigned Members:</span>
                  <span className="font-semibold text-gray-900">{project.members?.length || 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MILESTONES */}
      {activeTab === 'milestones' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Flag className="h-5 w-5 text-emerald-600" />
                Project Milestones
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Target dates and deliverable milestones tracking project execution.
              </p>
            </div>

            {canCreateMilestone && (
              <button
                onClick={() => {
                  setEditingMilestone(null);
                  setIsMilestoneModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition"
              >
                <Plus className="h-4 w-4" />
                Add Milestone
              </button>
            )}
          </div>

          {project.milestones?.length === 0 ? (
            <div className="p-12 text-center">
              <Flag className="h-10 w-10 text-gray-300 mx-auto" />
              <h3 className="mt-3 text-sm font-semibold text-gray-900">No milestones yet</h3>
              <p className="mt-1 text-xs text-gray-500">Break project deliverables into trackable milestones.</p>
              {canCreateMilestone && (
                <button
                  onClick={() => setIsMilestoneModalOpen(true)}
                  className="mt-4 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700"
                >
                  Create First Milestone
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {project.milestones.map((m) => {
                const isCompleted = m.status === 'completed';
                return (
                  <div
                    key={m.id}
                    className="p-4 hover:bg-gray-50 transition flex items-center justify-between gap-4 text-xs"
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <button
                        onClick={() => handleToggleMilestoneComplete(m)}
                        title={isCompleted ? 'Mark Incomplete' : 'Mark Completed'}
                        className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center border transition shrink-0 ${
                          isCompleted
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'border-gray-300 hover:border-emerald-600 text-transparent'
                        }`}
                      >
                        <Check className="h-3.5 w-3.5 stroke-[3]" />
                      </button>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold text-sm ${isCompleted ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                            {m.title}
                          </span>
                          <span
                            className={`px-2 py-0.2 rounded text-[10px] font-bold uppercase ${
                              m.status === 'completed'
                                ? 'bg-blue-50 text-blue-700'
                                : m.status === 'in_progress'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {m.status}
                          </span>
                        </div>
                        {m.description && <p className="text-gray-500 mt-1 line-clamp-1">{m.description}</p>}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0 text-gray-500">
                      <span className="flex items-center gap-1 font-medium">
                        <Calendar className="h-3.5 w-3.5 text-gray-400" />
                        {m.due_date ? new Date(m.due_date).toLocaleDateString() : 'No date'}
                      </span>

                      {canManageMilestones && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingMilestone(m);
                              setIsMilestoneModalOpen(true);
                            }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                            title="Edit Milestone"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteMilestone(m.id)}
                            className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                            title="Delete Milestone"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: TEAM & MEMBERS */}
      {activeTab === 'team' && (
        <div className="space-y-6">
          {/* Assigned Teams */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-600" />
              Participating Teams ({project.teams?.length || 0})
            </h2>

            {project.teams?.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No agency teams assigned to this project.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {project.teams.map((t) => (
                  <div key={t.id} className="p-3.5 rounded-lg border border-gray-200 bg-gray-50/50">
                    <span className="font-semibold text-gray-900 text-sm block">{t.name}</span>
                    <span className="text-xs text-gray-500 block mt-0.5">Leader: {t.leader_name || 'None'}</span>
                    <span className="text-[11px] text-emerald-700 font-medium block mt-1">
                      {t.member_count} team members
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Individual Members Table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-200">
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-emerald-600" />
                Project Members ({project.members?.length || 0})
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
                <thead className="bg-gray-50 text-gray-500 font-semibold uppercase">
                  <tr>
                    <th className="px-5 py-3">Member</th>
                    <th className="px-5 py-3">Project Role</th>
                    <th className="px-5 py-3">System Role</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Joined Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {project.members?.map((m) => (
                    <tr key={m.user_id} className="hover:bg-gray-50 transition">
                      <td className="px-5 py-3">
                        <span className="font-semibold text-gray-900 block">{m.name}</span>
                        <span className="text-gray-400 text-[11px]">{m.email}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                            m.project_role === 'manager'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {m.project_role}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-600 capitalize">
                        {m.primary_role}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            m.user_status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {m.user_status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-500">
                        {new Date(m.joined_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: ACTIVITY HISTORY */}
      {activeTab === 'activity' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
            <History className="h-4 w-4 text-emerald-600" />
            Audit Activity Timeline
          </h2>

          {isLoadingActivity ? (
            <div className="p-8 text-center">
              <Loader2 className="h-6 w-6 text-emerald-600 animate-spin mx-auto" />
            </div>
          ) : activityLogs.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No activity recorded for this project yet.</p>
          ) : (
            <div className="space-y-4">
              {activityLogs.map((log) => (
                <div key={log.id} className="p-3.5 rounded-lg border border-gray-100 bg-gray-50/50 text-xs">
                  <div className="flex items-center justify-between text-gray-500 mb-1">
                    <span className="font-semibold text-gray-800">{log.actor_name || 'System'}</span>
                    <span>{new Date(log.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-gray-700 font-mono text-[11px]">{log.action}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: SETTINGS */}
      {activeTab === 'settings' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 max-w-xl space-y-6">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-2">
              Project Actions & Lifecycle
            </h2>
            <p className="text-xs text-gray-500">
              Manage project archival and lifecycle states.
            </p>
          </div>

          <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Archive Project</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Freeze project modifications while retaining historical records.
              </p>
            </div>
            {canArchive && (
              <button
                onClick={() => setIsArchiveModalOpen(true)}
                disabled={project.is_archived}
                className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-50 disabled:opacity-50"
              >
                {project.is_archived ? 'Already Archived' : 'Archive Project'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* TAB: WORKFLOW ENGINE */}
      {activeTab === 'workflow' && (
        <WorkflowExecutionStatus
          projectId={project.id}
          workflowPresetId={project.workflow_preset_id}
          canExecute={canUpdate}
          onOpenPreview={() => setIsPreviewModalOpen(true)}
        />
      )}

      {/* Edit Project Modal */}
      <ProjectModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        project={project}
        onSuccess={(msg) => {
          showToast(msg);
          fetchProjectDetails();
        }}
      />

      {/* Milestone Modal */}
      <MilestoneModal
        isOpen={isMilestoneModalOpen}
        onClose={() => setIsMilestoneModalOpen(false)}
        projectId={id}
        milestone={editingMilestone}
        onSuccess={(msg) => {
          showToast(msg);
          fetchProjectDetails();
        }}
      />

      {/* Archive Confirmation Modal */}
      {isArchiveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <Archive className="h-6 w-6" />
              <h3 className="text-lg font-bold text-gray-900">Archive Project</h3>
            </div>
            <p className="text-sm text-gray-600">
              Are you sure you want to archive project <strong className="text-gray-900">{project.name}</strong>?
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setIsArchiveModalOpen(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleArchiveProject}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
              >
                Confirm Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workflow Preview Modal */}
      {project.workflow_preset_id && (
        <WorkflowPreviewModal
          isOpen={isPreviewModalOpen}
          onClose={() => setIsPreviewModalOpen(false)}
          workflowPresetId={project.workflow_preset_id}
          workflowPresetVersionId={project.workflow_preset_version_id}
          projectId={project.id}
          clientId={project.client_id}
          startDate={project.start_date}
          canExecute={canUpdate}
          onExecuted={(res) => {
            showToast(res.message || 'Workflow executed successfully.');
            fetchProjectDetails();
          }}
        />
      )}
    </div>
  );
}
