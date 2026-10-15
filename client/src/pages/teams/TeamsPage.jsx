import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { teamsService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { TeamModal } from './TeamModal';
import {
  Users as TeamsIcon,
  Plus,
  Search,
  Filter,
  Crown,
  Eye,
  Edit2,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle,
  Calendar,
  Layers,
  UserCheck
} from 'lucide-react';

export function TeamsPage() {
  const navigate = useNavigate();
  const { hasPermission, isOwner } = usePermission();

  const [teams, setTeams] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 12;

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Modals
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);

  // Delete confirmation
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [teamToDelete, setTeamToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const canCreate = isOwner || hasPermission('teams.create');
  const canUpdate = isOwner || hasPermission('teams.update');
  const canDelete = isOwner || hasPermission('teams.delete');
  const canView = isOwner || hasPermission('teams.view');

  useEffect(() => {
    fetchTeams();
  }, [page, searchTerm, selectedStatus]);

  const fetchTeams = async () => {
    setIsLoading(true);
    setError('');
    try {
      const offset = (page - 1) * limit;
      const res = await teamsService.getTeams({
        search: searchTerm,
        status: selectedStatus,
        limit,
        offset
      });

      setTeams(res.data.teams || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.error?.message || (typeof err.response?.data?.error === 'string' ? err.response?.data?.error : (err.message || 'Failed to load teams list.'));
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
    setEditingTeam(null);
    setTeamModalOpen(true);
  };

  const handleOpenEdit = (team, e) => {
    e.stopPropagation();
    setEditingTeam(team);
    setTeamModalOpen(true);
  };

  const handleOpenDelete = (team, e) => {
    e.stopPropagation();
    setTeamToDelete(team);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!teamToDelete) return;
    setIsDeleting(true);
    try {
      await teamsService.deleteTeam(teamToDelete.id);
      showToast(`Team "${teamToDelete.name}" removed successfully.`);
      setDeleteModalOpen(false);
      setTeamToDelete(null);
      fetchTeams();
    } catch (err) {
      const errMsg = err.response?.data?.error?.message || (typeof err.response?.data?.error === 'string' ? err.response?.data?.error : (err.message || 'Failed to delete team.'));
      setError(errMsg);
      setDeleteModalOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <TeamsIcon className="h-7 w-7 text-brand-700" />
            Team Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Organize agency members into cross-functional teams, designate team leaders, and manage memberships.
          </p>
        </div>

        {canCreate && (
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-700 text-white rounded-lg font-medium hover:bg-brand-800 transition shadow-sm self-start sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            Create Team
          </button>
        )}
      </div>

      {/* Notifications */}
      {notice && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-3 text-emerald-800 text-sm animate-fade-in">
          <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
          <span className="font-medium">{notice}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-3 text-rose-800 text-sm">
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search teams by name or description..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-700"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <Filter className="h-4 w-4 text-gray-400 shrink-0" />
          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setPage(1);
            }}
            className="w-full md:w-44 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-700"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Teams Grid / Table */}
      {isLoading ? (
        <div className="p-12 text-center bg-white rounded-xl border border-gray-200">
          <Loader2 className="h-8 w-8 text-brand-600 animate-spin mx-auto" />
          <p className="mt-3 text-sm text-gray-500">Loading agency teams...</p>
        </div>
      ) : teams.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-gray-200">
          <TeamsIcon className="h-12 w-12 text-gray-300 mx-auto" />
          <h3 className="mt-4 text-base font-semibold text-gray-900">No teams found</h3>
          <p className="mt-1 text-sm text-gray-500 max-w-sm mx-auto">
            {searchTerm || selectedStatus
              ? 'No teams match your selected search or filter criteria.'
              : 'Get started by creating your first team to organize staff members.'}
          </p>
          {canCreate && !searchTerm && !selectedStatus && (
            <button
              onClick={handleOpenCreate}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-brand-700 text-white rounded-lg text-sm font-medium hover:bg-brand-800"
            >
              <Plus className="h-4 w-4" />
              Create Team
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {teams.map((team) => (
            <div
              key={team.id}
              onClick={() => navigate(`/teams/${team.id}`)}
              className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-brand-300 transition cursor-pointer flex flex-col justify-between p-5 group"
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 text-lg group-hover:text-brand-700 transition">
                      {team.name}
                    </h3>
                    <p className="text-xs text-gray-500 line-clamp-2 mt-1 min-h-[32px]">
                      {team.description || <span className="italic text-gray-400">No description provided</span>}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium uppercase tracking-wider shrink-0 ${
                      team.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-gray-100 text-gray-600 border border-gray-300'
                    }`}
                  >
                    {team.status}
                  </span>
                </div>

                {/* Leader Info */}
                <div className="bg-gray-50 rounded-lg p-3 my-3 border border-gray-100">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <Crown className="h-3.5 w-3.5 text-amber-500" />
                    Team Leader
                  </span>
                  {team.leader_name ? (
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-900 truncate">{team.leader_name}</span>
                      <span className="text-xs text-gray-500 truncate max-w-[140px]">{team.leader_email}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400 italic">No designated team leader</span>
                  )}
                </div>
              </div>

              {/* Card Footer */}
              <div className="pt-4 border-t border-gray-100 mt-2 flex items-center justify-between text-xs text-gray-500">
                <div className="flex items-center gap-1.5 font-medium text-gray-700">
                  <UserCheck className="h-4 w-4 text-brand-600" />
                  <span>{team.member_count} {team.member_count === 1 ? 'member' : 'members'}</span>
                </div>

                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => navigate(`/teams/${team.id}`)}
                    title="View Team Details"
                    className="p-1.5 text-gray-400 hover:text-brand-700 hover:bg-brand-50 rounded-md transition"
                  >
                    <Eye className="h-4 w-4" />
                  </button>

                  {canUpdate && (
                    <button
                      onClick={(e) => handleOpenEdit(team, e)}
                      title="Edit Team"
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                  )}

                  {canDelete && (
                    <button
                      onClick={(e) => handleOpenDelete(team, e)}
                      title="Delete Team"
                      className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && teams.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between bg-white px-4 py-3 rounded-xl border border-gray-200">
          <p className="text-xs text-gray-500">
            Showing <span className="font-medium">{(page - 1) * limit + 1}</span> to{' '}
            <span className="font-medium">{Math.min(page * limit, total)}</span> of{' '}
            <span className="font-medium">{total}</span> teams
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page === 1}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="px-3 py-1.5 text-xs text-gray-600 font-medium">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              disabled={page === totalPages}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Team Modal (Create/Edit) */}
      <TeamModal
        isOpen={teamModalOpen}
        onClose={() => setTeamModalOpen(false)}
        team={editingTeam}
        onSuccess={(msg) => {
          showToast(msg);
          fetchTeams();
        }}
      />

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && teamToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2 bg-rose-100 rounded-full">
                <Trash2 className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Delete Team</h3>
            </div>
            <p className="text-sm text-gray-600">
              Are you sure you want to delete team <strong className="text-gray-900">{teamToDelete.name}</strong>?
              This will remove team memberships. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                disabled={isDeleting}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 flex items-center gap-2"
              >
                {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
