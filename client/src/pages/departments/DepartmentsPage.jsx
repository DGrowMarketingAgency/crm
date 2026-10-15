import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { departmentsService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { DepartmentModal } from './DepartmentModal';
import {
  Building2,
  Plus,
  Search,
  Filter,
  Eye,
  Edit2,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle,
  Users,
  Layers,
  Shield,
  ArrowRight,
  Archive
} from 'lucide-react';

export function DepartmentsPage() {
  const navigate = useNavigate();
  const { hasPermission, isOwner } = usePermission();

  const [departments, setDepartments] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 12;

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Modals
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState(null);

  // Delete / Archive Modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deptToDelete, setDeptToDelete] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const canCreate = isOwner || hasPermission('departments.create');
  const canUpdate = isOwner || hasPermission('departments.update');
  const canDelete = isOwner || hasPermission('departments.delete');

  useEffect(() => {
    fetchDepartments();
  }, [page, searchTerm, selectedStatus]);

  const fetchDepartments = async () => {
    setIsLoading(true);
    setError('');
    try {
      const offset = (page - 1) * limit;
      const res = await departmentsService.getDepartments({
        search: searchTerm,
        status: selectedStatus,
        limit,
        offset
      });

      setDepartments(res.data.departments || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error(err);
      const errMsg =
        err.response?.data?.error?.message ||
        (typeof err.response?.data?.error === 'string'
          ? err.response?.data?.error
          : err.message || 'Failed to load departments.');
      setError(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  const handleOpenCreate = () => {
    setEditingDept(null);
    setDeptModalOpen(true);
  };

  const handleOpenEdit = (dept, e) => {
    e.stopPropagation();
    setEditingDept(dept);
    setDeptModalOpen(true);
  };

  const handleOpenDelete = (dept, e) => {
    e.stopPropagation();
    setDeptToDelete(dept);
    setDeleteError('');
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async (forceArchive = false) => {
    if (!deptToDelete) return;
    setIsDeleting(true);
    setDeleteError('');

    try {
      const res = await departmentsService.deleteDepartment(deptToDelete.id, {
        archive: forceArchive ? 'true' : 'false'
      });
      showToast(res.data?.message || 'Department updated successfully.');
      setDeleteModalOpen(false);
      setDeptToDelete(null);
      fetchDepartments();
    } catch (err) {
      console.error(err);
      const errMsg =
        err.response?.data?.error?.message ||
        (typeof err.response?.data?.error === 'string'
          ? err.response?.data?.error
          : err.message || 'Action failed.');
      setDeleteError(errMsg);
    } finally {
      setIsDeleting(false);
    }
  };

  // Metrics
  const activeCount = departments.filter((d) => d.status === 'active').length;
  const totalMembers = departments.reduce((acc, d) => acc + (d.member_count || 0), 0);
  const totalPresets = departments.reduce((acc, d) => acc + (d.preset_count || 0), 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Notifications */}
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
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  Department Management
                </h1>
                <p className="text-xs font-medium text-slate-500">
                  Organize agency disciplines, designate managers, and assign workflow presets
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/workflows')}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition-colors flex items-center gap-2"
            >
              <Layers className="w-4 h-4 text-slate-600" />
              Workflow Presets
            </button>
            {canCreate && (
              <button
                onClick={handleOpenCreate}
                className="px-4 py-2.5 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-red-600/30 hover:shadow-red-600/40 transition-all flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                New Department
              </button>
            )}
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6">
          <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-100">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
              Total Departments
            </span>
            <span className="text-2xl font-extrabold text-slate-900">{total}</span>
          </div>
          <div className="bg-emerald-50/40 p-4 rounded-xl border border-emerald-100/60">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 block mb-1">
              Active Branches
            </span>
            <span className="text-2xl font-extrabold text-emerald-800">{activeCount}</span>
          </div>
          <div className="bg-sky-50/40 p-4 rounded-xl border border-sky-100/60">
            <span className="text-xs font-semibold uppercase tracking-wider text-sky-600 block mb-1">
              Assigned Members
            </span>
            <span className="text-2xl font-extrabold text-sky-800">{totalMembers}</span>
          </div>
          <div className="bg-rose-50/40 p-4 rounded-xl border border-rose-100/60">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-600 block mb-1">
              Workflow Presets
            </span>
            <span className="text-2xl font-extrabold text-rose-800">{totalPresets}</span>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            placeholder="Search by department name or code..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
      </div>

      {/* Departments Grid */}
      {isLoading ? (
        <div className="bg-white rounded-2xl p-16 border border-slate-200/80 shadow-sm flex flex-col items-center justify-center text-slate-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-red-500" />
          <span className="text-sm font-semibold text-slate-600">Loading departments...</span>
        </div>
      ) : departments.length === 0 ? (
        <div className="bg-white rounded-2xl p-16 border border-slate-200/80 shadow-sm text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-200/60 flex items-center justify-center text-red-500 mx-auto mb-4">
            <Building2 className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-1">No departments found</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
            {searchTerm || selectedStatus
              ? 'Try modifying your search or filters.'
              : 'Create your first organizational department to configure workflows.'}
          </p>
          {canCreate && (
            <button
              onClick={handleOpenCreate}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl shadow-md transition-all inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create Department
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {departments.map((dept) => {
            const isArchived = dept.status === 'archived';
            const isInactive = dept.status === 'inactive';

            return (
              <div
                key={dept.id}
                onClick={() => navigate(`/departments/${dept.id}`)}
                className={`bg-white rounded-2xl border transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer flex flex-col justify-between overflow-hidden group ${
                  isArchived
                    ? 'border-slate-200 opacity-70 bg-slate-50/50'
                    : 'border-slate-200/80 hover:border-red-300'
                }`}
              >
                {/* Top Section */}
                <div className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-50 to-rose-100 border border-red-200/70 flex items-center justify-center text-red-600 font-extrabold text-sm shrink-0 shadow-sm">
                        {dept.code?.slice(0, 3) || 'DEP'}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-bold text-slate-900 group-hover:text-red-600 transition-colors truncate">
                          {dept.name}
                        </h3>
                        <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                          {dept.code}
                        </span>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <span
                      className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full shrink-0 ${
                        dept.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                          : dept.status === 'inactive'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200/80'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {dept.status}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-500 line-clamp-2 min-h-[32px] leading-relaxed">
                    {dept.description || 'No description provided for this department.'}
                  </p>

                  {/* Manager Banner */}
                  <div className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-medium">Department Lead:</span>
                    <span className="font-semibold text-slate-800 flex items-center gap-1.5 truncate max-w-[170px]">
                      {dept.manager_name ? (
                        <>
                          <Shield className="w-3.5 h-3.5 text-red-500 shrink-0" />
                          <span className="truncate">{dept.manager_name}</span>
                        </>
                      ) : (
                        <span className="text-slate-400 italic">Unassigned</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Footer Section */}
                <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-4 text-xs font-semibold text-slate-600">
                    <span className="flex items-center gap-1.5" title="Department Members">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      {dept.member_count} {dept.member_count === 1 ? 'member' : 'members'}
                    </span>
                    <span className="flex items-center gap-1.5 text-rose-700" title="Active Workflow Presets">
                      <Layers className="w-3.5 h-3.5 text-rose-500" />
                      {dept.preset_count} {dept.preset_count === 1 ? 'preset' : 'presets'}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
                    {canUpdate && (
                      <button
                        onClick={(e) => handleOpenEdit(dept, e)}
                        className="p-1.5 hover:bg-slate-200/70 text-slate-500 hover:text-slate-800 rounded-lg transition-colors"
                        title="Edit Department"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={(e) => handleOpenDelete(dept, e)}
                        className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors"
                        title="Archive or Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <span className="text-slate-400 group-hover:text-red-600 pl-1">
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  </div>
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
            Showing {(page - 1) * limit + 1} - {Math.min(page * limit, total)} of {total} departments
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

      {/* Department Modal */}
      <DepartmentModal
        isOpen={deptModalOpen}
        onClose={() => setDeptModalOpen(false)}
        department={editingDept}
        onSuccess={(msg) => {
          showToast(msg);
          fetchDepartments();
        }}
      />

      {/* Delete / Archive Confirmation Modal */}
      {deleteModalOpen && deptToDelete && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600 mb-4">
              <Archive className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900 mb-2">
              Archive or Delete Department
            </h3>
            <p className="text-sm text-slate-600 mb-4 leading-relaxed">
              Are you sure you want to remove <strong className="text-slate-800">"{deptToDelete.name}"</strong>? If active workflow presets or tasks reference this department, it will be safely archived instead of removed.
            </p>

            {deleteError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold mb-4 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p>{deleteError}</p>
                  <button
                    onClick={() => handleConfirmDelete(true)}
                    className="mt-2 text-xs font-bold text-red-800 underline hover:text-red-950 block"
                  >
                    Click here to safely Archive this department instead
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDelete(false)}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl shadow-md transition-colors flex items-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Confirm Removal'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
