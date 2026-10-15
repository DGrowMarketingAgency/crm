import React, { useState, useEffect } from 'react';
import { projectsService, usersService, teamsService, clientsService, workflowPresetsService } from '../../services/api';
import { X, Loader2, AlertCircle, FolderKanban, Sparkles, Users, UserCheck } from 'lucide-react';

export function ProjectModal({ isOpen, onClose, project = null, onSuccess }) {
  const isEditing = Boolean(project);

  const [name, setName] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [description, setDescription] = useState('');
  const [clientId, setClientId] = useState('');
  const [projectManagerId, setProjectManagerId] = useState('');
  const [status, setStatus] = useState('planning');
  const [priority, setPriority] = useState('medium');
  const [visibility, setVisibility] = useState('internal');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [objectives, setObjectives] = useState('');
  const [notes, setNotes] = useState('');
  const [workflowPresetId, setWorkflowPresetId] = useState('');

  // Assignments
  const [selectedTeams, setSelectedTeams] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]);

  // Option lists
  const [activeUsers, setActiveUsers] = useState([]);
  const [activeTeams, setActiveTeams] = useState([]);
  const [clientsList, setClientsList] = useState([]);
  const [presetsList, setPresetsList] = useState([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadDropdownOptions();

      if (project) {
        setName(project.name || '');
        setProjectCode(project.project_code || '');
        setDescription(project.description || '');
        setClientId(project.client_id ? String(project.client_id) : '');
        setProjectManagerId(project.project_manager_id ? String(project.project_manager_id) : '');
        setStatus(project.status || 'planning');
        setPriority(project.priority || 'medium');
        setVisibility(project.visibility || 'internal');
        setStartDate(project.start_date ? project.start_date.slice(0, 10) : '');
        setDueDate(project.due_date ? project.due_date.slice(0, 10) : '');
        setObjectives(project.objectives || '');
        setNotes(project.notes || '');
        setWorkflowPresetId(project.workflow_preset_id ? String(project.workflow_preset_id) : '');
        setSelectedTeams(project.teams ? project.teams.map((t) => t.id) : []);
        setSelectedMembers(project.members ? project.members.map((m) => m.user_id) : []);
      } else {
        setName('');
        setProjectCode('');
        setDescription('');
        setClientId('');
        setProjectManagerId('');
        setStatus('planning');
        setPriority('medium');
        setVisibility('internal');
        setStartDate('');
        setDueDate('');
        setObjectives('');
        setNotes('');
        setWorkflowPresetId('');
        setSelectedTeams([]);
        setSelectedMembers([]);
      }
      setError('');
    }
  }, [isOpen, project]);

  const loadDropdownOptions = async () => {
    try {
      const [uRes, tRes, cRes, pRes] = await Promise.all([
        usersService.getUsers({ status: 'active', limit: 100 }),
        teamsService.getTeams({ status: 'active', limit: 100 }),
        clientsService.getClients({ status: 'active', limit: 100 }),
        workflowPresetsService.getPresets({ status: 'published', limit: 100 })
      ]);
      const users = uRes.data.users || [];
      setActiveUsers(users);
      setActiveTeams(tRes.data.teams || []);
      setClientsList(cRes.data.clients || []);
      setPresetsList(pRes.data.presets || []);

      if (!project && users.length > 0 && !projectManagerId) {
        setProjectManagerId(String(users[0].id));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Helper to auto-generate a code from name
  const generateCode = () => {
    if (!name.trim()) return;
    const words = name.trim().split(/\s+/);
    let code = '';
    if (words.length === 1) {
      code = words[0].slice(0, 4).toUpperCase();
    } else {
      code = words.map((w) => w[0]).join('').slice(0, 4).toUpperCase();
    }
    const randomNum = Math.floor(100 + Math.random() * 900);
    setProjectCode(`${code}-${randomNum}`);
  };

  const handleToggleTeam = (teamId) => {
    setSelectedTeams((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]
    );
  };

  const handleToggleMember = (userId) => {
    setSelectedMembers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Project name is required.');
      return;
    }
    if (!projectCode.trim()) {
      setError('Project code is required.');
      return;
    }
    if (!projectManagerId) {
      setError('A designated project manager is required.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEditing) {
        await projectsService.updateProject(project.id, {
          name: name.trim(),
          description: description.trim() || null,
          clientId: clientId ? Number(clientId) : null,
          projectManagerId: Number(projectManagerId),
          priority,
          visibility,
          startDate: startDate || null,
          dueDate: dueDate || null,
          objectives: objectives.trim() || null,
          notes: notes.trim() || null,
          workflowPresetId: workflowPresetId ? Number(workflowPresetId) : null
        });

        // Also sync teams and members if edited
        await Promise.all([
          projectsService.updateTeams(project.id, selectedTeams),
          projectsService.updateMembers(
            project.id,
            selectedMembers.map((uid) => ({
              userId: uid,
              projectRole: Number(uid) === Number(projectManagerId) ? 'manager' : 'member'
            }))
          )
        ]);

        onSuccess('Project updated successfully.');
      } else {
        await projectsService.createProject({
          name: name.trim(),
          projectCode: projectCode.trim().toUpperCase(),
          description: description.trim() || null,
          clientId: clientId ? Number(clientId) : null,
          projectManagerId: Number(projectManagerId),
          status,
          priority,
          visibility,
          startDate: startDate || null,
          dueDate: dueDate || null,
          objectives: objectives.trim() || null,
          notes: notes.trim() || null,
          workflowPresetId: workflowPresetId ? Number(workflowPresetId) : null,
          teamIds: selectedTeams,
          memberIds: selectedMembers
        });
        onSuccess('Project created successfully.');
      }
      onClose();
    } catch (err) {
      console.error(err);
      const msg = typeof err.response?.data?.error === 'object'
        ? err.response?.data?.error?.message
        : err.response?.data?.error || 'Failed to save project.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-700">
              <FolderKanban className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {isEditing ? 'Edit Project' : 'Create New Project'}
              </h2>
              <p className="text-xs text-gray-500">
                {isEditing ? 'Update specifications and resource assignments.' : 'Define project details, deadline, and assigned staff.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="my-3 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-rose-800 text-xs shrink-0">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto pr-1 space-y-4 pt-3 flex-1 text-sm">
          {/* Row 1: Name & Project Code */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Project Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Website Replatforming & SEO"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-gray-700 uppercase">
                  Code *
                </label>
                {!isEditing && (
                  <button
                    type="button"
                    onClick={generateCode}
                    className="text-[11px] text-emerald-600 hover:underline flex items-center gap-0.5"
                    title="Auto-generate code from project name"
                  >
                    <Sparkles className="h-3 w-3" /> Auto
                  </button>
                )}
              </div>
              <input
                type="text"
                value={projectCode}
                onChange={(e) => setProjectCode(e.target.value.toUpperCase())}
                placeholder="WEB-101"
                required
                disabled={isEditing}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 uppercase font-mono text-xs disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="High-level purpose, deliverable scope, and client expectations..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-sm"
            />
          </div>

          {/* Row 2: Client & Project Manager */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Client Organization
              </label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 text-sm"
              >
                <option value="">-- Internal Agency Project (No Client) --</option>
                {clientsList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name ? `${c.company_name} (${c.name})` : c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Project Manager *
              </label>
              <select
                value={projectManagerId}
                onChange={(e) => setProjectManagerId(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 text-sm"
              >
                <option value="">-- Select Active Project Manager --</option>
                {activeUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email}) — {u.role}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Workflow Preset Linkage */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1 flex items-center justify-between">
              <span>Workflow Preset Automation (Optional)</span>
              <span className="text-[11px] text-emerald-600 font-bold">Auto-Generates Tasks on Start</span>
            </label>
            <select
              value={workflowPresetId}
              onChange={(e) => setWorkflowPresetId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 text-sm"
            >
              <option value="">-- No Workflow Preset (Manual Tasks Only) --</option>
              {presetsList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} [{p.department_name || 'General'}] — v{p.current_version_number || 1}
                </option>
              ))}
            </select>
          </div>

          {/* Row 3: Priority, Status, Visibility */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 text-sm"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Lifecycle Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 text-sm"
              >
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Client Visibility
              </label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 text-sm"
              >
                <option value="internal">Internal Only</option>
                <option value="client_facing">Client Facing Portal</option>
              </select>
            </div>
          </div>

          {/* Row 4: Timeline */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Target Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-sm"
              />
            </div>
          </div>

          {/* Assignments Section: Teams */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-emerald-600" />
              Participating Teams
            </label>
            <div className="max-h-28 overflow-y-auto border border-gray-200 rounded-lg p-2.5 space-y-1.5 bg-gray-50/50">
              {activeTeams.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No active teams available.</p>
              ) : (
                activeTeams.map((team) => (
                  <label key={team.id} className="flex items-center gap-2 text-xs text-gray-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedTeams.includes(team.id)}
                      onChange={() => handleToggleTeam(team.id)}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="font-medium">{team.name}</span>
                    {team.leader_name && <span className="text-gray-400 text-[11px]">— Lead: {team.leader_name}</span>}
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Assignments Section: Individual Members */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1 flex items-center gap-1.5">
              <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
              Individual Project Members
            </label>
            <div className="max-h-28 overflow-y-auto border border-gray-200 rounded-lg p-2.5 space-y-1.5 bg-gray-50/50">
              {activeUsers.map((user) => (
                <label key={user.id} className="flex items-center gap-2 text-xs text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedMembers.includes(user.id)}
                    onChange={() => handleToggleMember(user.id)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>{user.name}</span>
                  <span className="text-gray-400 text-[11px]">({user.email})</span>
                </label>
              ))}
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition shadow-sm"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEditing ? 'Save Changes' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
