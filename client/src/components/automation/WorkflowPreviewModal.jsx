import React, { useState, useEffect } from 'react';
import { automationService } from '../../services/api';
import {
  X,
  Play,
  Clock,
  Layers,
  AlertTriangle,
  CheckCircle2,
  Lock,
  ArrowRight,
  User,
  Calendar,
  Building2,
  Loader2,
  Sparkles
} from 'lucide-react';

export function WorkflowPreviewModal({
  isOpen,
  onClose,
  workflowPresetId,
  workflowPresetVersionId = null,
  clientId = null,
  projectId = null,
  serviceInstanceId = null,
  startDate = null,
  onExecuted = null,
  canExecute = false
}) {
  const [preview, setPreview] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && workflowPresetId) {
      loadPreview();
    }
  }, [isOpen, workflowPresetId, workflowPresetVersionId, projectId, serviceInstanceId, startDate]);

  const loadPreview = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await automationService.preview({
        workflowPresetId,
        workflowPresetVersionId,
        clientId,
        projectId,
        serviceInstanceId,
        startDate
      });
      setPreview(res.data.preview);
    } catch (err) {
      console.error(err);
      setError(
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Failed to generate workflow preview.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!preview) return;
    setIsExecuting(true);
    setError('');
    try {
      const res = await automationService.execute({
        triggerType: projectId ? 'project_start' : (serviceInstanceId ? 'service_activation' : 'manual'),
        workflowPresetId,
        workflowPresetVersionId: preview.version?.id,
        clientId,
        projectId,
        serviceInstanceId,
        startDate: preview.context?.startDate
      });
      if (onExecuted) {
        onExecuted(res.data);
      }
      onClose();
    } catch (err) {
      console.error(err);
      setError(
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Failed to execute workflow automation.'
      );
    } finally {
      setIsExecuting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              <Sparkles className="w-5 h-5 text-[#047857]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900">
                  Workflow Preview: {preview?.preset?.name || 'Loading Preset...'}
                </h3>
                {preview?.version && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                    v{preview.version.versionNumber} ({preview.version.status})
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Simulation mode — inspect generated tasks, dependencies, offsets, and assignees without database mutations.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {isLoading && (
            <div className="py-16 text-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-[#047857] mx-auto" />
              <p className="text-sm font-medium text-slate-600">Simulating workflow graph and calculating dates...</p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3 text-sm">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Workflow Simulation Warning</p>
                <p className="text-rose-700 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {!isLoading && preview && (
            <>
              {/* Warnings Banner */}
              {preview.warnings && preview.warnings.length > 0 && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-amber-800 mb-1">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    Configuration Notices ({preview.warnings.length})
                  </div>
                  {preview.warnings.map((w, idx) => (
                    <p key={idx} className="text-amber-700 pl-5 list-disc">• {w}</p>
                  ))}
                </div>
              )}

              {/* Summary Stats Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60">
                  <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Total Tasks</span>
                  <p className="text-2xl font-black text-slate-900 mt-0.5">{preview.totalExpectedTasks}</p>
                </div>
                <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50">
                  <span className="text-[11px] font-medium text-emerald-700 uppercase tracking-wider">Ready Immediately</span>
                  <p className="text-2xl font-black text-[#047857] mt-0.5">{preview.readyTasksCount}</p>
                </div>
                <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/50">
                  <span className="text-[11px] font-medium text-amber-700 uppercase tracking-wider">Blocked (Pending Deps)</span>
                  <p className="text-2xl font-black text-amber-700 mt-0.5">{preview.blockedTasksCount}</p>
                </div>
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60">
                  <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Base Start Date</span>
                  <p className="text-sm font-bold text-slate-800 mt-2 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    {preview.context?.startDate || 'Today'}
                  </p>
                </div>
              </div>

              {/* Tasks Preview List */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#047857]" />
                  Generated Task Breakdown ({preview.tasks.length})
                </h4>

                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                  {preview.tasks.map((task, idx) => (
                    <div key={task.taskTemplateId || idx} className="p-4 hover:bg-slate-50/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
                      <div className="space-y-1 max-w-xl">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-slate-400">#{idx + 1}</span>
                          <span className="font-bold text-slate-900">{task.title}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border ${
                            task.initialStatus === 'todo'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {task.initialStatus === 'todo' ? 'Ready' : 'Blocked'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 line-clamp-1">{task.description || 'No description provided'}</p>
                        <div className="flex items-center gap-3 text-xs text-slate-500 pt-1">
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" />
                            {task.departmentName || 'General'}
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            {task.assigneeName ? task.assigneeName : `Role: ${task.defaultAssigneeRole || 'Unassigned'}`}
                          </span>
                          {task.dependenciesCount > 0 && (
                            <span className="flex items-center gap-1 text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded">
                              <Lock className="w-3 h-3" /> Waiting on {task.dependenciesCount} prerequisite(s)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex sm:flex-col items-center sm:items-end justify-between text-xs shrink-0 gap-1 text-slate-600">
                        <span className="flex items-center gap-1 font-semibold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-md">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          Due: {task.calculatedDueDate || 'N/A'} (+{task.relativeDeadlineDays}d)
                        </span>
                        <span className="capitalize text-slate-400 text-[11px]">
                          Priority: <strong className="text-slate-700">{task.priority}</strong>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/70">
          <span className="text-xs text-slate-400">
            {canExecute ? 'Authorized to trigger automatic task generation.' : 'Preview-only inspection.'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isExecuting}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
            >
              Close Preview
            </button>
            {canExecute && (
              <button
                onClick={handleExecute}
                disabled={isExecuting || isLoading || !preview}
                className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-[#047857] hover:bg-[#065f46] transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Executing Automation...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" /> Execute & Generate Tasks
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
