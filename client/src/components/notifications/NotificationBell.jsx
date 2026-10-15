import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { notificationsService } from '../../services/api';
import { connectSocket } from '../../services/socket';
import {
  Bell,
  CheckCircle2,
  Clock,
  AlertTriangle,
  CheckCheck,
  RotateCcw,
  ExternalLink,
  Settings,
  X,
  Loader2
} from 'lucide-react';

export function NotificationBell({ onOpenPreferences }) {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    fetchUnreadCount();

    // Connect real-time socket
    const socket = connectSocket();
    if (socket) {
      socket.on('notification:new', (newNotif) => {
        setUnreadCount((prev) => prev + 1);
        setNotifications((prev) => [newNotif, ...prev.slice(0, 7)]);
      });
    }

    // Close on outside click
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const fetchUnreadCount = async () => {
    try {
      const res = await notificationsService.getUnreadCount();
      setUnreadCount(res.data.unreadCount || 0);
    } catch (e) {
      console.error('Failed to load unread notification count:', e);
    }
  };

  const loadRecentNotifications = async () => {
    setIsLoading(true);
    try {
      const res = await notificationsService.getNotifications({ limit: 8 });
      setNotifications(res.data.notifications || []);
    } catch (e) {
      console.error('Failed to load recent notifications:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleDropdown = () => {
    if (!isOpen) {
      loadRecentNotifications();
    }
    setIsOpen(!isOpen);
  };

  const handleNotificationClick = async (notif) => {
    if (!notif.isRead) {
      try {
        await notificationsService.markAsRead(notif.id);
        setUnreadCount((prev) => Math.max(0, prev - 1));
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n))
        );
      } catch (e) {
        console.error(e);
      }
    }
    setIsOpen(false);
    if (notif.actionUrl) {
      navigate(notif.actionUrl);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsService.markAllAsRead();
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (e) {
      console.error('Failed to mark all notifications read:', e);
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'task_approved':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />;
      case 'review_requested':
      case 'approval_requested':
        return <CheckCheck className="w-4 h-4 text-purple-600 shrink-0" />;
      case 'revision_requested':
        return <RotateCcw className="w-4 h-4 text-amber-600 shrink-0" />;
      case 'task_overdue':
        return <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />;
      case 'deadline_reminder':
        return <Clock className="w-4 h-4 text-blue-600 shrink-0" />;
      default:
        return <Bell className="w-4 h-4 text-brand-600 shrink-0" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={toggleDropdown}
        className="relative p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-brand-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white animate-in zoom-in-75">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200/80 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Notifications
              </span>
              {unreadCount > 0 && (
                <span className="text-[10px] font-bold bg-brand-100 text-brand-800 px-2 py-0.5 rounded-full">
                  {unreadCount} unread
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-[11px] font-semibold text-brand-700 hover:underline"
                >
                  Mark all read
                </button>
              )}
              {onOpenPreferences && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onOpenPreferences();
                  }}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50"
                  title="Notification Preferences"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* List Body */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {isLoading ? (
              <div className="py-8 text-center text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-1 text-brand-600" />
                <span className="text-xs">Loading notifications...</span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-slate-400">
                <Bell className="w-6 h-6 mx-auto mb-1.5 opacity-40" />
                <p className="text-xs">You're all caught up!</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`px-4 py-3 hover:bg-slate-50 cursor-pointer transition flex items-start gap-3 ${
                    !n.isRead ? 'bg-emerald-50/20' : ''
                  }`}
                >
                  <div className="mt-0.5">{getNotificationIcon(n.type)}</div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-xs leading-snug line-clamp-1 ${
                        !n.isRead ? 'font-bold text-slate-900' : 'font-medium text-slate-700'
                      }`}
                    >
                      {n.title}
                    </p>
                    <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{n.message}</p>
                    <span className="text-[10px] text-slate-400 block mt-1">
                      {new Date(n.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  {!n.isRead && (
                    <span className="w-2 h-2 rounded-full bg-brand-600 shrink-0 mt-1.5" />
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-2.5 border-t border-slate-100 bg-slate-50/50 text-center">
            <Link
              to="/notifications"
              onClick={() => setIsOpen(false)}
              className="text-xs font-semibold text-brand-700 hover:text-brand-900 inline-flex items-center gap-1"
            >
              <span>View all notifications</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
