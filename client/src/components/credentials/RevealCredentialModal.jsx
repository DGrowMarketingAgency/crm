import React, { useState, useEffect } from 'react';
import {
  X,
  Eye,
  EyeOff,
  Copy,
  Check,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Lock,
  ExternalLink,
  Mail,
  Phone,
  Hash
} from 'lucide-react';

export function RevealCredentialModal({ isOpen, onClose, revealedData, platformName, category, loginUrl }) {
  const [secondsRemaining, setSecondsRemaining] = useState(60);
  const [copiedField, setCopiedField] = useState(null);
  const [showPassword, setShowPassword] = useState(true);

  useEffect(() => {
    if (!isOpen || !revealedData) return;

    setSecondsRemaining(60);
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onClose(); // Automatically close and mask when timeout expires
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, revealedData, onClose]);

  // Clean clipboard state
  const handleCopy = (text, fieldName) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => {
      setCopiedField(null);
    }, 2000);
  };

  if (!isOpen || !revealedData) return null;

  const percentLeft = Math.round((secondsRemaining / 60) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col">
        {/* Animated Countdown Progress Bar */}
        <div className="w-full h-1.5 bg-slate-100 overflow-hidden">
          <div
            className={`h-full transition-all duration-1000 ${
              secondsRemaining <= 10 ? 'bg-rose-500' : secondsRemaining <= 25 ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
            style={{ width: `${percentLeft}%` }}
          />
        </div>

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200/80 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shadow-sm">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                Decrypted Credentials
                <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                  {platformName}
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-600" />
                Auto-hides in <strong className="text-amber-700">{secondsRemaining}s</strong> for security
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

        {/* Credentials Card */}
        <div className="p-6 space-y-4">
          {/* Login URL if available */}
          {loginUrl && (
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-500 truncate mr-2">{loginUrl}</span>
              <a
                href={loginUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1 shrink-0"
              >
                Open URL
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {/* Username */}
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Username / Login Email
            </span>
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-xs font-mono font-semibold text-slate-800 flex-1 select-all break-all">
                {revealedData.username || '—'}
              </span>
              <button
                onClick={() => handleCopy(revealedData.username, 'username')}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors flex items-center gap-1 text-[11px]"
                title="Copy username"
              >
                {copiedField === 'username' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-600 font-semibold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Decrypted Password
            </span>
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-50/50 border border-emerald-200">
              <span className="text-xs font-mono font-bold text-slate-900 flex-1 select-all break-all tracking-wider">
                {showPassword ? revealedData.password : '••••••••••••••••'}
              </span>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-emerald-100/60 rounded-lg transition-colors"
                title={showPassword ? 'Mask' : 'Unmask'}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => handleCopy(revealedData.password, 'password')}
                className="p-1.5 text-slate-700 hover:text-slate-900 hover:bg-emerald-100/80 rounded-lg transition-colors flex items-center gap-1 text-[11px]"
                title="Copy password"
              >
                {copiedField === 'password' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-600 font-semibold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span className="font-semibold">Copy Password</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Recovery Information if present */}
          {(revealedData.recovery_email || revealedData.recovery_phone || revealedData.account_id) && (
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Recovery & Workspace Data
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {revealedData.recovery_email && (
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/70 flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1 text-[11px]">
                      <Mail className="w-3 h-3 text-slate-400" />
                      {revealedData.recovery_email}
                    </span>
                    <button
                      onClick={() => handleCopy(revealedData.recovery_email, 'rec_email')}
                      className="text-slate-400 hover:text-slate-600 p-1"
                    >
                      {copiedField === 'rec_email' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                )}
                {revealedData.recovery_phone && (
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/70 flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1 text-[11px]">
                      <Phone className="w-3 h-3 text-slate-400" />
                      {revealedData.recovery_phone}
                    </span>
                    <button
                      onClick={() => handleCopy(revealedData.recovery_phone, 'rec_phone')}
                      className="text-slate-400 hover:text-slate-600 p-1"
                    >
                      {copiedField === 'rec_phone' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                )}
                {revealedData.account_id && (
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/70 flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1 text-[11px]">
                      <Hash className="w-3 h-3 text-slate-400" />
                      {revealedData.account_id}
                    </span>
                    <button
                      onClick={() => handleCopy(revealedData.account_id, 'acc_id')}
                      className="text-slate-400 hover:text-slate-600 p-1"
                    >
                      {copiedField === 'acc_id' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Security Notice */}
          <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/80 text-[11px] text-amber-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              This access has been logged in the security audit trail. Credentials are never cached in browser storage.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200/80 bg-slate-50/50 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Will automatically mask in {secondsRemaining}s
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-xl transition-colors shadow-sm"
          >
            Hide & Mask Now
          </button>
        </div>
      </div>
    </div>
  );
}
