import React, { useState, useEffect } from 'react';
import { tasksService, projectsService, usersService, clientsService } from '../../services/api';
import {
  X,
  Loader2,
  AlertCircle,
  CheckSquare,
  Sparkles,
  Users,
  Flag,
  Calendar,
  Layers,
  Link as LinkIcon,
  Clock,
  Tag,
  Building2
} from 'lucide-react';

export function TaskModal({
  isOpen,
  onClose,
  task = null,
  defaultProjectId = null,
  defaultParentTaskId = null,
  onSuccess
}) {
  const isEditing = Boolean(task);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [clientId, setClientId] = useState('');
  const [milestoneId, setMilestoneId] = useState('');
  const [parentTaskId, setParentTaskId] = useState('');
  const [priority, setPriority] = useState('medium');
  const [status, setStatus] = useState('todo');
  const [isClientDeliverable, setIsClientDeliverable] = useState(false);
  const [source, setSource] = useState('Manual');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [labelsInput, setLabelsInput] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');
  const [selectedAssignees, setSelectedAssignees] = useState([]);

  // Option lists
  const [projectsList, setProjectsList] = useState([]);
  const [clientsList, setClientsList] = useState([]);
  const [milestonesList, setMilestonesList] = useState([]);
  const [parentTasksList, setParentTasksList] = useState([]);
  const [eligibleUsers, setEligibleUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);

  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Initial load when modal opens
  useEffect(() => {
    if (isOpen) {
      loadOptions();

      if (task) {
        setTitle(task.title || '');
        setDescription(task.description || '');
        setProjectId(task.project_id ? String(task.project_id) : '');
        setClientId(task.client_id ? String(task.client_id) : '');
        setMilestoneId(task.milestone_id ? String(task.milestone_id) : '');
        setParentTaskId(task.parent_task_id ? String(task.parent_task_id) : '');
        setPriority(task.priority || 'medium');
        setStatus(task.status || 'todo');
        setIsClientDeliverable(Boolean(task.is_client_deliverable));
        setSource(task.source || 'Manual');
        setStartDate(task.start_date ? task.start_date.slice(0, 10) : '');
        setDueDate(task.due_date ? task.due_date.slice(0, 10) : '');
        setEstimatedHours(task.estimated_minutes ? String(task.estimated_minutes / 60) : '');
        setReferenceUrl(task.reference_url || '');

        // Labels
        if (Array.isArray(task.labels)) {
          setLabelsInput(task.labels.join(', '));
        } else if (typeof task.labels === 'string') {
          try {
            const parsed = JSON.parse(task.labels);
            setLabelsInput(Array.isArray(parsed) ? parsed.join(', ') : task.labels);
          } catch {
            setLabelsInput(task.labels);
          }
        } else {
          setLabelsInput('');
        }

        // Assignees
        const currentAssigneeIds = (task.assignees || []).map((a) => a.id || a.user_id);
        setSelectedAssignees(currentAssigneeIds);
      } else {
        setTitle('');
        setDescription('');
        const initProjId = defaultProjectId ? String(defaultProjectId) : '';
        setProjectId(initProjId);
        setClientId('');
        setMilestoneId('');
        setParentTaskId(defaultParentTaskId ? String(defaultParentTaskId) : '');
        setPriority('medium');
        setStatus('todo');
        setIsClientDeliverable(false);
        setSource('Manual');
        setStartDate('');
        setDueDate('');
        setEstimatedHours('');
        setLabelsInput('');
        setReferenceUrl('');
        setSelectedAssignees([]);
      }

      setError('');
    }
  }, [isOpen, task, defaultProjectId, defaultParentTaskId]);

  // Load project-specific milestones, parent tasks, and members when projectId changes
  useEffect(() => {
    if (projectId) {
      loadProjectDependencies(projectId);
    } else {
      setMilestonesList([]);
      setParentTasksList([]);
      setEligibleUsers(allUsers);
    }
  }, [projectId, allUsers]);

  const loadOptions = async () => {
    try {
      const [pRes, cRes, uRes] = await Promise.all([
        projectsService.getProjects({ limit: 100, status: 'active' }).catch(() => ({ data: { projects: [] } })),
        clientsService.getClients({ limit: 100, status: 'active' }).catch(() => ({ data: { clients: [] } })),
        usersService.getUsers({ limit: 100, status: 'active' }).catch(() => ({ data: { users: [] } }))
      ]);
      setProjectsList(pRes.data.projects || []);
      setClientsList(cRes.data.clients || []);
      const users = (uRes.data.users || []).map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.roles?.[0]?.name
      }));
      setAllUsers(users);
      if (!projectId) {
        setEligibleUsers(users);
      }
    } catch (e) {
      console.error('Failed to load modal options', e);
    }
  };

  const loadProjectDependencies = async (pId) => {
    setIsLoadingOptions(true);
    try {
      const [mRes, tRes, memRes] = await Promise.all([
        projectsService.getMilestones(pId).catch(() => ({ data: { milestones: [] } })),
        tasksService.getProjectTasks(pId, { limit: 100 }).catch(() => ({ data: { tasks: [] } })),
        projectsService.getMembers(pId).catch(() => ({ data: { members: [] } }))
      ]);

      setMilestonesList(mRes.data.milestones || []);

      // Filter out current task from parent options to avoid circular ref
      const existingTasks = (tRes.data.tasks || []).filter((t) => !task || t.id !== task.id);
      setParentTasksList(existingTasks);

      // Members or fallback to allUsers
      let users = (memRes.data.members || []).map((m) => ({
        id: m.user_id,
        name: m.name,
        email: m.email,
        role: m.role_name
      }));

      if (users.length === 0) {
        users = allUsers;
      }
      setEligibleUsers(users);
    } catch (e) {
      console.error('Failed to load project details', e);
    } finally {
      setIsLoadingOptions(false);
    }
  };

  const toggleAssignee = (userId) => {
    setSelectedAssignees((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Task title is required');
      return;
    }

    if (!projectId && !clientId && selectedAssignees.length === 0) {
      setError('Please select a project, client, or assign the task');
      return;
    }

    if (!projectId && !dueDate) {
      setError('Due date is required for tasks created outside a project');
      return;
    }

    if (startDate && dueDate && new Date(dueDate) < new Date(startDate)) {
      setError('Due date cannot be earlier than start date');
      return;
    }

    // Process labels
    const labels = labelsInput
      .split(',')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // Process estimated minutes
    const estHoursNum = parseFloat(estimatedHours);
    const estimatedMinutes = !isNaN(estHoursNum) && estHoursNum > 0 ? Math.round(estHoursNum * 60) : null;

    setIsSubmitting(true);

    try {
      if (isEditing) {
        // Update task payload
        const updatePayload = {
          title: title.trim(),
          description: description || null,
          clientId: clientId ? Number(clientId) : null,
          isClientDeliverable,
          milestoneId: milestoneId ? Number(milestoneId) : null,
          priority,
          startDate: startDate || null,
          dueDate: dueDate || null,
          estimatedMinutes,
          labels,
          referenceUrl: referenceUrl.trim() || null
        };

        await tasksService.updateTask(task.id, updatePayload);

        // Update assignees
        await tasksService.updateAssignees(task.id, selectedAssignees);
      } else {
        // Create task payload
        const createPayload = {
          title: title.trim(),
          description: description || null,
          projectId: projectId ? Number(projectId) : null,
          clientId: clientId ? Number(clientId) : null,
          isClientDeliverable,
          source,
          milestoneId: milestoneId ? Number(milestoneId) : null,
          parentTaskId: parentTaskId ? Number(parentTaskId) : null,
          priority,
          status,
          startDate: startDate || null,
          dueDate: dueDate || null,
          estimatedMinutes,
          labels,
          referenceUrl: referenceUrl.trim() || null,
          assigneeIds: selectedAssignees
        };

        await tasksService.createTask(createPayload);
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Task submission error:', err);
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          'Failed to save task. Please verify your inputs.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-700">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {isEditing ? `Edit Task #${task?.task_code || task?.id}` : 'Create New Task'}
              </h2>
              <p className="text-xs text-slate-500">
                {isEditing
                  ? 'Update task details, deadlines, and project assignees'
                  : 'Add a new actionable item, assign team members, and set target dates'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[78vh] overflow-y-auto">
          {error && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Task Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Implement user authorization middleware"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900 placeholder:text-slate-400 transition"
            />
          </div>

          {/* Project & Client Association Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Project (Optional)
              </label>
              <select
                disabled={isEditing}
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900 disabled:bg-slate-50 disabled:text-slate-500 transition"
              >
                <option value="">No Project (Standalone/Client Task)</option>
                {projectsList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.project_code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Client (Optional)
              </label>
              <select
                disabled={isEditing}
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900 disabled:bg-slate-50 disabled:text-slate-500 transition"
              >
                <option value="">No Client Linked</option>
                {clientsList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.entity ? `[${c.entity}]` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* D-Grow Deliverable & Parent Task Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Parent Task (Optional)
              </label>
              <select
                disabled={isEditing || !projectId || isLoadingOptions}
                value={parentTaskId}
                onChange={(e) => setParentTaskId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900 disabled:bg-slate-50 disabled:text-slate-500 transition"
              >
                <option value="">No Parent (Top-level Task)</option>
                {parentTasksList.map((pt) => (
                  <option key={pt.id} value={pt.id}>
                    {pt.task_code} - {pt.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-50/70 border border-slate-200 rounded-xl mt-auto">
              <input
                type="checkbox"
                id="isClientDeliverable"
                checked={isClientDeliverable}
                onChange={(e) => setIsClientDeliverable(e.target.checked)}
                className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-500 cursor-pointer"
              />
              <label htmlFor="isClientDeliverable" className="text-xs font-medium text-slate-700 cursor-pointer">
                <span className="font-semibold block text-slate-900">Client Review Deliverable (CR)</span>
                Requires client approval in portal
              </label>
            </div>
          </div>

          {/* Milestone, Priority, Status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Milestone
              </label>
              <select
                value={milestoneId}
                onChange={(e) => setMilestoneId(e.target.value)}
                disabled={!projectId || isLoadingOptions}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900 disabled:bg-slate-50 disabled:text-slate-500 transition"
              >
                <option value="">None</option>
                {milestonesList.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900 transition"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            {!isEditing && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Initial Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900 transition"
                >
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                </select>
              </div>
            )}
          </div>

          {/* Start Date, Due Date, Estimated Effort */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Estimated (Hours)
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                placeholder="e.g. 4.5"
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900 placeholder:text-slate-400 transition"
              />
            </div>
          </div>

          {/* Assignees Selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Assignees ({selectedAssignees.length} selected)
              </label>
              <span className="text-xs text-slate-400">
                {projectId ? 'Members eligible for this project' : 'Select a project first'}
              </span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl max-h-40 overflow-y-auto">
              {!projectId ? (
                <p className="text-xs text-slate-400 text-center py-4">
                  Please select a project above to view eligible team members
                </p>
              ) : eligibleUsers.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">
                  {isLoadingOptions ? 'Loading team members...' : 'No active members available'}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {eligibleUsers.map((u) => {
                    const isChecked = selectedAssignees.includes(u.id);
                    return (
                      <label
                        key={u.id}
                        className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition border text-xs ${
                          isChecked
                            ? 'bg-brand-50/70 border-brand-200 text-brand-900 font-medium'
                            : 'bg-white border-slate-200/80 text-slate-700 hover:bg-slate-100/60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleAssignee(u.id)}
                          className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{u.name}</p>
                          <p className="text-[11px] text-slate-400 truncate">{u.email}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Description & Specifications
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Outline task details, acceptance criteria, implementation notes..."
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900 placeholder:text-slate-400 transition"
            />
          </div>

          {/* Labels & Reference URL */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Labels (Comma-separated)
              </label>
              <div className="relative">
                <Tag className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={labelsInput}
                  onChange={(e) => setLabelsInput(e.target.value)}
                  placeholder="e.g. frontend, auth, bug"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900 placeholder:text-slate-400 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Reference URL (Optional)
              </label>
              <div className="relative">
                <LinkIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="url"
                  value={referenceUrl}
                  onChange={(e) => setReferenceUrl(e.target.value)}
                  placeholder="https://figma.com/... or PR link"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900 placeholder:text-slate-400 transition"
                />
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-brand-700 hover:bg-brand-800 rounded-xl shadow-md shadow-brand-700/20 flex items-center gap-2 transition disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving Task...</span>
                </>
              ) : (
                <span>{isEditing ? 'Update Task' : 'Create Task'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
