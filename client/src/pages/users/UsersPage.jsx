import React, { useState, useEffect } from 'react';
import { usersService, rbacService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { UserModal } from './UserModal';
import { InviteUserModal } from './InviteUserModal';
import { InvitationsModal } from './InvitationsModal';
import { UserDetailsModal } from './UserDetailsModal';
import { UserRoleModal } from '../rbac/UserRoleModal';
import {
  Users as UsersIcon,
  UserPlus,
  Mail,
  Search,
  Filter,
  Shield,
  Edit2,
  Eye,
  Loader2,
  AlertCircle,
  CheckCircle,
  Clock,
  MoreVertical,
  Check
} from 'lucide-react';

export function UsersPage() {
  const { hasPermission, isOwner } = usePermission();

  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 15;

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [rolesList, setRolesList] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Modals
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [invitationsListOpen, setInvitationsListOpen] = useState(false);

  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [detailsUserId, setDetailsUserId] = useState(null);

  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleTargetUser, setRoleTargetUser] = useState(null);

  const canCreate = isOwner || hasPermission('users.create');
  const canInvite = isOwner || hasPermission('users.invite');
  const canUpdate = isOwner || hasPermission('users.update');
  const canChangeStatus = isOwner || hasPermission('users.change_status');
  const canManageRoles = isOwner || hasPermission('roles.assign_users');

  useEffect(() => {
    loadRoles();
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [page, searchTerm, selectedRole, selectedStatus]);

  const loadRoles = async () => {
    try {
      const res = await rbacService.getRoles();
      setRolesList(res.data.roles || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchUsers = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await usersService.getUsers({
        search: searchTerm,
        role: selectedRole,
        status: selectedStatus,
        limit,
        offset: (page - 1) * limit
      });
      setUsers(res.data.users || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to fetch users.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (targetUser, newStatus) => {
    if (!window.confirm(`Change status of ${targetUser.name} to '${newStatus}'?`)) return;

    try {
      await usersService.changeStatus(targetUser.id, newStatus);
      setNotice(`User status updated to ${newStatus}. Active sessions invalidated if deactivated.`);
      fetchUsers();
      setTimeout(() => setNotice(''), 4000);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to update status.');
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            User Management
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage agency personnel, invite team members, assign RBAC roles, and control account statuses.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canInvite && (
            <button
              onClick={() => setInvitationsListOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors shadow-sm"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Invitations</span>
            </button>
          )}

          {canInvite && (
            <button
              onClick={() => setInviteModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-brand-700 bg-brand-50 border border-brand-200 hover:bg-brand-100 rounded-xl transition-colors shadow-sm"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Invite User</span>
            </button>
          )}

          {canCreate && (
            <button
              onClick={() => {
                setEditingUser(null);
                setUserModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-brand-700 hover:bg-brand-800 rounded-xl transition-colors shadow-sm"
            >
              <UserPlus className="w-4 h-4" />
              <span>Create User</span>
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2.5 animate-in fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2.5 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            placeholder="Search users by name or email address..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-700"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Role Filter */}
          <select
            value={selectedRole}
            onChange={(e) => {
              setSelectedRole(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-700"
          >
            <option value="">All Roles</option>
            {rolesList.map((r) => (
              <option key={r.id} value={r.slug}>
                {r.name}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-700"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>

          <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
            Total: <strong className="text-slate-800">{total}</strong>
          </span>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-brand-700 mb-2" />
            <p className="text-xs text-slate-500 font-medium">Loading agency users...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center">
            <UsersIcon className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">No users match criteria</p>
            <p className="text-xs text-slate-400 mt-1">
              Adjust search filters or create a new user.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-600 font-semibold">
                <tr>
                  <th className="px-5 py-3.5">User</th>
                  <th className="px-5 py-3.5">Designations</th>
                  <th className="px-5 py-3.5">Assigned Roles</th>
                  <th className="px-5 py-3.5">Department</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Last Login</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                    {/* Name & Email */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-brand-700 text-white flex items-center justify-center font-bold text-xs shrink-0">
                          {u.name[0]?.toUpperCase() || 'U'}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-900 block leading-tight">
                            {u.name}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {u.email}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Designations */}
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {u.designations && u.designations.length > 0 ? (
                          u.designations.map((des, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] font-semibold px-2 py-0.5 rounded bg-brand-50 text-brand-800 border border-brand-200"
                            >
                              {des}
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </div>
                    </td>

                    {/* Roles */}
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {u.roles && u.roles.length > 0 ? (
                          u.roles.map((r) => (
                            <span
                              key={r.id}
                              className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${
                                r.slug === 'owner'
                                  ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                  : r.is_system
                                  ? 'bg-slate-100 text-slate-700'
                                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              }`}
                            >
                              {r.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] text-slate-400 capitalize">
                            {u.primary_role || 'Member'}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Department */}
                    <td className="px-5 py-3.5">
                      <span className="text-[11px] font-medium text-slate-700">
                        {u.department || '—'}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span
                        className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                          u.status === 'active'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : u.status === 'suspended'
                            ? 'bg-red-50 text-red-800 border border-red-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>

                    {/* Last Login */}
                    <td className="px-5 py-3.5 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                      {u.last_login_at
                        ? new Date(u.last_login_at).toLocaleDateString()
                        : 'Never'}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setDetailsUserId(u.id);
                            setDetailsModalOpen(true);
                          }}
                          title="View Details"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {canManageRoles && (
                          <button
                            type="button"
                            onClick={() => {
                              setRoleTargetUser(u);
                              setRoleModalOpen(true);
                            }}
                            title="Manage Roles"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-brand-700 hover:bg-brand-50 transition-colors"
                          >
                            <Shield className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {canUpdate && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingUser(u);
                              setUserModalOpen(true);
                            }}
                            title="Edit User"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {canChangeStatus && (
                          <select
                            value={u.status}
                            onChange={(e) => handleStatusChange(u, e.target.value)}
                            title="Change Account Status"
                            className="text-[11px] font-semibold rounded-lg border border-slate-200 bg-white py-1 px-1.5 text-slate-600 hover:border-slate-300 focus:outline-none cursor-pointer"
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                            <option value="suspended">Suspended</option>
                          </select>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Toolbar */}
        {!isLoading && total > limit && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} users
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
              >
                Previous
              </button>
              <span className="px-2 font-semibold text-slate-700">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <UserModal
        isOpen={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        user={editingUser}
        onSuccess={() => {
          fetchUsers();
          setNotice(editingUser ? 'User updated successfully.' : 'User created successfully.');
          setTimeout(() => setNotice(''), 4000);
        }}
      />

      <InviteUserModal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        onSuccess={() => {
          fetchUsers();
          setNotice('Invitation created successfully.');
          setTimeout(() => setNotice(''), 4000);
        }}
      />

      <InvitationsModal
        isOpen={invitationsListOpen}
        onClose={() => setInvitationsListOpen(false)}
      />

      <UserDetailsModal
        isOpen={detailsModalOpen}
        onClose={() => setDetailsModalOpen(false)}
        userId={detailsUserId}
      />

      <UserRoleModal
        isOpen={roleModalOpen}
        onClose={() => setRoleModalOpen(false)}
        targetUser={roleTargetUser}
        onSuccess={() => {
          fetchUsers();
          setNotice('User roles updated successfully.');
          setTimeout(() => setNotice(''), 4000);
        }}
      />
    </div>
  );
}
