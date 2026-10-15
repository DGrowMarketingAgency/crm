import React, { useState, useEffect } from 'react';
import { departmentsService, usersService } from '../../services/api';
import { X, Loader2, AlertCircle, Building2, UserCheck, Shield } from 'lucide-react';

export function DepartmentModal({ isOpen, onClose, department = null, onSuccess }) {
  const isEditing = Boolean(department);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('active');
  const [managerId, setManagerId] = useState('');
  const [activeUsers, setActiveUsers] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadActiveUsers();
      if (department) {
        setName(department.name || '');
        setCode(department.code || '');
        setDescription(department.description || '');
        setStatus(department.status || 'active');
        setManagerId(department.manager_id ? String(department.manager_id) : '');
      } else {
        setName('');
        setCode('');
        setDescription('');
        setStatus('active');
        setManagerId('');
      }
      setError('');
    }
  }, [isOpen, department]);

  const loadActiveUsers = async () => {
    try {
      const res = await usersService.getUsers({ status: 'active', limit: 100 });
      setActiveUsers(res.data.users || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleNameChange = (val) => {
    setName(val);
    if (!isEditing && (!code || code === department?.code)) {
      // Auto-suggest code if creating new department
      const suggested = val
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 30);
      setCode(suggested);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Department name is required.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        name: name.trim(),
        code: code.trim() ? code.trim().toUpperCase() : undefined,
        description: description.trim() || null,
        manager_id: managerId ? Number(managerId) : null,
        status
      };

      if (isEditing) {
        await departmentsService.updateDepartment(department.id, payload);
      } else {
        await departmentsService.createDepartment(payload);
      }

      onSuccess(isEditing ? 'Department updated successfully.' : 'Department created successfully.');
      onClose();
    } catch (err) {
      console.error(err);
      const errMsg =
        err.response?.data?.error?.message ||
        (typeof err.response?.data?.error === 'string'
          ? err.response?.data?.error
          : err.message || 'Operation failed.');
      setError(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-[#1a0306] to-[#450a0a] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/30 border border-red-500/30 flex items-center justify-center text-red-300">
              <Building2 className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">
                {isEditing ? 'Edit Department' : 'Create Department'}
              </h3>
              <p className="text-xs text-rose-200/80">
                {isEditing ? 'Update organizational branch settings' : 'Configure a reusable operational department'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-red-700 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
              <div className="font-medium">{error}</div>
            </div>
          )}

          {/* Department Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Department Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g., Search Engine Optimization"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all"
              required
            />
          </div>

          {/* Department Code & Status Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Department Code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g., SEO"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder-slate-400 uppercase focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all"
              />
              <p className="text-[11px] text-slate-400 mt-1">Unique identifier code</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          {/* Department Manager */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Department Manager</span>
              <span className="text-[11px] text-slate-400 font-normal">Optional lead assignment</span>
            </label>
            <div className="relative">
              <select
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all"
              >
                <option value="">No Manager Assigned</option>
                {activeUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Description
            </label>
            <textarea
              rows="3"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Outline department scope, responsibilities, and deliverables..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all resize-none"
            />
          </div>

          {/* Actions */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-red-600/30 hover:shadow-red-600/50 flex items-center gap-2 transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : isEditing ? (
                'Save Changes'
              ) : (
                'Create Department'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
