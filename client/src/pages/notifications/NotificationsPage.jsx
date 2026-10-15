import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationsService } from '../../services/api';
import { NotificationPreferencesModal } from './NotificationPreferencesModal';
import {
  Bell,
  CheckCircle2,
  Clock,
  AlertTriangle,
  CheckCheck,
  RotateCcw,
  Trash2,
  Settings,
  Loader2,
  ArrowRight,
  Filter
} from 'lucide-react';

export function NotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [total, setTotal] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 20;

  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [preferencesModalOpen, setPreferencesModalOpen] = useState(false);

  useEffect(() => {
    fetchNotifications();
  }, [page, unreadOnly]);

  const fetchNotifications = async () => {
    setIsLoading(true);
    setError('');
    try {
      const offset = (page - 1) * limit;
      const res = await notificationsService.getNotifications({
        unreadOnly,
        limit,
        offset
      });
      setNotifications(res.data.notifications || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error(err);
      setError('Failed to load notifications');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkAsRead = async (id, e) => {
    e.stopPropagation();
    try {
      await notificationsService.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsService.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setNotice('All notifications marked as read');
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    try {
      await notificationsService.deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error(err);
    }
  };

  const handleRowClick = async (notif) => {
    if (!notif.isRead) {
      await notificationsService.markAsRead(notif.id).catch(() => {});
    }
    if (notif.actionUrl) {
      navigate(notif.actionUrl);
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'task_approved':
        return <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />;
      case 'review_requested':
      case 'approval_requested':
        return <CheckCheck className="w-5 h-5 text-purple-600 shrink-0" />;
      case 'revision_requested':
        return <RotateCcw className="w-5 h-5 text-amber-600 shrink-0" />;
      case 'task_overdue':
        return <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />;
      case 'deadline_reminder':
        return <Clock className="w-5 h-5 text-blue-600 shrink-0" />;
      default:
        return <Bell className="w-5 h-5 text-brand-600 shrink-0" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-700 mb-1">
            <Bell className="w-4 h-4" />
            <span>Activity & Workflow Alerts</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Notification Center
          </h1>
          <p className="text-sm text-slate-500">
            Track approval requests, task assignments, status revisions, and deadline reminders
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setPreferencesModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl shadow-xs transition"
          >
            <Settings className="w-3.5 h-3.5 text-slate-500" />
            <span>Preferences</span>
          </button>

          <button
            onClick={handleMarkAllRead}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-xl transition"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Mark All as Read</span>
          </button>
        </div>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Tabs Filter Bar */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setUnreadOnly(false);
              setPage(1);
            }}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
              !unreadOnly
                ? 'bg-brand-50 text-brand-700 font-bold'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            All Notifications
          </button>
          <button
            onClick={() => {
              setUnreadOnly(true);
              setPage(1);
            }}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
              unreadOnly
                ? 'bg-brand-50 text-brand-700 font-bold'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Unread Only
          </button>
        </div>

        <span className="text-xs text-slate-400">
          Showing {notifications.length} of {total} notifications
        </span>
      </div>

      {/* List Card Body */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
            <span className="text-xs font-medium">Loading notifications...</span>
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-16 text-center text-slate-400 p-6">
            <Bell className="w-10 h-10 mx-auto mb-2 opacity-40 text-slate-400" />
            <h3 className="text-sm font-bold text-slate-700 mb-0.5">No Notifications</h3>
            <p className="text-xs text-slate-400">
              {unreadOnly ? 'You have read all of your notifications.' : 'No alerts have been recorded yet.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => handleRowClick(n)}
                className={`p-4 hover:bg-slate-50/80 cursor-pointer transition flex items-start justify-between gap-4 ${
                  !n.isRead ? 'bg-emerald-50/25' : ''
                }`}
              >
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  <div className="mt-0.5">{getNotificationIcon(n.type)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span
                        className={`text-xs ${
                          !n.isRead ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'
                        }`}
                      >
                        {n.title}
                      </span>
                      {!n.isRead && (
                        <span className="w-2 h-2 rounded-full bg-brand-600 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{n.message}</p>
                    <span className="text-[11px] text-slate-400 block mt-1">
                      {new Date(n.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {!n.isRead && (
                    <button
                      onClick={(e) => handleMarkAsRead(n.id, e)}
                      className="px-2.5 py-1 text-[11px] font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg transition"
                      title="Mark as read"
                    >
                      Mark read
                    </button>
                  )}
                  <button
                    onClick={(e) => handleDelete(n.id, e)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition"
                    title="Delete notification"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {total > limit && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Page {page} of {Math.ceil(total / limit)}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page >= Math.ceil(total / limit)}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Preferences Modal */}
      <NotificationPreferencesModal
        isOpen={preferencesModalOpen}
        onClose={() => setPreferencesModalOpen(false)}
      />
    </div>
  );
}
