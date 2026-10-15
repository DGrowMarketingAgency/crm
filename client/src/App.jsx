import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './app/AuthContext';
import { PermissionProvider } from './app/PermissionContext';
import { AppRoutes } from './routes/AppRoutes';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PermissionProvider>
          <AppRoutes />
        </PermissionProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
