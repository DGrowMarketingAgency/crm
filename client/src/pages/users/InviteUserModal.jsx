import React, { useState, useEffect } from 'react';
import { usersService, rbacService } from '../../services/api';
import { X, Loader2, AlertCircle, Mail, Copy, Check, ExternalLink } from 'lucide-react';

export function InviteUserModal({ isOpen, onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [roleIds, setRoleIds] = useState([]);
  const [availableRoles, setAvailableRoles] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdInvite, setCreatedInvite] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadRoles();
      setName('');
      setEmail('');
      setRoleIds([]);
      setError('');
      setCreatedInvite(null);
      setCopied(false);
    }
  }, [isOpen]);

  const loadRoles = async () => {
    try {
      const res = await rbacService.getRoles();
      // Filter out Owner role (cannot invite with owner role)
      setAvailableRoles((res.data.roles || []).filter((r) => r.slug !== 'owner'));
    } catch (e) {
      console.error('Failed to load roles', e);
    }
  };

  const handleRoleToggle = (rId) => {
    setRoleIds((prev) =>
      prev.includes(rId) ? prev.filter((id) => id !== rId) : [...prev, rId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim() || !email.trim()) {
      setError('Name and email are required.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await usersService.createInvitation({
        name: name.trim(),
        email: email.trim(),
        roleIds
      });
      setCreatedInvite(res.data.invitation);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to create invitation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyLink = () => {
    if (!createdInvite?.inviteUrl) return;
    navigator.clipboard.writeText(createdInvite.inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center">
              <Mail className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Invite Team Member
            </h3>
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
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {createdInvite ? (
          /* Development Workflow: Display single-use link directly */
          <div className="mt-5 space-y-4">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
              <p className="font-semibold text-emerald-900 text-sm mb-1">
                Invitation Generated Successfully!
              </p>
              <p className="text-emerald-700 leading-relaxed">
                A single-use, cryptographically secure invitation token has been created for <strong>{createdInvite.email}</strong>.
                Since external SMTP is in development mode, share the link below directly with the user:
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Invitation Link (Valid for 7 days)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={createdInvite.inviteUrl}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 rounded-lg border border-slate-200 text-slate-700 select-all"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg border border-brand-200 transition-colors shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
            </div>

            <div className="pt-3 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-white bg-brand-700 hover:bg-brand-800 rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alex Rivera"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-700"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex@agency.com"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-700"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Assign Initial Roles
              </label>
              <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-1 border border-slate-100 rounded-lg">
                {availableRoles.map((r) => (
                  <label
                    key={r.id}
                    className="flex items-center gap-2 p-2 rounded border border-slate-100 text-xs hover:bg-slate-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={roleIds.includes(r.id)}
                      onChange={() => handleRoleToggle(r.id)}
                      className="rounded border-slate-300 text-brand-700 focus:ring-brand-500 w-3.5 h-3.5"
                    />
                    <span className="truncate">{r.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-brand-700 hover:bg-brand-800 rounded-lg transition-colors shadow-sm disabled:opacity-50"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Generate Invitation Link</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
