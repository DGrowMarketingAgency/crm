import React, { useState, useEffect } from 'react';
import { rbacService } from '../../services/api';
import { X, Loader2, AlertCircle, Shield } from 'lucide-react';

export function RoleModal({ isOpen, onClose, role = null, onSuccess }) {
  const isEditing = Boolean(role);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (role) {
      setName(role.name || '');
      setSlug(role.slug || '');
      setDescription(role.description || '');
    } else {
      setName('');
      setSlug('');
      setDescription('');
    }
    setError('');
  }, [role, isOpen]);

  // Auto-generate slug when name changes in create mode
  const handleNameChange = (e) => {
    const val = e.target.value;
    setName(val);
    if (!isEditing) {
      const generatedSlug = val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      setSlug(generatedSlug);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Role name is required.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEditing) {
        await rbacService.updateRole(role.id, {
          name: name.trim(),
          description: description.trim() || null
        });
      } else {
        await rbacService.createRole({
          name: name.trim(),
          slug: slug.trim() || undefined,
          description: description.trim() || null
        });
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Operation failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              {isEditing ? `Edit Role: ${role.name}` : 'Create Custom Role'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Role Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={handleNameChange}
              disabled={isEditing && role.is_system}
              placeholder="e.g. Media Buyer"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-700 disabled:bg-slate-50 disabled:text-slate-500"
            />
            {isEditing && role.is_system && (
              <p className="mt-1 text-[11px] text-slate-400">
                System role names are protected and cannot be changed.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Role Slug
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              disabled={isEditing}
              placeholder="e.g. media-buyer"
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-700 disabled:bg-slate-50 disabled:text-slate-500"
            />
            {!isEditing && (
              <p className="mt-1 text-[11px] text-slate-400">
                Unique identifier used in backend permission evaluations.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explain the scope and responsibilities of this role..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-700"
            />
          </div>

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-brand-700 hover:bg-brand-800 rounded-lg transition-colors shadow-sm disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{isEditing ? 'Save Changes' : 'Create Role'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
