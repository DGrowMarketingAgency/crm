import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, Home } from 'lucide-react';

export function AccessDeniedPage({ requiredPermission }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shadow-sm mb-6">
        <ShieldAlert className="w-8 h-8" />
      </div>

      <h1 className="text-2xl font-bold text-slate-900 tracking-tight sm:text-3xl">
        Access Denied
      </h1>

      <p className="mt-3 text-sm text-slate-600 max-w-md leading-relaxed">
        You do not have the required permissions to access this administrative resource.
        {requiredPermission && (
          <span className="block mt-2 font-mono text-xs bg-slate-100 text-slate-700 py-1 px-2.5 rounded border border-slate-200 inline-block">
            Required Permission: {requiredPermission}
          </span>
        )}
      </p>

      <div className="mt-8 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Go Back</span>
        </button>

        <button
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-700 rounded-lg hover:bg-brand-800 transition-colors shadow-sm"
        >
          <Home className="w-4 h-4" />
          <span>Dashboard</span>
        </button>
      </div>
    </div>
  );
}
