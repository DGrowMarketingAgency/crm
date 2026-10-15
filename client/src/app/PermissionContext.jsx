import React, { createContext, useState, useEffect, useCallback } from 'react';
import { rbacService } from '../services/api';
import { useAuth } from '../hooks/useAuth';

export const PermissionContext = createContext(null);

export function PermissionProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const [permissions, setPermissions] = useState([]);
  const [roles, setRoles] = useState([]);
  const [isOwner, setIsOwner] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    if (!isAuthenticated) {
      setPermissions([]);
      setRoles([]);
      setIsOwner(false);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const res = await rbacService.getMyPermissions();
      if (res.data?.success) {
        setPermissions(res.data.permissions || []);
        setRoles(res.data.roles || []);
        setIsOwner(Boolean(res.data.user?.isOwner));
      }
    } catch (err) {
      console.error('Failed to load user permissions:', err);
      setPermissions([]);
      setRoles([]);
      setIsOwner(false);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions, user?.id]);

  const hasPermission = useCallback(
    (key) => {
      if (isOwner) return true;
      return permissions.includes(key);
    },
    [isOwner, permissions]
  );

  const hasAnyPermission = useCallback(
    (keys) => {
      if (isOwner) return true;
      if (!Array.isArray(keys) || keys.length === 0) return true;
      return keys.some((k) => permissions.includes(k));
    },
    [isOwner, permissions]
  );

  const hasAllPermissions = useCallback(
    (keys) => {
      if (isOwner) return true;
      if (!Array.isArray(keys) || keys.length === 0) return true;
      return keys.every((k) => permissions.includes(k));
    },
    [isOwner, permissions]
  );

  const value = {
    permissions,
    roles,
    isOwner,
    isLoading,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    refreshPermissions: fetchPermissions
  };

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
}
