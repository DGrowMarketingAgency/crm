import React, { useState, useEffect } from 'react';
import { automationService } from '../../services/api';
import {
  Play,
  RotateCcw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Layers,
  ArrowRight,
  Eye,
  RefreshCw,
  Loader2,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  Check,
  X
} from 'lucide-react';
import { Link } from 'react-router-dom';

export function WorkflowExecutionStatus({
  projectId = null,
  serviceInstanceId = null,
  clientId = null,
  workflowPresetId = null,
  canExecute = false,
  onOpenPreview = null
}) {
  const [executions, setExecutions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [retryingId, setRetryingId] = useState(null);
  const [isRefreshingDeps, setIsRefreshingDeps] = useState(false);
  const [selectedError, setSelectedError] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchExecutions();
  }, [projectId, serviceInstanceId, clientId]);

  const fetchExecutions = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await automationService.getExecutions({
        projectId,
        serviceInstanceId,
        clientId,
        limit: 10
      });
      setExecutions(res.data.executions || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load workflow execution history.');
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  const handleRetry = async (executionId) => {
    setRetryingId(executionId);
    setError('');
    try {
      const res = await automationService.retryExecution(executionId);
      showToast(res.data.message || 'Execution retried successfully.');
      fetchExecutions();
    } catch (err) {
      console.error(err);
      setError(
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Failed to retry execution.'
      );
    } finally {
      setRetryingId(null);
    }
  };

  const handleRefreshDeps = async () => {
    setIsRefreshingDeps(true);
    setError('');
    try {
      const res = await automationService.evaluateDependencies({ projectId });
      showToast(
        `Dependencies evaluated: ${res.data.unblockedTasks?.length || 0} task(s) newly unblocked.`
      );
      fetchExecutions();
    } catch (err) {
      console.error(err);
      setError('Failed to refresh task dependencies.');
    } finally {
      setIsRefreshingDeps(false);
    }
  };

  const latestExecution = executions[0] || null;

  return (
    <div className="space-y-6">
      {/* Toast Notice */}
      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {notice}
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600" />
          {error}
        </div>
      )}

      {/* Top Engine Action Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-[#10b981] animate-pulse" />
            <h3 className="font-bold text-slate-900 text-lg">Workflow Automation Engine</h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Database-driven lifecycle generation with automatic task dependencies and department assignment.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {onOpenPreview && workflowPresetId && (
            <button
              onClick={onOpenPreview}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors flex items-center gap-1.5"
            >
              <Eye className="w-3.5 h-3.5 text-slate-500" /> Preview Workflow
            </button>
          )}

          {canExecute && projectId && (
            <button
              onClick={handleRefreshDeps}
              disabled={isRefreshingDeps}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors flex items-center gap-1.5"
              title="Evaluate prerequisite task completions and unblock waiting tasks"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshingDeps ? 'animate-spin' : ''}`} />
              Refresh Dependencies
            </button>
          )}
        </div>
      </div>

      {/* Latest Execution Card */}
      {latestExecution && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-3">
              <span className={`px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${
                latestExecution.status === 'completed'
                  ? 'bg-emerald-50 text-[#047857] border-emerald-200'
                  : latestExecution.status === 'running'
                  ? 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}>
                {latestExecution.status}
              </span>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">
                  {latestExecution.preset_name || 'Standard Automation'} (v{latestExecution.version_number || 1})
                </h4>
                <p className="text-[11px] font-mono text-slate-400">Key: {latestExecution.execution_key}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {latestExecution.status !== 'completed' && canExecute && (
                <button
                  onClick={() => handleRetry(latestExecution.id)}
                  disabled={retryingId === latestExecution.id}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#047857] hover:bg-[#065f46] flex items-center gap-1.5 shadow-sm transition"
                >
                  <RotateCcw className={`w-3 h-3 ${retryingId === latestExecution.id ? 'animate-spin' : ''}`} />
                  Retry Automation
                </button>
              )}

              {latestExecution.error_details && (
                <button
                  onClick={() => setSelectedError(latestExecution.error_details)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 flex items-center gap-1.5 transition"
                >
                  <AlertTriangle className="w-3 h-3" /> View Error
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-slate-400 font-medium">Trigger Type</span>
              <p className="font-bold text-slate-800 capitalize mt-0.5">{latestExecution.trigger_type.replace('_', ' ')}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-slate-400 font-medium">Tasks Generated</span>
              <p className="font-bold text-slate-800 mt-0.5">
                {latestExecution.created_tasks_count} / {latestExecution.total_tasks_count}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-slate-400 font-medium">Triggered By</span>
              <p className="font-bold text-slate-800 mt-0.5">{latestExecution.executed_by_name || 'System Auto-Trigger'}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-slate-400 font-medium">Execution Time</span>
              <p className="font-bold text-slate-800 mt-0.5">
                {latestExecution.completed_at ? new Date(latestExecution.completed_at).toLocaleString() : 'Running...'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Execution History Table */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-400" />
          Execution Log History ({executions.length})
        </h4>

        {isLoading && (
          <div className="py-8 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-[#047857]" /> Loading history...
          </div>
        )}

        {!isLoading && executions.length === 0 && (
          <div className="py-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs">
            No workflow executions recorded yet. Move project to Active or configure a service to trigger automation.
          </div>
        )}

        {!isLoading && executions.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Trigger</th>
                  <th className="py-2.5 px-3">Preset Version</th>
                  <th className="py-2.5 px-3">Tasks</th>
                  <th className="py-2.5 px-3">Executed At</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {executions.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[10px] border ${
                        e.status === 'completed'
                          ? 'bg-emerald-50 text-[#047857] border-emerald-200'
                          : e.status === 'running'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 capitalize font-medium">{e.trigger_type.replace('_', ' ')}</td>
                    <td className="py-2.5 px-3 font-semibold">{e.preset_name || 'Workflow'} v{e.version_number || 1}</td>
                    <td className="py-2.5 px-3 font-bold">{e.created_tasks_count} / {e.total_tasks_count}</td>
                    <td className="py-2.5 px-3 text-slate-400">{new Date(e.created_at).toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right space-x-2">
                      {e.status !== 'completed' && canExecute && (
                        <button
                          onClick={() => handleRetry(e.id)}
                          disabled={retryingId === e.id}
                          className="text-[#047857] hover:underline font-bold"
                        >
                          Retry
                        </button>
                      )}
                      {e.error_details && (
                        <button
                          onClick={() => setSelectedError(e.error_details)}
                          className="text-rose-600 hover:underline font-bold"
                        >
                          Error
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Error Details Modal */}
      {selectedError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
                <AlertTriangle className="w-4 h-4 text-rose-600" /> Execution Error Diagnostics
              </div>
              <button
                onClick={() => setSelectedError(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 bg-slate-900 text-rose-300 font-mono text-xs rounded-xl overflow-x-auto">
              <pre>{typeof selectedError === 'string' ? selectedError : JSON.stringify(selectedError, null, 2)}</pre>
            </div>
            <div className="text-right">
              <button
                onClick={() => setSelectedError(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
