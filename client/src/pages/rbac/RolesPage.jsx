import React, { useState, useEffect } from 'react';
import { rbacService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { RoleModal } from './RoleModal';
import { PermissionMatrixModal } from './PermissionMatrixModal';
import {
  ShieldCheck,
  Plus,
  Search,
  Key,
  Edit2,
  Trash2,
  Loader2,
  AlertCircle,
  Users,
  CheckCircle,
  Calendar
} from 'lucide-react';

export function RolesPage() {
  const { hasPermission, isOwner } = usePermission();

  const [roles, setRoles] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Modals state
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState(null);

  const [matrixModalOpen, setMatrixModalOpen] = useState(false);
  const [matrixRole, setMatrixRole] = useState(null);

  const [deletingRoleId, setDeletingRoleId] = useState(null);

  const canCreate = isOwner || hasPermission('roles.create');
  const canUpdate = isOwner || hasPermission('roles.update');
  const canDelete = isOwner || hasPermission('roles.delete');
  const canAssignPerms = isOwner || hasPermission('roles.assign_permissions');

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await rbacService.getRoles();
      setRoles(res.data.roles || []);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to fetch roles.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteRole = async (role) => {
    if (!window.confirm(`Are you sure you want to delete the custom role '${role.name}'?`)) {
      return;
    }

    setDeletingRoleId(role.id);
    setError('');
    try {
      await rbacService.deleteRole(role.id);
      setActionSuccess(`Role '${role.name}' was successfully removed.`);
      fetchRoles();
      setTimeout(() => setActionSuccess(''), 4000);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to delete role.');
    } finally {
      setDeletingRoleId(null);
    }
  };

  const filteredRoles = roles.filter(
    (r) =>
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.description && r.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Page Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Roles & Permissions
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Define system roles, create custom permissions, and manage granular access matrices.
          </p>
        </div>

        {canCreate && (
          <button
            onClick={() => {
              setEditingRole(null);
              setRoleModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-brand-700 hover:bg-brand-800 active:bg-brand-900 rounded-xl transition-colors shadow-sm shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create Custom Role</span>
          </button>
        )}
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2.5 animate-in fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2.5 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search roles by title, slug, or description..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-700"
          />
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Total Roles: <strong className="text-slate-800">{roles.length}</strong>
        </div>
      </div>

      {/* Roles Grid / Table */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center bg-white rounded-2xl border border-slate-200/80">
          <Loader2 className="w-8 h-8 animate-spin text-brand-700 mb-2" />
          <p className="text-xs text-slate-500 font-medium">Loading agency roles...</p>
        </div>
      ) : filteredRoles.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-2xl border border-slate-200/80">
          <ShieldCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">No roles found</p>
          <p className="text-xs text-slate-400 mt-1">
            Try adjusting your search query or create a new custom role.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredRoles.map((role) => (
            <div
              key={role.id}
              className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-slate-900 text-base leading-tight">
                      {role.name}
                    </h3>
                    <span className="font-mono text-[11px] text-slate-400 mt-0.5 block">
                      @{role.slug}
                    </span>
                  </div>

                  <span
                    className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                      role.is_system
                        ? 'bg-slate-100 text-slate-700 border border-slate-200'
                        : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    {role.is_system ? 'System' : 'Custom'}
                  </span>
                </div>

                {/* Description */}
                <p className="text-xs text-slate-600 mt-3 line-clamp-2 min-h-[32px]">
                  {role.description || 'No description provided for this role.'}
                </p>

                {/* Metadata Pills */}
                <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 text-slate-600">
                    <Users className="w-3.5 h-3.5 text-brand-700" />
                    <span>
                      <strong>{role.user_count}</strong> {role.user_count === 1 ? 'User' : 'Users'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 text-slate-600">
                    <Key className="w-3.5 h-3.5 text-brand-700" />
                    <span>
                      <strong>{role.slug === 'owner' ? 'All' : role.permission_count}</strong> Perms
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMatrixRole(role);
                    setMatrixModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg transition-colors"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>Permissions</span>
                </button>

                <div className="flex items-center gap-1">
                  {canUpdate && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRole(role);
                        setRoleModalOpen(true);
                      }}
                      title="Edit Role"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {canDelete && !role.is_system && (
                    <button
                      type="button"
                      onClick={() => handleDeleteRole(role)}
                      disabled={deletingRoleId === role.id || role.user_count > 0}
                      title={
                        role.user_count > 0
                          ? 'Cannot delete role with assigned users'
                          : 'Delete Custom Role'
                      }
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {deletingRoleId === role.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Role Create/Edit Modal */}
      <RoleModal
        isOpen={roleModalOpen}
        onClose={() => setRoleModalOpen(false)}
        role={editingRole}
        onSuccess={() => {
          fetchRoles();
          setActionSuccess(
            editingRole ? 'Role updated successfully.' : 'New custom role created successfully.'
          );
          setTimeout(() => setActionSuccess(''), 4000);
        }}
      />

      {/* Permission Matrix Modal */}
      <PermissionMatrixModal
        isOpen={matrixModalOpen}
        onClose={() => setMatrixModalOpen(false)}
        role={matrixRole}
        onSuccess={() => {
          fetchRoles();
          setActionSuccess('Permissions saved successfully.');
          setTimeout(() => setActionSuccess(''), 4000);
        }}
      />
    </div>
  );
}
