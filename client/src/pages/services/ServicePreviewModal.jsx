import React, { useState, useEffect } from 'react';
import { servicesService } from '../../services/api';
import {
  X,
  Loader2,
  AlertCircle,
  Briefcase,
  GitBranch,
  Clock,
  UserCheck,
  CheckCircle2,
  FileText,
  ShieldCheck,
  Building2,
  Layers,
  ArrowRight
} from 'lucide-react';

export function ServicePreviewModal({ isOpen, onClose, serviceId }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && serviceId) {
      setLoading(true);
      setError('');
      servicesService
        .getService(serviceId)
        .then((res) => {
          setData(res.data);
        })
        .catch((err) => {
          console.error(err);
          setError(err.response?.data?.error?.message || 'Failed to load workflow preview.');
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, serviceId]);

  if (!isOpen) return null;

  const service = data?.service;
  const workflowPreview = data?.workflowPreview;
  const stages = workflowPreview?.stages || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-red-400">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">
                {service ? service.name : 'Service Workflow Preview'}
              </h2>
              <p className="text-xs text-slate-300">
                Inspection of stages, task dependencies, approval gates & execution cycle
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-slate-300 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-red-600" />
              <p className="text-sm font-medium">Loading service workflow blueprint...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : (
            <>
              {/* Meta Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Service Code
                  </div>
                  <div className="text-sm font-mono font-bold text-slate-800">
                    {service?.service_code}
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Cycle
                  </div>
                  <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    {service?.execution_cycle || 'Monthly'}
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Department
                  </div>
                  <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5 truncate">
                    <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="truncate">{service?.department_name || 'Cross-functional'}</span>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Owner Role
                  </div>
                  <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5 truncate">
                    <UserCheck className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="truncate">{service?.default_owner_role || 'AccountManager'}</span>
                  </div>
                </div>
              </div>

              {/* Version & Preset Traceability */}
              <div className="p-4 bg-gradient-to-r from-red-50 to-orange-50 border border-red-100 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center font-bold text-xs">
                    v{workflowPreview?.version?.version_number || 1}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900">
                      {service?.workflow_preset_name || 'Standard Agency Automation Engine'}
                    </div>
                    <div className="text-xs text-slate-500">
                      Status: <span className="font-semibold text-emerald-600 uppercase text-[10px]">Published & Immutable</span> • Total Stages: {stages.length}
                    </div>
                  </div>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white text-slate-700 shadow-sm border border-slate-200">
                  Auto-Trigger Enabled
                </span>
              </div>

              {/* Workflow Stages Timeline */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Workflow Execution Stages & Tasks
                </h3>

                {stages.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">
                    No stage definitions configured for this service yet.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {stages.map((stage, idx) => (
                      <div
                        key={stage.id || idx}
                        className="border border-slate-200 rounded-2xl p-4 bg-white hover:border-slate-300 transition-colors shadow-sm"
                      >
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                          <div className="flex items-center gap-2.5">
                            <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-sm text-slate-900">
                              {stage.name}
                            </span>
                            {stage.days && (
                              <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md font-medium">
                                ~{stage.days} days
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-400 font-medium">
                            {stage.tasks?.length || 0} tasks
                          </span>
                        </div>

                        {/* Task items */}
                        <div className="space-y-2">
                          {(stage.tasks || []).map((t, tIdx) => {
                            const isCR = t.requires_client_approval;
                            return (
                              <div
                                key={t.id || tIdx}
                                className="flex items-start justify-between gap-3 p-2.5 rounded-xl bg-slate-50/70 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                              >
                                <div className="flex items-start gap-2">
                                  <CheckCircle2 className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                                  <span className="font-medium text-slate-800 leading-relaxed">
                                    {t.title}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {isCR && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700">
                                      Client Review
                                    </span>
                                  )}
                                  {t.default_assignee_role && (
                                    <span className="text-[10px] text-slate-500 font-mono">
                                      {t.default_assignee_role}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition-colors"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
}
