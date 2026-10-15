import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { departmentsService, usersService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { DepartmentModal } from './DepartmentModal';
import {
  Building2,
  Users,
  Layers,
  ArrowLeft,
  Plus,
  Shield,
  Edit2,
  Trash2,
  Mail,
  Calendar,
  CheckCircle,
  AlertCircle,
  Loader2,
  UserPlus,
  Star,
  Clock,
  Sparkles
} from 'lucide-react';

export function DepartmentDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission, isOwner, user: currentUser } = usePermission();

  const [department, setDepartment] = useState(null);
  const [members, setMembers] = useState([]);
  const [presets, setPresets] = useState([]);
  const [activeTab, setActiveTab] = useState('members'); // 'members' | 'presets'

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Modals
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [addMemberModalOpen, setAddMemberModalOpen] = useState(false);
  const [allUsers, setAllUsers] = useState([]);

  // Add Member State
  const [selectedUserId, setSelectedUserId] = useState('');
  const [roleInDept, setRoleInDept] = useState('member');
  const [isPrimaryMember, setIsPrimaryMember] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [addMemberError, setAddMemberError] = useState('');

  // Access checks
  const isDeptManager = department && currentUser && Number(department.manager_id) === Number(currentUser.id);
  const canManage = isOwner || hasPermission('departments.update') || isDeptManager;

  useEffect(() => {
    fetchDepartmentDetails();
  }, [id]);

  const fetchDepartmentDetails = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [deptRes, membersRes, presetsRes] = await Promise.all([
        departmentsService.getDepartment(id),
        departmentsService.getMembers(id),
        departmentsService.getPresets(id)
      ]);

      setDepartment(deptRes.data);
      setMembers(membersRes.data || []);
      setPresets(presetsRes.data || []);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error?.message || 'Failed to load department details.');
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  const openAddMember = async () => {
    setSelectedUserId('');
    setRoleInDept('member');
    setIsPrimaryMember(false);
    setAddMemberError('');
    setAddMemberModalOpen(true);

    try {
      const res = await usersService.getUsers({ status: 'active', limit: 100 });
      setAllUsers(res.data.users || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddMemberSubmit = async (e) => {
    e.preventDefault();
    if (!selectedUserId) {
      setAddMemberError('Please select an employee.');
      return;
    }

    setIsAddingMember(true);
    setAddMemberError('');

    try {
      await departmentsService.addMember(id, {
        userId: Number(selectedUserId),
        roleInDepartment: roleInDept.trim() || 'member',
        isPrimary: isPrimaryMember
      });

      showToast('Employee assigned to department successfully.');
      setAddMemberModalOpen(false);
      fetchDepartmentDetails();
    } catch (err) {
      console.error(err);
      setAddMemberError(err.response?.data?.error?.message || 'Failed to add member.');
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleRemoveMember = async (userId, memberName) => {
    if (!window.confirm(`Remove ${memberName} from this department?`)) return;

    try {
      await departmentsService.removeMember(id, userId);
      showToast(`${memberName} removed from department.`);
      fetchDepartmentDetails();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error?.message || 'Failed to remove member.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-red-500" />
        <span className="text-sm font-semibold text-slate-600">Loading department details...</span>
      </div>
    );
  }

  if (error || !department) {
    return (
      <div className="p-8 max-w-xl mx-auto bg-white rounded-2xl border border-red-200 text-center shadow-sm">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-800 mb-2">Error Loading Department</h3>
        <p className="text-sm text-slate-500 mb-6">{error || 'Department not found.'}</p>
        <button
          onClick={() => navigate('/departments')}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl"
        >
          Back to Departments
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Toast Notice */}
      {notice && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-emerald-800 shadow-sm animate-in fade-in duration-200">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="text-sm font-semibold">{notice}</span>
        </div>
      )}

      {/* Back Button */}
      <div>
        <button
          onClick={() => navigate('/departments')}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to All Departments
        </button>
      </div>

      {/* Department Hero Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-100">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-600 to-rose-800 text-white flex items-center justify-center font-extrabold text-xl shadow-lg shadow-red-600/30 shrink-0">
              {department.code?.slice(0, 3) || 'DEP'}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                  {department.name}
                </h1>
                <span className="text-xs font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 bg-slate-100 text-slate-700 rounded-lg border border-slate-200">
                  {department.code}
                </span>
                <span
                  className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${
                    department.status === 'active'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
                >
                  {department.status}
                </span>
              </div>
              <p className="text-sm text-slate-500 max-w-2xl leading-relaxed">
                {department.description || 'No detailed mission description added yet.'}
              </p>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-3 shrink-0">
            {canManage && (
              <button
                onClick={() => setEditModalOpen(true)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition-colors flex items-center gap-2"
              >
                <Edit2 className="w-4 h-4" />
                Edit Settings
              </button>
            )}
            <button
              onClick={() => navigate(`/workflows/builder?departmentId=${department.id}`)}
              className="px-4 py-2.5 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-red-600/30 hover:shadow-red-600/40 transition-all flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Build Preset
            </button>
          </div>
        </div>

        {/* Quick Info Bar */}
        <div className="px-6 md:px-8 py-4 bg-slate-50/70 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="flex items-center gap-2.5">
            <Shield className="w-4 h-4 text-red-500" />
            <div>
              <span className="text-slate-400 font-medium block">Department Manager</span>
              <span className="font-bold text-slate-800">
                {department.manager_name ? `${department.manager_name} (${department.manager_email})` : 'Unassigned'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Users className="w-4 h-4 text-sky-500" />
            <div>
              <span className="text-slate-400 font-medium block">Team Size</span>
              <span className="font-bold text-slate-800">
                {members.length} Assigned {members.length === 1 ? 'Employee' : 'Employees'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Layers className="w-4 h-4 text-rose-500" />
            <div>
              <span className="text-slate-400 font-medium block">Active Workflows</span>
              <span className="font-bold text-slate-800">
                {presets.length} Operational Presets
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('members')}
          className={`pb-3 px-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'members'
              ? 'border-red-600 text-red-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          Department Members ({members.length})
        </button>
        <button
          onClick={() => setActiveTab('presets')}
          className={`pb-3 px-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'presets'
              ? 'border-red-600 text-red-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          Workflow Presets ({presets.length})
        </button>
      </div>

      {/* Tab 1: Members */}
      {activeTab === 'members' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Enrolled Staff & Roles</h3>
              <p className="text-xs text-slate-500">Employees attached to this department</p>
            </div>
            {canManage && (
              <button
                onClick={openAddMember}
                className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5"
              >
                <UserPlus className="w-4 h-4" />
                Assign Employee
              </button>
            )}
          </div>

          {members.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-semibold text-slate-600 mb-1">No members assigned yet</p>
              <p className="text-xs text-slate-400 mb-4">Assign existing employees to this department.</p>
              {canManage && (
                <button
                  onClick={openAddMember}
                  className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-xl"
                >
                  Assign First Employee
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {members.map((member) => {
                const designationsList = Array.isArray(member.designations)
                  ? member.designations
                  : typeof member.designations === 'string'
                  ? JSON.parse(member.designations || '[]')
                  : [];

                return (
                  <div
                    key={member.user_id}
                    className="p-4 sm:px-6 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-extrabold text-sm shrink-0">
                        {member.name?.slice(0, 2).toUpperCase() || 'U'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 truncate">
                            {member.name}
                          </span>
                          {member.is_primary ? (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md flex items-center gap-1">
                              <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                              Primary Branch
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                          <span className="truncate flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {member.email}
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="font-semibold text-slate-600 truncate">
                            {member.role_in_department}
                          </span>
                        </div>
                        {designationsList.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {designationsList.map((d, i) => (
                              <span
                                key={i}
                                className="text-[10px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded"
                              >
                                {d}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    {canManage && (
                      <button
                        onClick={() => handleRemoveMember(member.user_id, member.name)}
                        className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-xl transition-colors"
                        title="Remove Member from Department"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Workflow Presets */}
      {activeTab === 'presets' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Configured Workflow Presets</h3>
              <p className="text-xs text-slate-500">Reusable pipelines associated with {department.name}</p>
            </div>
            <button
              onClick={() => navigate(`/workflows/builder?departmentId=${department.id}`)}
              className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              New Preset
            </button>
          </div>

          {presets.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <Layers className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-semibold text-slate-600 mb-1">No workflow presets defined</p>
              <p className="text-xs text-slate-400 mb-4">Create department-specific stages and task templates.</p>
              <button
                onClick={() => navigate(`/workflows/builder?departmentId=${department.id}`)}
                className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-xl"
              >
                Create Preset
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {presets.map((preset) => (
                <div
                  key={preset.id}
                  onClick={() => navigate(`/workflows/${preset.id}`)}
                  className="p-5 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors cursor-pointer group"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-bold text-slate-900 group-hover:text-red-600 transition-colors">
                        {preset.name}
                      </span>
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                        {preset.preset_code}
                      </span>
                      <span
                        className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                          preset.status === 'published'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {preset.status} (v{preset.version_number || 1})
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">{preset.description}</p>
                    <div className="flex items-center gap-4 text-xs font-semibold text-slate-400 pt-1">
                      <span>{preset.service_category}</span>
                      <span>•</span>
                      <span>{preset.stage_count} Stages</span>
                      <span>•</span>
                      <span>{preset.task_count} Tasks</span>
                      {preset.estimated_duration_days ? (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {preset.estimated_duration_days} business days
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <button className="px-3.5 py-1.5 bg-slate-100 group-hover:bg-red-600 group-hover:text-white text-slate-700 text-xs font-bold rounded-xl transition-all">
                    Open Builder
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit Department Modal */}
      <DepartmentModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        department={department}
        onSuccess={(msg) => {
          showToast(msg);
          fetchDepartmentDetails();
        }}
      />

      {/* Assign Member Modal */}
      {addMemberModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Assign Employee</h3>
            <p className="text-xs text-slate-500 mb-4">
              Add an existing team member to <strong>{department.name}</strong>
            </p>

            {addMemberError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold mb-4">
                {addMemberError}
              </div>
            )}

            <form onSubmit={handleAddMemberSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Employee <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  required
                >
                  <option value="">Select Employee...</option>
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Department Role / Title
                </label>
                <input
                  type="text"
                  value={roleInDept}
                  onChange={(e) => setRoleInDept(e.target.value)}
                  placeholder="e.g., Senior SEO Specialist, Lead Designer"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="primaryCheck"
                  checked={isPrimaryMember}
                  onChange={(e) => setIsPrimaryMember(e.target.checked)}
                  className="w-4 h-4 rounded text-red-600 focus:ring-red-500"
                />
                <label htmlFor="primaryCheck" className="text-xs font-semibold text-slate-700">
                  Mark as primary department for this user
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAddMemberModalOpen(false)}
                  disabled={isAddingMember}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingMember}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl shadow-md transition-colors flex items-center gap-2"
                >
                  {isAddingMember ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Assigning...
                    </>
                  ) : (
                    'Confirm Assignment'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
