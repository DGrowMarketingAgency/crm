import React, { useState, useEffect } from 'react';
import { usersService, rbacService } from '../../services/api';
import { X, Loader2, AlertCircle, User, Shield } from 'lucide-react';

export function UserModal({ isOpen, onClose, user = null, onSuccess }) {
  const isEditing = Boolean(user);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [designationsInput, setDesignationsInput] = useState('');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('active');
  const [roleIds, setRoleIds] = useState([]);
  const [availableRoles, setAvailableRoles] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadRoles();
      if (user) {
        setName(user.name || '');
        setEmail(user.email || '');
        setPassword('');
        setDesignationsInput(user.designations ? user.designations.join(', ') : '');
        setDepartment(user.department || '');
        setStatus(user.status || 'active');
        setRoleIds(user.roles ? user.roles.map((r) => r.id) : []);
      } else {
        setName('');
        setEmail('');
        setPassword('');
        setDesignationsInput('');
        setDepartment('');
        setStatus('active');
        setRoleIds([]);
      }
      setError('');
    }
  }, [isOpen, user]);

  const loadRoles = async () => {
    try {
      const res = await rbacService.getRoles();
      setAvailableRoles(res.data.roles || []);
    } catch (e) {
      console.error('Failed to load roles', e);
    }
  };

  const handleRoleToggle = (rId) => {
    setRoleIds((prev) =>
      prev.includes(rId) ? prev.filter((id) => id !== rId) : [...prev, rId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim() || !email.trim()) {
      setError('Name and email are required.');
      return;
    }

    if (!isEditing && !password && password.length > 0 && password.length < 8) {
      setError('Password must be at least 8 characters if provided.');
      return;
    }

    setIsSubmitting(true);

    const designations = designationsInput
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);

    try {
      if (isEditing) {
        await usersService.updateUser(user.id, {
          name: name.trim(),
          email: email.trim(),
          designations,
          department: department || null
        });
      } else {
        await usersService.createUser({
          name: name.trim(),
          email: email.trim(),
          password: password || undefined,
          status,
          roleIds,
          designations,
          department: department || null
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              {isEditing ? `Edit User: ${user.name}` : 'Create Agency User'}
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
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sarah Jenkins"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-700"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Email Address <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="sarah@agency.com"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-700"
            />
          </div>

          {!isEditing && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Initial Password <span className="text-slate-400 font-normal">(Optional, auto-generated if blank)</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank for secure auto-generation"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-700"
              />
            </div>
          )}

          {!isEditing && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Assign Initial Roles
              </label>
              <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-1 border border-slate-100 rounded-lg">
                {availableRoles.map((r) => (
                  <label
                    key={r.id}
                    className="flex items-center gap-2 p-2 rounded border border-slate-100 text-xs hover:bg-slate-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={roleIds.includes(r.id)}
                      onChange={() => handleRoleToggle(r.id)}
                      className="rounded border-slate-300 text-brand-700 focus:ring-brand-500 w-3.5 h-3.5"
                    />
                    <span className="truncate">{r.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

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
              <span>{isEditing ? 'Save Changes' : 'Create User'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
