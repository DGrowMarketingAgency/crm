import React, { useState, useEffect } from 'react';
import { timeService, projectsService, tasksService } from '../../services/api';
import { Clock, X, Calendar, Layers, CheckSquare, Loader2, DollarSign } from 'lucide-react';

export function LogTimeModal({ isOpen, onClose, onSuccess, initialTaskId = null, initialProjectId = null, editEntry = null }) {
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId || '');
  const [selectedTaskId, setSelectedTaskId] = useState(initialTaskId || '');
  const [workDate, setWorkDate] = useState(new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState('1');
  const [minutes, setMinutes] = useState('0');
  const [description, setDescription] = useState('');
  const [isBillable, setIsBillable] = useState(true);

  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (editEntry) {
        setSelectedProjectId(editEntry.project_id || '');
        setSelectedTaskId(editEntry.task_id || '');
        setWorkDate(editEntry.work_date ? editEntry.work_date.slice(0, 10) : new Date().toISOString().slice(0, 10));
        const totalMin = Number(editEntry.duration_minutes || 0);
        setHours(String(Math.floor(totalMin / 60)));
        setMinutes(String(totalMin % 60));
        setDescription(editEntry.description || '');
        setIsBillable(Boolean(editEntry.is_billable));
      } else {
        setSelectedProjectId(initialProjectId || '');
        setSelectedTaskId(initialTaskId || '');
        setWorkDate(new Date().toISOString().slice(0, 10));
        setHours('1');
        setMinutes('0');
        setDescription('');
        setIsBillable(true);
      }
      setError('');
      loadProjects();
    }
  }, [isOpen, editEntry, initialTaskId, initialProjectId]);

  useEffect(() => {
    if (selectedProjectId) {
      loadProjectTasks(selectedProjectId);
    } else {
      setTasks([]);
    }
  }, [selectedProjectId]);

  const loadProjects = async () => {
    setIsLoadingProjects(true);
    try {
      const res = await projectsService.getProjects({ limit: 100 });
      setProjects(res.data.projects || []);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const loadProjectTasks = async (projId) => {
    setIsLoadingTasks(true);
    try {
      const res = await tasksService.getProjectTasks(projId, { limit: 100 });
      setTasks(res.data.tasks || []);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setIsLoadingTasks(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const totalMinutes = (parseInt(hours || '0', 10) * 60) + parseInt(minutes || '0', 10);
    if (totalMinutes <= 0) {
      setError('Duration must be at least 1 minute');
      return;
    }
    if (totalMinutes > 1440) {
      setError('Duration cannot exceed 24 hours (1440 minutes)');
      return;
    }

    if (!selectedTaskId && !editEntry) {
      setError('Please select a task to log time against');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editEntry) {
        await timeService.updateTimeEntry(editEntry.id, {
          workDate,
          durationMinutes: totalMinutes,
          description: description.trim() || null,
          isBillable
        });
      } else {
        await timeService.createTimeEntry({
          taskId: selectedTaskId,
          workDate,
          durationMinutes: totalMinutes,
          description: description.trim() || null,
          isBillable
        });
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Save time entry error:', err);
      setError(
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Failed to save time entry'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand-50 border border-brand-100 text-brand-700 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {editEntry ? 'Edit Time Entry' : 'Log Work Time'}
              </h3>
              <p className="text-xs text-slate-500">
                {editEntry ? 'Update existing draft work log' : 'Record manual task effort'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {!editEntry && !initialTaskId && (
            <>
              {/* Project Picker */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  Project <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    required
                    value={selectedProjectId}
                    onChange={(e) => {
                      setSelectedProjectId(e.target.value);
                      setSelectedTaskId('');
                    }}
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  >
                    <option value="">Select Project...</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.project_code || p.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Task Picker */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  Task <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  disabled={!selectedProjectId || isLoadingTasks}
                  value={selectedTaskId}
                  onChange={(e) => setSelectedTaskId(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 disabled:opacity-50"
                >
                  <option value="">
                    {isLoadingTasks ? 'Loading tasks...' : 'Select Task...'}
                  </option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.task_code || `#${t.id}`} — {t.title}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Work Date & Duration in Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Work Date <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  required
                  value={workDate}
                  onChange={(e) => setWorkDate(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Duration <span className="text-rose-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
                  <input
                    type="number"
                    min="0"
                    max="24"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    className="w-full bg-transparent text-xs font-semibold focus:outline-none"
                  />
                  <span className="text-[11px] text-slate-400 font-medium ml-1">hrs</span>
                </div>
                <div className="flex-1 flex items-center bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
                  <input
                    type="number"
                    min="0"
                    max="59"
                    step="5"
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                    className="w-full bg-transparent text-xs font-semibold focus:outline-none"
                  />
                  <span className="text-[11px] text-slate-400 font-medium ml-1">min</span>
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
              Work Description & Notes
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What did you work on? (e.g. Implemented approval status transitions and wrote unit tests)"
              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          {/* Billable Toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-lg ${isBillable ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-500'}`}>
                <DollarSign className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800">Billable Hours</p>
                <p className="text-[10px] text-slate-400">Classify this effort as billable agency work</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isBillable}
                onChange={(e) => setIsBillable(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-brand-700 hover:bg-brand-800 rounded-xl shadow-xs transition disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{editEntry ? 'Update Work Log' : 'Save Work Log'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
