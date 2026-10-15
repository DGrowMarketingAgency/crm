import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { usePermission } from '../hooks/usePermission';
import { NotificationBell } from '../components/notifications/NotificationBell';
import { NotificationPreferencesModal } from '../pages/notifications/NotificationPreferencesModal';
import { ActiveTimerHeaderWidget } from '../components/time/ActiveTimerHeaderWidget';
import BranchedMenu from '../components/navigation/BranchedMenu';
import {
  Layers,
  LogOut,
  ChevronDown,
  Bell,
  Lock,
  LifeBuoy,
  CreditCard,
  MessageSquare,
  Briefcase,
  Calendar,
  Key
} from 'lucide-react';
import {
  DashboardSquare01Icon,
  Building01Icon,
  KanbanIcon,
  Task01Icon,
  FilterIcon,
  Invoice01Icon,
  UserGroupIcon,
  UserMultiple02Icon,
  Shield01Icon,
  Time01Icon,
  Activity01Icon,
  Notification01Icon,
  WorkflowSquare01Icon,
  HierarchySquare02Icon
} from '@hugeicons/core-free-icons';

export function DashboardLayout() {
  const { user, logout } = useAuth();
  const { hasPermission, roles, isOwner } = usePermission();
  const navigate = useNavigate();
  const location = useLocation();

  const isClientUser = Boolean(user?.client_id) || (roles || []).some((r) => r.slug === 'client');
  const isAdminUser =
    isOwner ||
    (roles || []).some((r) => r.slug === 'owner' || r.slug === 'admin') ||
    hasPermission('credentials.manage') ||
    hasPermission('credentials.view_all');

  const [profileOpen, setProfileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      navigate('/login');
    } finally {
      setLoggingOut(false);
    }
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getActiveValue = () => {
    const path = location.pathname;
    if (path.startsWith('/tasks')) return '/tasks';
    if (path.startsWith('/projects')) return '/projects';
    if (path.startsWith('/workflows')) return '/workflows';
    if (path.startsWith('/clients')) return '/clients';
    if (path.startsWith('/calendar')) return '/calendar';
    if (path.startsWith('/leads')) return '/leads';
    if (path.startsWith('/tickets')) return '/tickets';
    if (path.startsWith('/billing')) return '/billing';
    if (path.startsWith('/departments')) return '/departments';
    if (path.startsWith('/users')) return '/users';
    if (path.startsWith('/teams')) return '/teams';
    if (path.startsWith('/time')) return '/time';
    if (path.startsWith('/reports')) return '/reports';
    if (path.startsWith('/roles')) return '/roles';
    if (path.startsWith('/audit-logs')) return '/audit-logs';
    if (path.startsWith('/notifications')) return '/notifications';
    if (path.startsWith('/chat')) return '/chat';
    if (path.startsWith('/hr')) return '/hr';
    if (path.startsWith('/password-manager')) return '/password-manager';
    if (path.startsWith('/shared-credentials')) return '/shared-credentials';
    if (path.startsWith('/authorized-credentials')) return '/authorized-credentials';
    return '/dashboard';
  };

  const menuItems = [
    {
      label: isClientUser ? 'Client Portal' : 'Core Operations',
      children: [
        {
          value: '/dashboard',
          label: isClientUser
            ? 'Client Portal'
            : isAdminUser
            ? 'Leadership Dashboard'
            : 'My Workspace',
          icon: DashboardSquare01Icon
        },
        !isClientUser && (hasPermission('tasks.view') || hasPermission('tasks.view_all')) && {
          value: '/tasks',
          label: 'Task Board',
          icon: KanbanIcon
        },
        hasPermission('projects.view') && {
          value: '/projects',
          label: isClientUser ? 'Projects & Deliverables' : 'Projects & Milestones',
          icon: Task01Icon
        },
        !isClientUser && hasPermission('workflows.view') && {
          value: '/workflows',
          label: 'Workflow Presets',
          icon: WorkflowSquare01Icon
        }
      ].filter(Boolean)
    },
    {
      label: isClientUser ? 'Business & Billing' : 'Clients & Pipeline',
      children: [
        !isClientUser && hasPermission('clients.view') && {
          value: '/clients',
          label: 'Clients',
          icon: Building01Icon
        },
        hasPermission('calendar.view') && {
          value: '/calendar',
          label: isClientUser ? 'Campaign Calendar' : 'Content & Work Calendar',
          icon: Calendar
        },
        !isClientUser && hasPermission('leads.view') && {
          value: '/leads',
          label: 'BD Pipelines',
          icon: FilterIcon
        },
        hasPermission('tickets.view') && {
          value: '/tickets',
          label: 'Support Tickets',
          icon: LifeBuoy
        },
        hasPermission('invoices.view') && {
          value: '/billing',
          label: isClientUser ? 'Invoices & Quotations' : 'Quotations & Invoices',
          icon: CreditCard
        },
        !isClientUser && hasPermission('reports.view_dashboard') && {
          value: '/reports',
          label: 'Invoices & Reports',
          icon: Invoice01Icon
        }
      ].filter(Boolean)
    },
    // Agency & People (Hidden completely from Clients)
    !isClientUser && {
      label: 'Agency & People',
      children: [
        hasPermission('departments.view') && {
          value: '/departments',
          label: 'Departments',
          icon: HierarchySquare02Icon
        },
        hasPermission('users.view') && {
          value: '/users',
          label: 'Team & Logins',
          icon: UserMultiple02Icon
        },
        hasPermission('teams.view') && {
          value: '/teams',
          label: 'Teams & Groups',
          icon: UserGroupIcon
        },
        hasPermission('time_entries.view_own') && {
          value: '/time',
          label: 'Time & Timesheets',
          icon: Time01Icon
        },
        hasPermission('notifications.view') && {
          value: '/notifications',
          label: 'Notifications',
          icon: Notification01Icon
        },
        hasPermission('chat.view') && {
          value: '/chat',
          label: 'Team Chat',
          icon: MessageSquare
        },
        (hasPermission('hr.employees.view') ||
          hasPermission('hr.attendance.view_own') ||
          hasPermission('hr.leave.view_own') ||
          hasPermission('hr.payslips.view_own')) && {
          value: '/hr',
          label: 'HR & Workforce',
          icon: Briefcase
        },
        (!isClientUser && hasPermission('credentials.employee_view') && !isAdminUser) && {
          value: '/authorized-credentials',
          label: 'Authorized Client Credentials',
          icon: Key
        }
      ].filter(Boolean)
    },
    // Admin / Leadership Account & Security
    (!isClientUser && (isAdminUser || hasPermission('roles.view'))) && {
      label: 'Account & Security',
      children: [
        isAdminUser && { value: '/password-manager', label: 'Password Manager', icon: Key },
        hasPermission('roles.view') && { value: '/roles', label: 'Roles & Permissions', icon: Shield01Icon },
        hasPermission('roles.view') && { value: '/audit-logs', label: 'Activity & Audit', icon: Activity01Icon }
      ].filter(Boolean)
    },
    // Client Portal Account & Security
    isClientUser && {
      label: 'Account & Security',
      children: [
        { value: '/shared-credentials', label: 'Shared Credentials Vault', icon: Key }
      ].filter(Boolean)
    }
  ]
    .filter(Boolean)
    .filter((cat) => cat.children && cat.children.length > 0);

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-50 flex">
      {/* Sidebar Navigation - Dark Crimson Theme (Fixed Viewport Height) */}
      <aside className="w-64 h-screen bg-gradient-to-b from-[#110103] via-[#200306] to-[#59080f] flex flex-col shrink-0 text-white border-r border-[#3d060c] shadow-2xl select-none z-20">
        {/* Brand */}
        <div className="h-16 px-5 border-b border-white/10 flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-[#e3272e] text-white flex items-center justify-center shadow-lg shadow-red-700/50 shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="font-extrabold text-white tracking-tight text-base block leading-tight truncate">
              D-GROW OS
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-300/80 block">
              Agency Operating System
            </span>
          </div>
        </div>

        {/* Navigation Items (Categorized BranchedMenu - Smooth internal scroll) */}
        <div className="flex-1 px-2.5 py-3 overflow-y-auto overflow-x-hidden min-h-0 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent]">
          <BranchedMenu
            items={menuItems}
            defaultOpen={[0, 1, 2, 3]}
            activeValue={getActiveValue()}
            onSelect={(value) => navigate(value)}
            color="#f5f5f5"
            accentColor="#e3272e"
            lineColor="rgba(255, 255, 255, 0.2)"
            width={245}
            rowHeight={36}
            indent={36}
            trunk={14}
            radius={10}
            lineWidth={1.5}
            fontSize={13}
            drawDuration={400}
            foldDuration={300}
          />
        </div>

        {/* Security Capsule Pill (from reference screenshot) */}
        <div className="px-3 pb-2 pt-1 shrink-0">
          <div className="py-2 px-3 rounded-2xl bg-black/40 border border-white/10 flex items-center gap-2.5 text-[11px] text-rose-200/90 font-medium shadow-inner">
            <Lock className="w-3.5 h-3.5 text-rose-300 shrink-0" />
            <span className="truncate">Files encrypted at rest · 2-step off</span>
          </div>
        </div>

        {/* User Card Bottom Sidebar */}
        <div className="p-3 border-t border-white/10 bg-black/20 shrink-0">
          <div className="p-2.5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-[#e3272e] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-md shadow-red-700/40">
                {getInitials(user?.name)}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">
                  {user?.name}
                </p>
                <span className="text-[10px] text-rose-300/80 truncate block">
                  {user?.designations?.[0] || user?.role || 'Team Member'}
                </span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              title="Logout"
              className="p-1.5 rounded-lg text-rose-200/70 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div
        className={`flex-1 h-screen flex flex-col min-w-0 ${
          location.pathname.startsWith('/chat')
            ? 'overflow-hidden'
            : 'overflow-y-auto overflow-x-hidden'
        }`}
      >
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200/80 px-8 flex items-center justify-between sticky top-0 z-10 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Agency Workspace
            </h2>
          </div>

          <div className="flex items-center gap-4">
            {/* System Status Pill */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Granular RBAC Enforced</span>
            </div>

            {/* Active Task Timer Widget */}
            <ActiveTimerHeaderWidget />

            {/* Notification Bell */}
            <NotificationBell onOpenPreferences={() => setPreferencesOpen(true)} />

            {/* Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-slate-100 transition-colors focus:outline-none"
              >
                <div className="w-8 h-8 rounded-lg bg-brand-700 text-white flex items-center justify-center font-bold text-xs">
                  {getInitials(user?.name)}
                </div>
                <div className="hidden md:block text-left">
                  <p className="text-xs font-semibold text-slate-800 leading-tight">
                    {user?.name}
                  </p>
                  <p className="text-[11px] text-slate-500 leading-tight">
                    {user?.email}
                  </p>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {profileOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-100 py-1.5 z-20 animate-in fade-in slide-in-from-top-1">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <p className="text-xs font-semibold text-slate-900 truncate">
                      {user?.name}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {roles.length > 0 ? (
                        roles.map((r) => (
                          <span
                            key={r.id}
                            className="text-[10px] font-medium bg-brand-100 text-brand-800 px-1.5 py-0.5 rounded uppercase"
                          >
                            {r.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] font-medium bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded uppercase">
                          {user?.role || 'Member'}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content Outlet */}
        <main
          className={
            location.pathname.startsWith('/chat')
              ? 'flex-1 w-full h-[calc(100vh-4rem)] min-h-0 overflow-hidden'
              : 'flex-1 p-8 max-w-7xl mx-auto w-full'
          }
        >
          <Outlet />
        </main>
      </div>

      {/* Global Notification Preferences Modal */}
      <NotificationPreferencesModal
        isOpen={preferencesOpen}
        onClose={() => setPreferencesOpen(false)}
      />
    </div>
  );
}
