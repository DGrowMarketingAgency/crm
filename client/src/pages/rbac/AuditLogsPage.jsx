import React, { useState, useEffect } from 'react';
import { rbacService } from '../../services/api';
import {
  FileText,
  Clock,
  User,
  Shield,
  Loader2,
  RefreshCw,
  Search,
  Filter
} from 'lucide-react';

export function AuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterAction, setFilterAction] = useState('');

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await rbacService.getAuditLogs({ limit: 100 });
      setLogs(res.data.logs || []);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load audit logs.');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredLogs = filterAction
    ? logs.filter((l) => l.action.toLowerCase().includes(filterAction.toLowerCase()))
    : logs;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Security Audit Trail
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Immutable log of role creation, permission changes, and security-sensitive administrative actions.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors shadow-sm shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Logs</span>
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs">
          {error}
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            placeholder="Filter by action (e.g. role.created, permissions)..."
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-700"
          />
        </div>
        <span className="text-xs text-slate-500 font-medium ml-auto">
          Entries: <strong className="text-slate-800">{filteredLogs.length}</strong>
        </span>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-brand-700 mb-2" />
            <p className="text-xs text-slate-500 font-medium">Loading security logs...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">No audit events recorded yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-600 font-semibold">
                <tr>
                  <th className="px-5 py-3.5">Timestamp</th>
                  <th className="px-5 py-3.5">Actor</th>
                  <th className="px-5 py-3.5">Action</th>
                  <th className="px-5 py-3.5">Entity</th>
                  <th className="px-5 py-3.5">Details</th>
                  <th className="px-5 py-3.5">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-normal">
                {filteredLogs.map((log) => {
                  let detailsObj = null;
                  try {
                    detailsObj = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
                  } catch (e) {
                    detailsObj = log.details;
                  }

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">
                          {log.actor_name || 'System / Bootstrap'}
                        </div>
                        {log.actor_email && (
                          <div className="text-[11px] text-slate-400">{log.actor_email}</div>
                        )}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <span className="font-mono px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-800">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <span className="capitalize">{log.entity_type}</span>{' '}
                        <span className="font-mono text-[11px] text-slate-400">#{log.entity_id}</span>
                      </td>
                      <td className="px-5 py-3 max-w-xs truncate text-[11px] font-mono text-slate-600">
                        {detailsObj ? JSON.stringify(detailsObj) : '—'}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap text-[11px] text-slate-400 font-mono">
                        {log.ip_address || '127.0.0.1'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
