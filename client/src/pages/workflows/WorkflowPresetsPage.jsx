import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { workflowPresetsService, departmentsService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import {
  Layers,
  Plus,
  Search,
  Filter,
  Building2,
  Clock,
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle,
  FileText,
  ShieldCheck,
  Tag
} from 'lucide-react';

export function WorkflowPresetsPage() {
  const navigate = useNavigate();
  const { hasPermission, isOwner } = usePermission();

  const [presets, setPresets] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 12;

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const canCreate = isOwner || hasPermission('workflows.create');

  useEffect(() => {
    fetchDepartments();
  }, []);

  useEffect(() => {
    fetchPresets();
  }, [page, searchTerm, selectedDeptId, selectedStatus, selectedCategory]);

  const fetchDepartments = async () => {
    try {
      const res = await departmentsService.getDepartments({ limit: 100 });
      setDepartments(res.data.departments || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPresets = async () => {
    setIsLoading(true);
    setError('');
    try {
      const offset = (page - 1) * limit;
      const res = await workflowPresetsService.getPresets({
        search: searchTerm,
        departmentId: selectedDeptId || undefined,
        status: selectedStatus || undefined,
        serviceCategory: selectedCategory || undefined,
        limit,
        offset
      });

      setPresets(res.data.presets || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error?.message || 'Failed to load workflow presets.');
    } finally {
      setIsLoading(false);
    }
  };

  // Metrics
  const publishedCount = presets.filter((p) => p.status === 'published').length;
  const draftCount = presets.filter((p) => p.status === 'draft').length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Notice Banner */}
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

      {/* Header & Metrics */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200/60 flex items-center justify-center text-red-600 shadow-sm">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  Workflow Presets
                </h1>
                <p className="text-xs font-medium text-slate-500">
                  Reusable, version-controlled operational blueprints for department services
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/departments')}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition-colors flex items-center gap-2"
            >
              <Building2 className="w-4 h-4 text-slate-600" />
              Departments
            </button>
            {canCreate && (
              <button
                onClick={() => navigate('/workflows/builder')}
                className="px-4 py-2.5 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-red-600/30 hover:shadow-red-600/40 transition-all flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Build Preset
              </button>
            )}
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6">
          <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-100">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
              Total Presets
            </span>
            <span className="text-2xl font-extrabold text-slate-900">{total}</span>
          </div>
          <div className="bg-emerald-50/40 p-4 rounded-xl border border-emerald-100/60">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 block mb-1">
              Published & Active
            </span>
            <span className="text-2xl font-extrabold text-emerald-800">{publishedCount}</span>
          </div>
          <div className="bg-amber-50/40 p-4 rounded-xl border border-amber-100/60">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 block mb-1">
              Draft Versions
            </span>
            <span className="text-2xl font-extrabold text-amber-800">{draftCount}</span>
          </div>
          <div className="bg-rose-50/40 p-4 rounded-xl border border-rose-100/60">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-600 block mb-1">
              Covered Departments
            </span>
            <span className="text-2xl font-extrabold text-rose-800">{departments.length}</span>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-4">
        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            placeholder="Search by preset name or code..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Department Filter */}
          <div className="flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-slate-400" />
            <select
              value={selectedDeptId}
              onChange={(e) => {
                setSelectedDeptId(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">All Statuses</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
      </div>

      {/* Preset Cards Grid */}
      {isLoading ? (
        <div className="bg-white rounded-2xl p-16 border border-slate-200/80 shadow-sm flex flex-col items-center justify-center text-slate-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-red-500" />
          <span className="text-sm font-semibold text-slate-600">Loading presets...</span>
        </div>
      ) : presets.length === 0 ? (
        <div className="bg-white rounded-2xl p-16 border border-slate-200/80 shadow-sm text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-200/60 flex items-center justify-center text-red-500 mx-auto mb-4">
            <Layers className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-1">No workflow presets found</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
            {searchTerm || selectedDeptId || selectedStatus
              ? 'Try adjusting your search criteria or filters.'
              : 'Construct your first standardized workflow preset with stages and task templates.'}
          </p>
          {canCreate && (
            <button
              onClick={() => navigate('/workflows/builder')}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl shadow-md transition-all inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Build Preset
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {presets.map((preset) => {
            const isPublished = preset.status === 'published';
            const isDraft = preset.status === 'draft';

            return (
              <div
                key={preset.id}
                onClick={() => navigate(`/workflows/${preset.id}`)}
                className="bg-white rounded-2xl border border-slate-200/80 hover:border-red-300 transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer flex flex-col justify-between overflow-hidden group"
              >
                {/* Top Section */}
                <div className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md truncate max-w-[150px]">
                          {preset.department_name || 'General'}
                        </span>
                        <span className="text-[10px] font-mono uppercase text-slate-400">
                          {preset.preset_code}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900 group-hover:text-red-600 transition-colors line-clamp-1">
                        {preset.name}
                      </h3>
                    </div>

                    {/* Status Badge */}
                    <span
                      className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full shrink-0 ${
                        isPublished
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : isDraft
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {preset.status} (v{preset.current_version_number || 1})
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-500 line-clamp-2 min-h-[32px] leading-relaxed">
                    {preset.description || 'Standard departmental execution blueprint.'}
                  </p>

                  {/* Tags */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                    <span className="px-2 py-0.5 bg-slate-50 border border-slate-200/60 rounded">
                      {preset.service_category}
                    </span>
                    <span className="px-2 py-0.5 bg-slate-50 border border-slate-200/60 rounded capitalize">
                      {preset.workflow_type?.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                {/* Footer Section */}
                <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-xs font-semibold">
                  <div className="flex items-center gap-3 text-slate-600">
                    <span>{preset.stage_count} Stages</span>
                    <span>•</span>
                    <span>{preset.task_count} Tasks</span>
                    {preset.estimated_duration_days ? (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-slate-500">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {preset.estimated_duration_days}d
                        </span>
                      </>
                    ) : null}
                  </div>

                  <span className="text-slate-400 group-hover:text-red-600 flex items-center gap-1 font-bold">
                    <span>Builder</span>
                    <ArrowRight className="w-4 h-4" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between pt-4 text-sm text-slate-500">
          <span>
            Showing {(page - 1) * limit + 1} - {Math.min(page * limit, total)} of {total} presets
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-semibold disabled:opacity-40 hover:bg-slate-50"
            >
              Previous
            </button>
            <button
              disabled={page * limit >= total}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-semibold disabled:opacity-40 hover:bg-slate-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
