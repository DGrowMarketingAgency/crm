import React, { useState, useEffect } from 'react';
import { servicesService } from '../../services/api';
import {
  X,
  Loader2,
  AlertCircle,
  Briefcase,
  Layers,
  Building2,
  UserCheck,
  Clock,
  Sparkles,
  GitBranch
} from 'lucide-react';

const OWNER_ROLES = [
  { value: 'SEOExec', label: 'SEO Executive' },
  { value: 'PerfMarketingExec', label: 'Performance Marketing Executive' },
  { value: 'ContentExec', label: 'Content Executive' },
  { value: 'DesignExec', label: 'Design Executive' },
  { value: 'VideoExec', label: 'Video Production Executive' },
  { value: 'DevExec', label: 'Web Developer Executive' },
  { value: 'FieldExecutive', label: 'Field / BD Executive' },
  { value: 'AccountManager', label: 'Account Manager' },
  { value: 'Owner', label: 'Agency Owner / Director' }
];

const EXECUTION_CYCLES = [
  'Monthly',
  'Weekly',
  'Bi-Weekly',
  'Quarterly',
  'Per Shoot',
  'Per Catalog Batch',
  'Milestone-based',
  'Setup + Monthly',
  'One Time',
  'Campaign-based'
];

export function ServiceModal({
  isOpen,
  onClose,
  service = null,
  departments = [],
  presets = [],
  onSuccess
}) {
  const isEditing = Boolean(service?.id);

  const [formData, setFormData] = useState({
    service_code: '',
    name: '',
    description: '',
    category: 'Digital Marketing',
    department_id: '',
    default_owner_role: 'AccountManager',
    execution_cycle: 'Monthly',
    workflow_preset_id: '',
    status: 'active'
  });

  const [categories, setCategories] = useState([
    'Digital Marketing',
    'Creative',
    'Development',
    'Consulting'
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (service) {
      setFormData({
        service_code: service.service_code || '',
        name: service.name || '',
        description: service.description || '',
        category: service.category || 'Digital Marketing',
        department_id: service.department_id || '',
        default_owner_role: service.default_owner_role || 'AccountManager',
        execution_cycle: service.execution_cycle || 'Monthly',
        workflow_preset_id: service.workflow_preset_id || '',
        status: service.status || 'active'
      });
    } else {
      setFormData({
        service_code: '',
        name: '',
        description: '',
        category: 'Digital Marketing',
        department_id: '',
        default_owner_role: 'AccountManager',
        execution_cycle: 'Monthly',
        workflow_preset_id: '',
        status: 'active'
      });
    }
    setError('');
  }, [service, isOpen]);

  useEffect(() => {
    if (isOpen) {
      servicesService
        .getCategories()
        .then((res) => {
          if (res.data?.categories) {
            setCategories(res.data.categories);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.service_code.trim()) {
      setError('Service Code is required.');
      return;
    }
    if (!formData.name.trim()) {
      setError('Service Name is required.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const payload = {
        ...formData,
        department_id: formData.department_id ? Number(formData.department_id) : null,
        workflow_preset_id: formData.workflow_preset_id ? Number(formData.workflow_preset_id) : null
      };

      if (isEditing) {
        await servicesService.updateService(service.id, payload);
      } else {
        await servicesService.createService(payload);
      }

      onSuccess(isEditing ? 'Service updated successfully.' : 'New service created successfully.');
      onClose();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error?.message || err.response?.data?.message || err.message || 'Operation failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-red-400">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">
                {isEditing ? 'Edit Service Definition' : 'Define New Reusable Service'}
              </h2>
              <p className="text-xs text-slate-300">
                Configure master service catalogue, department ownership, and workflow automation
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Service Name */}
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-red-500" />
                Service Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. SEO (Website Ranking) incl. AEO & GEO"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 font-medium"
              />
            </div>

            {/* Service Code */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Service Code * (Unique Key)
              </label>
              <input
                type="text"
                required
                disabled={isEditing}
                value={formData.service_code}
                onChange={(e) => setFormData({ ...formData, service_code: e.target.value })}
                placeholder="e.g. SEO, GoogleAds, WebDev"
                className={`w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 font-mono ${
                  isEditing ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''
                }`}
              />
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Category
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Department */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                Responsible Department
              </label>
              <select
                value={formData.department_id}
                onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
              >
                <option value="">-- No Department Linked --</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Default Owner Role */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                Default Owner Role
              </label>
              <select
                value={formData.default_owner_role}
                onChange={(e) => setFormData({ ...formData, default_owner_role: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
              >
                {OWNER_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Execution Cycle */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                Execution Cycle
              </label>
              <select
                value={formData.execution_cycle}
                onChange={(e) => setFormData({ ...formData, execution_cycle: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
              >
                {EXECUTION_CYCLES.map((cy) => (
                  <option key={cy} value={cy}>
                    {cy}
                  </option>
                ))}
              </select>
            </div>

            {/* Workflow Preset Linkage */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-blue-500" />
                Associated Workflow Template
              </label>
              <select
                value={formData.workflow_preset_id}
                onChange={(e) => setFormData({ ...formData, workflow_preset_id: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
              >
                <option value="">-- Built-in Service Workflow Engine --</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.preset_code}) [{p.status}]
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Service Status
              </label>
              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700">
                  <input
                    type="radio"
                    name="status"
                    value="active"
                    checked={formData.status === 'active'}
                    onChange={() => setFormData({ ...formData, status: 'active' })}
                    className="text-red-600 focus:ring-red-500"
                  />
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                    Active (Deployable to Clients)
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700">
                  <input
                    type="radio"
                    name="status"
                    value="inactive"
                    checked={formData.status === 'inactive'}
                    onChange={() => setFormData({ ...formData, status: 'inactive' })}
                    className="text-red-600 focus:ring-red-500"
                  />
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                    Inactive (Paused)
                  </span>
                </label>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Service Description & Scope Notes
              </label>
              <textarea
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe key deliverables, expected client touchpoints, and billing notes..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 resize-none"
              />
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 shadow-md shadow-red-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEditing ? 'Save Changes' : 'Create Service'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
