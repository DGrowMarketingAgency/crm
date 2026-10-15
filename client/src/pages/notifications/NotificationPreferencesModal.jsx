import React, { useState, useEffect } from 'react';
import { notificationsService } from '../../services/api';
import {
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Bell,
  Mail,
  CheckCheck,
  Clock,
  UserCheck
} from 'lucide-react';

export function NotificationPreferencesModal({ isOpen, onClose }) {
  const [preferences, setPreferences] = useState({
    emailEnabled: true,
    taskAssigned: true,
    approvalRequested: true,
    approvalDecision: true,
    deadlineReminders: true,
    overdueReminders: true
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadPreferences();
    }
  }, [isOpen]);

  const loadPreferences = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await notificationsService.getPreferences();
      if (res.data.preferences) {
        setPreferences(res.data.preferences);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load notification preferences');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = (key) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');
    setNotice('');
    try {
      await notificationsService.updatePreferences(preferences);
      setNotice('Notification preferences saved successfully');
      setTimeout(() => {
        setNotice('');
        onClose();
      }, 1200);
    } catch (err) {
      console.error(err);
      setError('Failed to update notification preferences');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-100">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Notification Preferences</h3>
              <p className="text-xs text-slate-500">Configure eligible channels and alert categories</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSave} className="p-6 space-y-5">
          {notice && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isLoading ? (
            <div className="py-8 text-center text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-brand-600" />
              <p className="text-xs">Loading preferences...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Email Delivery Master Switch */}
              <div className="p-3.5 rounded-xl bg-brand-50/50 border border-brand-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-brand-100 text-brand-800 flex items-center justify-center">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      Email Delivery
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Receive notifications via your registered email address
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.emailEnabled}
                  onChange={() => handleToggle('emailEnabled')}
                  className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300 cursor-pointer"
                />
              </div>

              {/* Category Switches */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                  Notification Categories
                </span>

                {[
                  {
                    key: 'taskAssigned',
                    label: 'Task Assignments',
                    desc: 'When tasks are assigned to you in a project',
                    icon: UserCheck
                  },
                  {
                    key: 'approvalRequested',
                    label: 'Review & Approval Requests',
                    desc: 'When a team member submits deliverables for your review',
                    icon: CheckCheck
                  },
                  {
                    key: 'approvalDecision',
                    label: 'Approval Decisions & Revisions',
                    desc: 'When your submission is approved or revisions are requested',
                    icon: CheckCircle2
                  },
                  {
                    key: 'deadlineReminders',
                    label: 'Upcoming Deadline Reminders',
                    desc: 'Automated reminders 24 hours before scheduled task deadlines',
                    icon: Clock
                  },
                  {
                    key: 'overdueReminders',
                    label: 'Overdue Task Alerts',
                    desc: 'Daily notices when assigned tasks have passed their due date',
                    icon: AlertCircle
                  }
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <label
                      key={item.key}
                      className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 cursor-pointer transition border border-transparent hover:border-slate-200"
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-slate-800">{item.label}</p>
                          <p className="text-[11px] text-slate-400">{item.desc}</p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(preferences[item.key])}
                        onChange={() => handleToggle(item.key)}
                        className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300 cursor-pointer"
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || isLoading}
              className="px-5 py-2 text-xs font-bold text-white bg-brand-700 hover:bg-brand-800 rounded-xl shadow-xs transition disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
