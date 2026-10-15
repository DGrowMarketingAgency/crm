import React, { useState, useEffect } from 'react';
import {
  X,
  Key,
  Globe,
  User,
  Lock,
  Mail,
  Phone,
  Hash,
  FileText,
  Building,
  RefreshCw,
  Eye,
  EyeOff,
  ShieldAlert,
  CheckCircle2
} from 'lucide-react';
import { credentialsService, clientService } from '../../services/api';

const CATEGORIES = [
  'Social Media',
  'Website Administration',
  'Hosting and Domain',
  'Email Services',
  'SEO Tools',
  'Advertising Accounts',
  'Analytics',
  'Business Listings',
  'Other'
];

export function AddCredentialModal({ isOpen, onClose, onCreated, isClientUser, currentClientId, initialData = null }) {
  const isEditing = Boolean(initialData);

  const [formData, setFormData] = useState({
    client_id: '',
    platform_name: '',
    category: 'Other',
    login_url: '',
    username: '',
    password: '',
    recovery_email: '',
    recovery_phone: '',
    account_id: '',
    notes: '',
    internal_notes: ''
  });

  const [clients, setClients] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, label: 'None' });

  useEffect(() => {
    if (isOpen) {
      setError('');
      if (initialData) {
        setFormData({
          client_id: initialData.client_id || '',
          platform_name: initialData.platform_name || '',
          category: initialData.category || 'Other',
          login_url: initialData.login_url || '',
          username: initialData.username || '',
          password: '', // Blank initially for replacement
          recovery_email: initialData.recovery_email || '',
          recovery_phone: initialData.recovery_phone || '',
          account_id: initialData.account_id || '',
          notes: initialData.notes || '',
          internal_notes: initialData.internal_notes || ''
        });
      } else {
        setFormData({
          client_id: currentClientId || '',
          platform_name: '',
          category: 'Other',
          login_url: '',
          username: '',
          password: '',
          recovery_email: '',
          recovery_phone: '',
          account_id: '',
          notes: '',
          internal_notes: ''
        });
      }

      // Load clients for admin dropdown
      if (!isClientUser) {
        clientService
          .getClients({ limit: 100 })
          .then((res) => {
            if (res.data?.success) {
              setClients(res.data.clients || []);
            }
          })
          .catch(() => {});
      }
    }
  }, [isOpen, initialData, isClientUser, currentClientId]);

  // Compute password strength
  useEffect(() => {
    const pwd = formData.password;
    if (!pwd) {
      setPasswordStrength({ score: 0, label: 'None' });
      return;
    }
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 14) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;

    let label = 'Weak';
    if (score >= 4) label = 'Very Strong';
    else if (score >= 3) label = 'Strong';
    else if (score >= 2) label = 'Medium';

    setPasswordStrength({ score, label });
  }, [formData.password]);

  // Secure Password Generator
  const generatePassword = () => {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+';
    let newPassword = '';
    const array = new Uint32Array(18);
    window.crypto.getRandomValues(array);
    for (let i = 0; i < 18; i++) {
      newPassword += charset[array[i] % charset.length];
    }
    setFormData((prev) => ({ ...prev, password: newPassword }));
    setShowPassword(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!isEditing && !formData.password) {
      setError('Password is required.');
      return;
    }

    setLoading(true);
    try {
      if (isEditing) {
        const payload = { ...formData };
        if (!payload.password) delete payload.password; // Don't replace if unchanged
        await credentialsService.updateCredential(initialData.id, payload);
      } else {
        await credentialsService.createCredential(formData);
      }
      onCreated();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to save credential.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200/80 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shadow-sm">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">
                {isEditing ? 'Update Platform Credential' : 'Add New Platform Credential'}
              </h3>
              <p className="text-xs text-slate-500">
                Encrypted at rest using AES-256-GCM. Admin-only access by default.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Client Selection (Admin only) */}
          {!isClientUser && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Related Client <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Building className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <select
                  required
                  value={formData.client_id}
                  onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                  disabled={isEditing}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                >
                  <option value="">Select Client Organization</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.company_name ? `(${c.company_name})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Platform Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Platform / Service Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Google Ads, Shopify, Facebook"
                value={formData.platform_name}
                onChange={(e) => setFormData({ ...formData, platform_name: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
              />
            </div>

            {/* Platform Category */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Platform Category <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Login URL */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Login URL
            </label>
            <div className="relative">
              <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="url"
                placeholder="https://business.facebook.com or https://admin.shopify.com"
                value={formData.login_url}
                onChange={(e) => setFormData({ ...formData, login_url: e.target.value })}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Username / Login Email */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Username or Login Email <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  placeholder="admin@brand.com"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                />
              </div>
            </div>

            {/* Account / Workspace ID */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Account ID / Workspace ID <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <div className="relative">
                <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="e.g. act_192837482"
                  value={formData.account_id}
                  onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                />
              </div>
            </div>
          </div>

          {/* Password Field with Generator */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">
                {isEditing ? 'Replace Password' : 'Password'}{' '}
                {!isEditing && <span className="text-rose-500">*</span>}
                {isEditing && <span className="text-slate-400 font-normal">(leave blank to keep unchanged)</span>}
              </label>
              <button
                type="button"
                onClick={generatePassword}
                className="text-[11px] font-medium text-emerald-700 hover:text-emerald-800 flex items-center gap-1 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Generate Secure Password
              </button>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type={showPassword ? 'text' : 'password'}
                required={!isEditing}
                placeholder={isEditing ? 'Enter new password to replace' : 'Enter login password'}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full pl-9 pr-10 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Password strength indicator */}
            {formData.password && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden flex gap-1">
                  <div
                    className={`h-full transition-all ${
                      passwordStrength.score >= 1 ? (passwordStrength.score >= 3 ? 'bg-emerald-500' : 'bg-amber-400') : 'bg-rose-400'
                    }`}
                    style={{ width: `${Math.min(100, passwordStrength.score * 25)}%` }}
                  />
                </div>
                <span className="text-[10px] font-semibold text-slate-500">{passwordStrength.label}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Recovery Email */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Recovery Email <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  placeholder="recovery@brand.com"
                  value={formData.recovery_email}
                  onChange={(e) => setFormData({ ...formData, recovery_email: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                />
              </div>
            </div>

            {/* Recovery Phone */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Recovery Phone <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="+1 (555) 000-0000"
                  value={formData.recovery_phone}
                  onChange={(e) => setFormData({ ...formData, recovery_phone: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Instructions or Notes for Team
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Please do not touch billing settings; 2FA prompt goes to client WhatsApp."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
            />
          </div>

          {/* Admin Internal Notes */}
          {!isClientUser && (
            <div>
              <label className="block text-xs font-semibold text-amber-800 mb-1 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                Admin Internal Notes <span className="text-slate-400 font-normal">(Never exposed to clients)</span>
              </label>
              <textarea
                rows={2}
                placeholder="Internal verification notes, security clearance requirements, or account ownership context."
                value={formData.internal_notes}
                onChange={(e) => setFormData({ ...formData, internal_notes: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-amber-200 bg-amber-50/40 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
              />
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-200/80 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-md shadow-emerald-700/20 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Encrypting & Storing...
                </>
              ) : isEditing ? (
                'Save Changes'
              ) : (
                'Encrypt & Save Credential'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
