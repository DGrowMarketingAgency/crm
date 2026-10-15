import React, { useState, useEffect } from 'react';
import { usersService } from '../../services/api';
import {
  X,
  Loader2,
  Mail,
  RefreshCw,
  Ban,
  Check,
  Clock,
  Copy,
  AlertCircle
} from 'lucide-react';

export function InvitationsModal({ isOpen, onClose }) {
  const [invitations, setInvitations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadInvitations();
    }
  }, [isOpen]);

  const loadInvitations = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await usersService.getInvitations();
      setInvitations(res.data.invitations || []);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to fetch invitations.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async (id) => {
    try {
      const res = await usersService.resendInvitation(id);
      navigator.clipboard.writeText(res.data.invitation.inviteUrl);
      setActionNotice(`Invitation resent! New link copied to clipboard.`);
      loadInvitations();
      setTimeout(() => setActionNotice(''), 4000);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to resend invitation.');
    }
  };

  const handleRevoke = async (id) => {
    if (!window.confirm('Are you sure you want to revoke this invitation?')) return;
    try {
      await usersService.revokeInvitation(id);
      setActionNotice('Invitation has been revoked.');
      loadInvitations();
      setTimeout(() => setActionNotice(''), 4000);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to revoke invitation.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Pending & Past Invitations
              </h3>
              <p className="text-xs text-slate-500">Track, resend, or revoke single-use invitation links.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {actionNotice && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
            {actionNotice}
          </div>
        )}

        {error && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="p-6 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-brand-700" />
            </div>
          ) : invitations.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No invitations have been generated yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {invitations.map((inv) => (
                <div key={inv.id} className="py-3.5 flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 text-sm">
                        {inv.user_name}
                      </span>
                      <span className="text-xs text-slate-400">({inv.user_email})</span>
                      <span
                        className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                          inv.status === 'pending'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : inv.status === 'accepted'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : inv.status === 'revoked'
                            ? 'bg-red-50 text-red-800 border border-red-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {inv.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Invited by {inv.inviter_name || 'System'} on{' '}
                      {new Date(inv.created_at).toLocaleDateString()} • Expires:{' '}
                      {new Date(inv.expires_at).toLocaleDateString()}
                    </div>
                  </div>

                  {inv.status === 'pending' && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleResend(inv.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg transition-colors"
                        title="Resend invitation & copy fresh link"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Resend</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRevoke(inv.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Revoke invitation"
                      >
                        <Ban className="w-3 h-3" />
                        <span>Revoke</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 flex justify-end shrink-0">
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
