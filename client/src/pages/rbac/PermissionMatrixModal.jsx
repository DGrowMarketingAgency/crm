import React, { useState, useEffect } from 'react';
import { rbacService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import {
  X,
  Loader2,
  Check,
  AlertCircle,
  Shield,
  Key,
  Save,
  CheckSquare,
  Square
} from 'lucide-react';

export function PermissionMatrixModal({ isOpen, onClose, role, onSuccess }) {
  const { hasPermission, isOwner } = usePermission();
  const canAssign = isOwner || hasPermission('roles.assign_permissions');

  const [modules, setModules] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [initialIds, setInitialIds] = useState(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const isOwnerRole = role?.slug === 'owner';
  const isProtectedSystem = role?.is_system && !isOwner;
  const isReadOnly = !canAssign || isOwnerRole || isProtectedSystem;

  useEffect(() => {
    if (isOpen && role) {
      loadData();
    }
  }, [isOpen, role]);

  const loadData = async () => {
    setIsLoading(true);
    setError('');
    try {
      // 1. Fetch grouped permission registry
      const permRes = await rbacService.getGroupedPermissions();
      setModules(permRes.data.modules || {});

      // 2. Fetch role's assigned permissions
      const rolePermRes = await rbacService.getRolePermissions(role.id);
      const assignedIds = new Set((rolePermRes.data.permissions || []).map((p) => p.id));
      setSelectedIds(assignedIds);
      setInitialIds(new Set(assignedIds));
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load permission registry.');
    } finally {
      setIsLoading(false);
    }
  };

  const hasUnsavedChanges = () => {
    if (selectedIds.size !== initialIds.size) return true;
    for (const id of selectedIds) {
      if (!initialIds.has(id)) return true;
    }
    return false;
  };

  const handleToggle = (id) => {
    if (isReadOnly) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectModuleAll = (modulePerms) => {
    if (isReadOnly) return;
    const allModuleSelected = modulePerms.every((p) => selectedIds.has(p.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      modulePerms.forEach((p) => {
        if (allModuleSelected) {
          next.delete(p.id);
        } else {
          next.add(p.id);
        }
      });
      return next;
    });
  };

  const handleClearAll = () => {
    if (isReadOnly) return;
    setSelectedIds(new Set());
  };

  const handleSave = async () => {
    if (isReadOnly) return;
    setIsSaving(true);
    setError('');

    try {
      await rbacService.setRolePermissions(role.id, Array.from(selectedIds));
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to save permissions.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !role) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 text-lg">
                Permission Matrix: {role.name}
              </span>
              <span
                className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                  role.is_system
                    ? 'bg-slate-100 text-slate-700'
                    : 'bg-brand-50 text-brand-700 border border-brand-200'
                }`}
              >
                {role.is_system ? 'System Role' : 'Custom Role'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Select the granular module operations granted to users with this role.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Read-Only Banner / Alerts */}
        {isOwnerRole && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>The Owner role possesses immutable, complete system permissions.</span>
          </div>
        )}

        {error && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-brand-700 mb-2" />
              <p className="text-xs text-slate-500">Loading permission registry...</p>
            </div>
          ) : (
            <>
              {/* Matrix Toolbar */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 text-xs">
                <span className="font-semibold text-slate-700">
                  Assigned Permissions: <strong className="text-brand-700">{selectedIds.size}</strong> selected
                </span>

                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="text-slate-500 hover:text-red-600 transition-colors font-medium"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {/* Grouped Modules */}
              {Object.entries(modules).map(([moduleName, perms]) => {
                const isAllModuleSelected = perms.every((p) => selectedIds.has(p.id));
                const isSomeModuleSelected = perms.some((p) => selectedIds.has(p.id));

                return (
                  <div
                    key={moduleName}
                    className="border border-slate-200/80 rounded-xl overflow-hidden bg-slate-50/50"
                  >
                    {/* Module Header */}
                    <div className="px-4 py-3 bg-slate-100/70 border-b border-slate-200/70 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Key className="w-4 h-4 text-brand-700" />
                        <span className="font-bold text-sm text-slate-800">
                          {moduleName} Module
                        </span>
                        <span className="text-[11px] text-slate-500">
                          ({perms.filter((p) => selectedIds.has(p.id)).length} of {perms.length})
                        </span>
                      </div>

                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={() => handleSelectModuleAll(perms)}
                          className="text-xs text-brand-700 hover:text-brand-800 font-semibold"
                        >
                          {isAllModuleSelected ? 'Deselect Module' : 'Select All'}
                        </button>
                      )}
                    </div>

                    {/* Permissions Grid */}
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 bg-white">
                      {perms.map((p) => {
                        const isChecked = selectedIds.has(p.id);

                        return (
                          <label
                            key={p.id}
                            className={`flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                              isChecked
                                ? 'bg-brand-50/40 border-brand-300 ring-1 ring-brand-200'
                                : 'bg-white border-slate-200 hover:border-slate-300'
                            } ${isReadOnly ? 'cursor-default opacity-85' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggle(p.id)}
                              disabled={isReadOnly}
                              className="mt-0.5 rounded border-slate-300 text-brand-700 focus:ring-brand-500 w-4 h-4"
                            />
                            <div className="min-w-0">
                              <span className="text-xs font-semibold text-slate-800 block">
                                {p.action.toUpperCase()} — {p.permission_key}
                              </span>
                              <span className="text-[11px] text-slate-500 leading-tight block mt-0.5">
                                {p.description}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50 rounded-b-2xl">
          <div className="text-xs text-slate-500">
            {hasUnsavedChanges() && (
              <span className="text-amber-600 font-medium">⚠️ Unsaved permission modifications</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors"
            >
              Cancel
            </button>

            {!isReadOnly && (
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || !hasUnsavedChanges()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-brand-700 hover:bg-brand-800 rounded-lg transition-colors shadow-sm disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Save Permissions</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
