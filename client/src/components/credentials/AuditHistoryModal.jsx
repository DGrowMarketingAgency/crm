import React, { useState, useEffect } from 'react';
import {
  X,
  History,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Eye,
  Key,
  UserCheck,
  RefreshCw,
  Globe
} from 'lucide-react';
import { credentialsService } from '../../services/api';

const ACTION_BADGES = {
  created: { label: 'Created', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: Key },
  updated: { label: 'Updated', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: RefreshCw },
  password_replaced: { label: 'Password Replaced', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: Lock },
  revealed: { label: 'Revealed', color: 'bg-purple-50 text-purple-700 border-purple-200', icon: Eye },
  access_granted: { label: 'Access Granted', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: UserCheck },
  access_updated: { label: 'Access Updated', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: RefreshCw },
  access_revoked: { label: 'Access Revoked', color: 'bg-rose-50 text-rose-700 border-rose-200', icon: AlertTriangle },
  access_revoked_by_client: { label: 'Revoked By Client', color: 'bg-rose-50 text-rose-700 border-rose-200', icon: AlertTriangle },
  unauthorized_attempt: { label: 'Unauthorized Attempt', color: 'bg-rose-100 text-rose-800 border-rose-300 font-bold', icon: AlertTriangle },
  archived: { label: 'Archived', color: 'bg-slate-100 text-slate-700 border-slate-300', icon: Lock }
};

export function AuditHistoryModal({ isOpen, onClose, credential }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && credential?.id) {
      loadLogs();
    }
  }, [isOpen, credential?.id]);

  const loadLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await credentialsService.getAuditHistory(credential.id);
      if (res.data?.success) {
        setLogs(res.data.logs || []);
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load audit history.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !credential) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200/80 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center shadow-sm">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-800">
                  Credential Security Audit Log
                </h3>
                <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                  {credential.platform_name}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Immutable security trail · Secrets are never stored in audit logs.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Logs List */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs mb-4">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400">Loading audit trail...</div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">No events logged yet.</div>
          ) : (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
              {logs.map((log) => {
                const badge = ACTION_BADGES[log.action] || {
                  label: log.action,
                  color: 'bg-slate-100 text-slate-700 border-slate-200',
                  icon: History
                };
                const IconComponent = badge.icon;
                const isDenied = log.outcome === 'denied';

                return (
                  <div key={log.id} className="relative group">
                    {/* Circle Node */}
                    <div
                      className={`absolute -left-6 top-1 w-5 h-5 rounded-full border-2 bg-white flex items-center justify-center ${
                        isDenied
                          ? 'border-rose-500 text-rose-500'
                          : 'border-emerald-600 text-emerald-600'
                      }`}
                    >
                      <div
                        className={`w-1.5 h-1.5 rounded-full ${isDenied ? 'bg-rose-500' : 'bg-emerald-600'}`}
                      />
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/80 hover:bg-slate-50 transition-colors space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${badge.color}`}
                          >
                            <IconComponent className="w-3 h-3" />
                            {badge.label}
                          </span>
                          {isDenied && (
                            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                              DENIED
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {new Date(log.created_at).toLocaleString()}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-700">
                        <span className="font-semibold">
                          Actor: {log.actor_name || 'System / User'}
                        </span>
                        {log.ip_address && (
                          <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                            <Globe className="w-3 h-3 text-slate-300" />
                            {log.ip_address}
                          </span>
                        )}
                      </div>

                      {log.access_reason && (
                        <p className="text-[11px] text-slate-500 italic bg-white p-2 rounded-lg border border-slate-100">
                          Reason: {log.access_reason}
                        </p>
                      )}

                      {log.failure_reason && (
                        <p className="text-[11px] text-rose-600 font-medium">
                          Violation: {log.failure_reason}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200/80 bg-slate-50/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
