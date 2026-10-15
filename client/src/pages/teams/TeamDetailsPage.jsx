import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { teamsService, usersService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { TeamModal } from './TeamModal';
import {
  Users as TeamsIcon,
  Crown,
  ArrowLeft,
  UserPlus,
  Trash2,
  Edit2,
  Shield,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  Calendar,
  UserCheck,
  UserX,
  X
} from 'lucide-react';

export function TeamDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission, isOwner } = usePermission();

  const [team, setTeam] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isChangeLeaderOpen, setIsChangeLeaderOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState(null);

  // Add Member State
  const [availableUsers, setAvailableUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedTeamRole, setSelectedTeamRole] = useState('member');
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [addMemberError, setAddMemberError] = useState('');

  // Change Leader State
  const [newLeaderId, setNewLeaderId] = useState('');
  const [isChangingLeader, setIsChangingLeader] = useState(false);
  const [leaderChangeError, setLeaderChangeError] = useState('');

  // Remove Member State
  const [isRemovingMember, setIsRemovingMember] = useState(false);

  const canUpdate = isOwner || hasPermission('teams.update');
  const canManageMembers = isOwner || hasPermission('teams.manage_members');
  const canAssignLeader = isOwner || hasPermission('teams.assign_leader');

  useEffect(() => {
    fetchTeamDetails();
  }, [id]);

  const fetchTeamDetails = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await teamsService.getTeam(id);
      setTeam(res.data.team);
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.error?.message || (typeof err.response?.data?.error === 'string' ? err.response?.data?.error : (err.message || 'Failed to load team details.'));
      setError(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  const openAddMemberModal = async () => {
    setAddMemberError('');
    setSelectedUserId('');
    setSelectedTeamRole('member');
    setIsAddMemberOpen(true);
    try {
      const res = await usersService.getUsers({ status: 'active', limit: 100 });
      const currentMemberIds = new Set((team?.members || []).map((m) => m.user_id));
      // Only active users not already in team
      const notInTeam = (res.data.users || []).filter((u) => !currentMemberIds.has(u.id));
      setAvailableUsers(notInTeam);
      if (notInTeam.length > 0) {
        setSelectedUserId(String(notInTeam[0].id));
      }
    } catch (e) {
      console.error(e);
      setAddMemberError('Failed to load eligible users.');
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!selectedUserId) {
      setAddMemberError('Please select a user to add.');
      return;
    }

    setIsAddingMember(true);
    setAddMemberError('');
    try {
      await teamsService.addMember(team.id, {
        userId: Number(selectedUserId),
        teamRole: selectedTeamRole
      });
      showToast('Member added to team successfully.');
      setIsAddMemberOpen(false);
      fetchTeamDetails();
    } catch (err) {
      setAddMemberError(err.response?.data?.error || 'Failed to add member.');
    } finally {
      setIsAddingMember(false);
    }
  };

  const openChangeLeaderModal = () => {
    setLeaderChangeError('');
    setNewLeaderId(team?.leader_id ? String(team.leader_id) : '');
    setIsChangeLeaderOpen(true);
  };

  const handleChangeLeader = async (e) => {
    e.preventDefault();
    if (!newLeaderId) {
      setLeaderChangeError('Please select a new team leader.');
      return;
    }

    setIsChangingLeader(true);
    setLeaderChangeError('');
    try {
      await teamsService.assignLeader(team.id, Number(newLeaderId));
      showToast('Team leader updated successfully.');
      setIsChangeLeaderOpen(false);
      fetchTeamDetails();
    } catch (err) {
      setLeaderChangeError(err.response?.data?.error || 'Failed to assign team leader.');
    } finally {
      setIsChangingLeader(false);
    }
  };

  const handleConfirmRemoveMember = async () => {
    if (!memberToRemove) return;
    setIsRemovingMember(true);
    try {
      await teamsService.removeMember(team.id, memberToRemove.user_id);
      showToast(`Removed ${memberToRemove.name} from team.`);
      setMemberToRemove(null);
      fetchTeamDetails();
    } catch (err) {
      const errMsg = err.response?.data?.error?.message || (typeof err.response?.data?.error === 'string' ? err.response?.data?.error : (err.message || 'Failed to remove member.'));
      setError(errMsg);
      setMemberToRemove(null);
    } finally {
      setIsRemovingMember(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-16 text-center bg-white rounded-xl border border-gray-200">
        <Loader2 className="h-8 w-8 text-emerald-600 animate-spin mx-auto" />
        <p className="mt-3 text-sm text-gray-500">Loading team overview and members...</p>
      </div>
    );
  }

  if (error || !team) {
    return (
      <div className="space-y-4">
        <Link
          to="/teams"
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-emerald-600 font-medium"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Teams
        </Link>
        <div className="p-8 text-center bg-white rounded-xl border border-rose-200 text-rose-800">
          <AlertCircle className="h-10 w-10 text-rose-500 mx-auto mb-2" />
          <h2 className="text-lg font-bold">Error Loading Team</h2>
          <p className="text-sm mt-1">{error || 'Team not found or has been deleted.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/teams"
            className="p-2 text-gray-500 hover:text-brand-700 hover:bg-brand-50 rounded-lg transition"
            title="Back to Teams List"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{team.name}</h1>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                  team.status === 'active'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-gray-100 text-gray-600 border border-gray-300'
                }`}
              >
                {team.status}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-gray-400" />
              Created {new Date(team.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {canUpdate && (
            <button
              onClick={() => setIsEditModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-gray-300 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 shadow-sm"
            >
              <Edit2 className="h-4 w-4 text-gray-500" />
              Edit Team
            </button>
          )}

          {canManageMembers && (
            <button
              onClick={openAddMemberModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-700 text-white rounded-lg text-sm font-medium hover:bg-brand-800 shadow-sm"
            >
              <UserPlus className="h-4 w-4" />
              Add Member
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {notice && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-3 text-emerald-800 text-sm">
          <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
          <span className="font-medium">{notice}</span>
        </div>
      )}

      {/* Overview & Leader Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Team Overview Card */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2">
            <TeamsIcon className="h-4 w-4 text-emerald-600" />
            Team Overview
          </h2>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
            {team.description || <span className="italic text-gray-400">No team description provided.</span>}
          </p>

          <div className="mt-6 pt-5 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-gray-400 block font-medium">Total Members</span>
              <span className="text-base font-bold text-gray-900 mt-0.5 block">{team.member_count}</span>
            </div>
            <div>
              <span className="text-gray-400 block font-medium">Team Status</span>
              <span className="text-sm font-semibold text-gray-800 capitalize mt-0.5 block">{team.status}</span>
            </div>
            <div>
              <span className="text-gray-400 block font-medium">Last Modified</span>
              <span className="text-xs text-gray-600 mt-0.5 block">
                {team.updated_at ? new Date(team.updated_at).toLocaleDateString() : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Designated Leader Card */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                <Crown className="h-4 w-4 text-amber-500" />
                Designated Leader
              </h2>
              {canAssignLeader && (
                <button
                  onClick={openChangeLeaderModal}
                  className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold"
                >
                  Change Leader
                </button>
              )}
            </div>

            {team.leader_name ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 font-bold text-base shrink-0">
                    {team.leader_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="overflow-hidden">
                    <p className="font-semibold text-gray-900 truncate">{team.leader_name}</p>
                    <p className="text-xs text-gray-500 truncate">{team.leader_email}</p>
                  </div>
                </div>
                <div className="p-3 bg-amber-50/60 rounded-lg border border-amber-100 text-xs text-amber-900">
                  <span className="font-semibold">Team Responsibilities:</span> Coordinates team assignments, oversees member delivery, and directs project alignment.
                </div>
              </div>
            ) : (
              <div className="py-6 text-center">
                <Crown className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No designated team leader assigned.</p>
                {canAssignLeader && (
                  <button
                    onClick={openChangeLeaderModal}
                    className="mt-3 text-xs font-semibold text-emerald-600 hover:underline"
                  >
                    Assign a leader now
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Team Members List */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-brand-700" />
              Team Members ({team.members?.length || 0})
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Active staff members contributing to this team.
            </p>
          </div>

          {canManageMembers && (
            <button
              onClick={openAddMemberModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-700 text-white rounded-lg text-xs font-semibold hover:bg-brand-800 self-start sm:self-auto"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Add Member
            </button>
          )}
        </div>

        {team.members?.length === 0 ? (
          <div className="p-12 text-center">
            <TeamsIcon className="h-10 w-10 text-gray-300 mx-auto" />
            <h3 className="mt-3 text-sm font-semibold text-gray-900">No members in this team</h3>
            <p className="mt-1 text-xs text-gray-500">Add agency users to build the team roster.</p>
            {canManageMembers && (
              <button
                onClick={openAddMemberModal}
                className="mt-4 px-3 py-1.5 bg-brand-700 text-white rounded-lg text-xs font-medium hover:bg-brand-800"
              >
                Add First Member
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50 text-gray-500 font-semibold text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">Member</th>
                  <th className="px-6 py-3">System Role</th>
                  <th className="px-6 py-3">Team Designation</th>
                  <th className="px-6 py-3">User Status</th>
                  <th className="px-6 py-3">Joined Date</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {team.members.map((member) => {
                  const isLeader = Number(team.leader_id) === Number(member.user_id) || member.team_role === 'leader';

                  return (
                    <tr key={member.user_id} className="hover:bg-gray-50 transition">
                      {/* Name / Email */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${
                            isLeader ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                          }`}>
                            {member.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                              {member.name}
                              {isLeader && (
                                <span title="Designated Leader">
                                  <Crown className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500">{member.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Primary Role */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 capitalize">
                          {member.primary_role}
                        </span>
                      </td>

                      {/* Team Role */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isLeader ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            <Crown className="h-3 w-3 text-amber-600" />
                            Leader
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                            Member
                          </span>
                        )}
                      </td>

                      {/* Account Status */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase ${
                            member.user_status === 'active'
                              ? 'bg-emerald-100 text-emerald-800'
                              : member.user_status === 'suspended'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {member.user_status}
                        </span>
                      </td>

                      {/* Joined Date */}
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                        {new Date(member.joined_at).toLocaleDateString()}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <div className="flex items-center justify-end gap-2">
                          {canAssignLeader && !isLeader && (
                            <button
                              onClick={() => {
                                setNewLeaderId(String(member.user_id));
                                setIsChangeLeaderOpen(true);
                              }}
                              className="px-2 py-1 text-xs text-amber-700 bg-amber-50 hover:bg-amber-100 rounded border border-amber-200 font-medium transition"
                              title="Make this member the team leader"
                            >
                              Make Leader
                            </button>
                          )}

                          {canManageMembers && (
                            <button
                              onClick={() => setMemberToRemove(member)}
                              disabled={isLeader}
                              className={`p-1.5 rounded transition ${
                                isLeader
                                  ? 'text-gray-300 cursor-not-allowed'
                                  : 'text-gray-400 hover:text-rose-600 hover:bg-rose-50'
                              }`}
                              title={isLeader ? 'Cannot remove designated leader. Change leader first.' : 'Remove from team'}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Team Modal */}
      <TeamModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        team={team}
        onSuccess={(msg) => {
          showToast(msg);
          fetchTeamDetails();
        }}
      />

      {/* Add Member Modal */}
      {isAddMemberOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-emerald-600" />
                Add Team Member
              </h3>
              <button
                onClick={() => setIsAddMemberOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {addMemberError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded text-rose-700 text-xs">
                {addMemberError}
              </div>
            )}

            {availableUsers.length === 0 ? (
              <div className="py-6 text-center text-gray-500 text-sm">
                No active users available to add. All active users are already members of this team or no active users exist.
              </div>
            ) : (
              <form onSubmit={handleAddMember} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                    Select User *
                  </label>
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-700"
                  >
                    {availableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email}) - {u.role}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                    Team Designation
                  </label>
                  <select
                    value={selectedTeamRole}
                    onChange={(e) => setSelectedTeamRole(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-700"
                  >
                    <option value="member">Regular Member</option>
                    <option value="leader">Team Leader</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Selecting "Team Leader" will designate this user as the team leader.
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t">
                  <button
                    type="button"
                    onClick={() => setIsAddMemberOpen(false)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isAddingMember}
                    className="px-4 py-2 bg-brand-700 text-white rounded-lg text-sm font-medium hover:bg-brand-800 flex items-center gap-2"
                  >
                    {isAddingMember && <Loader2 className="h-4 w-4 animate-spin" />}
                    Add Member
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Change Leader Modal */}
      {isChangeLeaderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                <Crown className="h-5 w-5 text-amber-500" />
                Assign Team Leader
              </h3>
              <button
                onClick={() => setIsChangeLeaderOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {leaderChangeError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded text-rose-700 text-xs">
                {leaderChangeError}
              </div>
            )}

            <form onSubmit={handleChangeLeader} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Designate Team Leader *
                </label>
                <select
                  value={newLeaderId}
                  onChange={(e) => setNewLeaderId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-700"
                >
                  <option value="">-- Select Member --</option>
                  {team.members?.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.name} ({m.email}) {Number(team.leader_id) === Number(m.user_id) ? '— [Current Leader]' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded border border-amber-200 mt-2">
                  <strong>Note:</strong> The team leader must be a member of the team. Designating a new leader will transactionally demote the previous leader to a regular member.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsChangeLeaderOpen(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isChangingLeader || !newLeaderId}
                  className="px-4 py-2 bg-brand-700 text-white rounded-lg text-sm font-medium hover:bg-brand-800 flex items-center gap-2"
                >
                  {isChangingLeader && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirm Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remove Member Confirmation Modal */}
      {memberToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2 bg-rose-100 rounded-full">
                <Trash2 className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Remove Team Member</h3>
            </div>
            <p className="text-sm text-gray-600">
              Are you sure you want to remove <strong className="text-gray-900">{memberToRemove.name}</strong> from team <strong>{team.name}</strong>?
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setMemberToRemove(null)}
                disabled={isRemovingMember}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemoveMember}
                disabled={isRemovingMember}
                className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 flex items-center gap-2"
              >
                {isRemovingMember && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
