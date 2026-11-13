import React, { useState, useEffect } from 'react';
import { automationService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import {
  Activity,
  Search,
  Filter,
  CheckCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Loader2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  GitBranch,
  Building2,
  CheckCircle2,
  XCircle
} from 'lucide-react';

export function WorkflowActivityPage() {
  const { hasPermission, isOwner } = usePermission();

  const [executions, setExecutions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;

  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedTrigger, setSelectedTrigger] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Execution Detail Modal
  const [selectedExecution, setSelectedExecution] = useState(null);
  const [execTasks, setExecTasks] = useState([]);
  const [execErrors, setExecErrors] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [retryingId, setRetryingId] = useState(null);

  const canExecute = isOwner || hasPermission('workflows.execute');

  useEffect(() => {
    fetchExecutions();
  }, [page, selectedStatus, selectedTrigger]);

  const fetchExecutions = async () => {
    setIsLoading(true);
    setError('');
    try {
      const offset = (page - 1) * limit;
      const res = await automationService.getExecutions({
        status: selectedStatus || undefined,
        triggerType: selectedTrigger || undefined,
        limit,
        offset
      });
      setExecutions(res.data.executions || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error?.message || 'Failed to load workflow execution history.');
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  const handleOpenDetail = async (item) => {
    setSelectedExecution(item);
    setDetailLoading(true);
    setExecTasks([]);
    setExecErrors([]);

    try {
      const [tRes, errRes] = await Promise.allSettled([
        automationService.getExecutionTasks(item.id),
        automationService.getExecutionErrors(item.id)
      ]);
      if (tRes.status === 'fulfilled' && tRes.value.data?.tasks) {
        setExecTasks(tRes.value.data.tasks);
      }
      if (errRes.status === 'fulfilled' && errRes.value.data?.errors) {
        setExecErrors(errRes.value.data.errors);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleRetry = async (id, e) => {
    if (e) e.stopPropagation();
    setRetryingId(id);
    try {
      const res = await automationService.retryExecution(id);
      showToast(res.data?.message || 'Workflow automation retried successfully.');
      fetchExecutions();
      if (selectedExecution?.id === id) {
        setSelectedExecution(null);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error?.message || 'Failed to retry execution.');
    } finally {
      setRetryingId(null);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5" /> Completed
          </span>
        );
      case 'running':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Running
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
            <XCircle className="w-3.5 h-3.5" /> Failed
          </span>
        );
      case 'partially_failed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
            <AlertTriangle className="w-3.5 h-3.5" /> Partial Failure
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
            <Clock className="w-3.5 h-3.5" /> {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Toast Notice */}
      {notice && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-emerald-800 shadow-sm animate-in fade-in duration-200">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="text-sm font-semibold">{notice}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-800 shadow-sm">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span className="text-sm font-semibold">{error}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-slate-900 to-slate-700 text-white flex items-center justify-center shadow-lg">
            <Activity className="w-7 h-7 text-red-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Workflow Activity & Execution Log
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                Audited Runs
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Historical task generation records, automation status, error logs and safe retry execution
            </p>
          </div>
        </div>

        <button
          onClick={fetchExecutions}
          className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-semibold flex items-center gap-2 self-start md:self-auto transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-wrap items-center gap-3">
        <select
          value={selectedStatus}
          onChange={(e) => {
            setSelectedStatus(e.target.value);
            setPage(1);
          }}
          className="px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 bg-white"
        >
          <option value="">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="running">Running</option>
          <option value="partially_failed">Partially Failed</option>
          <option value="failed">Failed</option>
        </select>

        <select
          value={selectedTrigger}
          onChange={(e) => {
            setSelectedTrigger(e.target.value);
            setPage(1);
          }}
          className="px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 bg-white"
        >
          <option value="">All Trigger Types</option>
          <option value="service_activation">Service Activation</option>
          <option value="project_start">Project Start</option>
          <option value="milestone_activation">Milestone Activation</option>
          <option value="manual">Manual Execution</option>
        </select>
      </div>

      {/* Executions Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-red-600" />
            <p className="text-sm font-semibold">Loading execution logs...</p>
          </div>
        ) : executions.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            No workflow execution logs found for the selected filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase tracking-wider font-bold">
                <tr>
                  <th className="px-5 py-3.5">Execution Key</th>
                  <th className="px-5 py-3.5">Workflow Preset</th>
                  <th className="px-5 py-3.5">Trigger</th>
                  <th className="px-5 py-3.5">Client / Target</th>
                  <th className="px-5 py-3.5">Tasks Generated</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Started At</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {executions.map((ex) => (
                  <tr
                    key={ex.id}
                    onClick={() => handleOpenDetail(ex)}
                    className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3.5 font-mono font-bold text-slate-700">
                      {ex.execution_key}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-slate-900">
                      {ex.workflow_name || 'Service Workflow'} (v{ex.version_number || 1})
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 capitalize">
                      {ex.trigger_type?.replace(/_/g, ' ')}
                    </td>
                    <td className="px-5 py-3.5 text-slate-800 font-medium">
                      {ex.client_name || ex.project_name || 'Global'}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-slate-700">
                      {ex.created_tasks_count || 0} / {ex.total_tasks_count || 0}
                    </td>
                    <td className="px-5 py-3.5">{getStatusBadge(ex.status)}</td>
                    <td className="px-5 py-3.5 text-slate-500">
                      {ex.started_at ? new Date(ex.started_at).toLocaleString() : 'Pending'}
                    </td>
                    <td className="px-5 py-3.5 text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                      {(ex.status === 'failed' || ex.status === 'partially_failed') && canExecute && (
                        <button
                          onClick={(e) => handleRetry(ex.id, e)}
                          disabled={retryingId === ex.id}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 transition-colors inline-flex items-center gap-1"
                        >
                          {retryingId === ex.id && <Loader2 className="w-3 h-3 animate-spin" />}
                          Retry
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenDetail(ex)}
                        className="text-slate-400 hover:text-slate-700"
                        title="View Details"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Execution Detail Modal */}
      {selectedExecution && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-100 flex flex-col max-h-[85vh]">
            <div className="px-6 py-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">Execution Details: {selectedExecution.execution_key}</h3>
                <p className="text-xs text-slate-300">
                  {selectedExecution.workflow_name} • Trigger: {selectedExecution.trigger_type}
                </p>
              </div>
              <button
                onClick={() => setSelectedExecution(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white"
              >
                ×
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {detailLoading ? (
                <div className="py-12 flex justify-center text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin text-red-600" />
                </div>
              ) : (
                <>
                  {/* Status Box */}
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div>
                      <div className="text-xs text-slate-400 font-bold uppercase">Automation Status</div>
                      <div className="mt-1">{getStatusBadge(selectedExecution.status)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400 font-bold uppercase">Tasks Generated</div>
                      <div className="text-base font-black text-slate-900 mt-1">
                        {selectedExecution.created_tasks_count} created ({selectedExecution.failed_tasks_count || 0} failed)
                      </div>
                    </div>
                  </div>

                  {/* Errors if any */}
                  {execErrors.length > 0 && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-2xl space-y-2">
                      <div className="text-xs font-bold text-red-800 uppercase flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-red-600" />
                        Automation Execution Errors
                      </div>
                      <ul className="text-xs text-red-700 list-disc list-inside space-y-1">
                        {execErrors.map((err, idx) => (
                          <li key={idx}>
                            {typeof err === 'string' ? err : err.message || JSON.stringify(err)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Generated Tasks List */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Generated Actionable Tasks ({execTasks.length})
                    </h4>
                    {execTasks.length === 0 ? (
                      <div className="text-xs text-slate-400 py-3">No tasks generated in this run.</div>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {execTasks.map((t) => (
                          <div
                            key={t.id}
                            className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs"
                          >
                            <div>
                              <div className="font-mono text-[10px] text-slate-500">{t.task_code}</div>
                              <div className="font-semibold text-slate-900 mt-0.5">{t.title}</div>
                            </div>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700 capitalize">
                              {t.column_status || t.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedExecution(null)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
