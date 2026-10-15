import React from 'react';
import { Outlet } from 'react-router-dom';
import { usePermission } from '../hooks/usePermission';
import { AccessDeniedPage } from '../pages/rbac/AccessDeniedPage';
import { Loader2 } from 'lucide-react';

export function PermissionRoute({ requiredPermission, requiredAny }) {
  const { hasPermission, hasAnyPermission, isLoading } = usePermission();

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-4">
        <Loader2 className="w-6 h-6 animate-spin text-brand-700" />
        <p className="mt-2 text-xs text-slate-500 font-medium">Checking authorization...</p>
      </div>
    );
  }

  let authorized = true;
  if (requiredPermission && !hasPermission(requiredPermission)) {
    authorized = false;
  }
  if (requiredAny && !hasAnyPermission(requiredAny)) {
    authorized = false;
  }

  if (!authorized) {
    return <AccessDeniedPage requiredPermission={requiredPermission || requiredAny?.join(', ')} />;
  }

  return <Outlet />;
}
