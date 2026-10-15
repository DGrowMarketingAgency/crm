import React, { useState, useEffect } from 'react';
import { usersService } from '../../services/api';
import { X, Loader2, User, Shield, Users as TeamsIcon, Calendar, CheckCircle } from 'lucide-react';

export function UserDetailsModal({ isOpen, onClose, userId }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && userId) {
      loadUser();
    }
  }, [isOpen, userId]);

  const loadUser = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await usersService.getUser(userId);
      setUser(res.data.user);
    } catch (err) {
      setError('Failed to load user details.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !userId) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-900">User Profile</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-brand-700" />
          </div>
        ) : error ? (
          <div className="py-6 text-center text-xs text-red-600">{error}</div>
        ) : user ? (
          <div className="mt-4 space-y-4 text-xs">
            {/* Header info */}
            <div className="p-4 bg-slate-50 rounded-xl flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-900 text-sm">{user.name}</h4>
                <p className="text-slate-500 font-mono text-[11px]">{user.email}</p>
              </div>
              <span
                className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                  user.status === 'active'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : user.status === 'suspended'
                    ? 'bg-red-50 text-red-800 border border-red-200'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {user.status}
              </span>
            </div>

            {/* Assigned Roles */}
            <div>
              <span className="font-semibold text-slate-700 block mb-1.5">Assigned Roles</span>
              <div className="flex flex-wrap gap-1.5">
                {user.roles && user.roles.length > 0 ? (
                  user.roles.map((r) => (
                    <span
                      key={r.id}
                      className="px-2 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-200 text-[11px] font-medium"
                    >
                      {r.name}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-400">No custom roles assigned</span>
                )}
              </div>
            </div>

            {/* Team Memberships */}
            <div>
              <span className="font-semibold text-slate-700 block mb-1.5">Team Memberships</span>
              <div className="space-y-1.5">
                {user.teams && user.teams.length > 0 ? (
                  user.teams.map((t) => (
                    <div
                      key={t.id}
                      className="p-2 rounded-lg border border-slate-100 flex items-center justify-between"
                    >
                      <span className="font-medium text-slate-800">{t.name}</span>
                      <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        {t.team_role}
                      </span>
                    </div>
                  ))
                ) : (
                  <span className="text-slate-400">Not assigned to any teams</span>
                )}
              </div>
            </div>

            {/* Timestamps */}
            <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-slate-500 text-[11px]">
              <div>
                Joined: <strong className="text-slate-700">{new Date(user.created_at).toLocaleDateString()}</strong>
              </div>
              <div>
                Last Login:{' '}
                <strong className="text-slate-700">
                  {user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : 'Never'}
                </strong>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-6 pt-3 flex justify-end border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
