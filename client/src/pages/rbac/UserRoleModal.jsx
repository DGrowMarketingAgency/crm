import React, { useState, useEffect } from 'react';
import { rbacService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import {
  X,
  Loader2,
  AlertCircle,
  Users,
  Shield,
  Save,
  Check
} from 'lucide-react';

export function UserRoleModal({ isOpen, onClose, targetUser, onSuccess }) {
  const { isOwner } = usePermission();
  const [allRoles, setAllRoles] = useState([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && targetUser) {
      loadData();
    }
  }, [isOpen, targetUser]);

  const loadData = async () => {
    setIsLoading(true);
    setError('');
    try {
      // 1. Fetch all roles
      const rolesRes = await rbacService.getRoles();
      setAllRoles(rolesRes.data.roles || []);

      // 2. Fetch target user assigned roles
      const userRolesRes = await rbacService.getUserRoles(targetUser.id);
      const assignedIds = new Set((userRolesRes.data.roles || []).map((r) => r.id));
      setSelectedRoleIds(assignedIds);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load user roles.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = (role) => {
    // If not owner, prevent selecting the Owner role (Privilege Escalation protection)
    if (role.slug === 'owner' && !isOwner) {
      setError('Only an active Owner can assign or remove Owner privileges.');
      return;
    }

    setSelectedRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(role.id)) {
        next.delete(role.id);
      } else {
        next.add(role.id);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError('');

    try {
      await rbacService.setUserRoles(targetUser.id, Array.from(selectedRoleIds));
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to assign roles.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !targetUser) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Assign Roles: {targetUser.name}
              </h3>
              <p className="text-xs text-slate-500">{targetUser.email}</p>
            </div>
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
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-4 space-y-3 max-h-80 overflow-y-auto p-1">
          {isLoading ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-brand-700" />
            </div>
          ) : (
            allRoles.map((role) => {
              const isChecked = selectedRoleIds.has(role.id);
              const isOwnerRole = role.slug === 'owner';
              const disabled = isOwnerRole && !isOwner;

              return (
                <label
                  key={role.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                    isChecked
                      ? 'bg-brand-50/50 border-brand-300 ring-1 ring-brand-200'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggle(role)}
                    disabled={disabled}
                    className="mt-0.5 rounded border-slate-300 text-brand-700 focus:ring-brand-500 w-4 h-4"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">
                        {role.name}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          role.is_system
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {role.is_system ? 'System' : 'Custom'}
                      </span>
                    </div>
                    {role.description && (
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                        {role.description}
                      </p>
                    )}
                  </div>
                </label>
              );
            })
          )}
        </div>

        <div className="mt-6 pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-brand-700 hover:bg-brand-800 rounded-lg transition-colors shadow-sm disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>Save Role Assignments</span>
          </button>
        </div>
      </div>
    </div>
  );
}
