import React from 'react';
import {
  X,
  Plus,
  Calendar,
  Clock,
  Building2,
  User,
  Share2,
  Eye,
  EyeOff,
  CheckCircle2,
  ExternalLink,
  Tag
} from 'lucide-react';

const CATEGORY_COLORS = {
  content_publishing: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  content_production: 'bg-blue-50 text-blue-700 border-blue-200',
  seo_activities: 'bg-purple-50 text-purple-700 border-purple-200',
  agency_operations: 'bg-amber-50 text-amber-700 border-amber-200'
};

const STATUS_BADGES = {
  planned: 'bg-slate-100 text-slate-700 border-slate-300',
  in_production: 'bg-blue-100 text-blue-800 border-blue-300',
  pending_internal_review: 'bg-amber-100 text-amber-800 border-amber-300',
  awaiting_client_approval: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  scheduled: 'bg-cyan-100 text-cyan-800 border-cyan-300',
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  published: 'bg-emerald-600 text-white border-emerald-600',
  cancelled: 'bg-rose-100 text-rose-800 border-rose-300',
  on_hold: 'bg-slate-200 text-slate-800 border-slate-400'
};

export function DayActivitiesModal({
  isOpen,
  onClose,
  date,
  events = [],
  onSelectEvent,
  onAddEvent,
  canAdd = true
}) {
  if (!isOpen || !date) return null;

  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-700" />
              <h2 className="text-base font-bold text-slate-900">{formattedDate}</h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {events.length} {events.length === 1 ? 'activity' : 'activities'} scheduled for this day
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Activities List */}
        <div className="px-6 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {events.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              No activities scheduled on this day.
            </div>
          ) : (
            events.map((evt) => {
              const catColor = CATEGORY_COLORS[evt.event_category] || CATEGORY_COLORS.agency_operations;
              const statusColor = STATUS_BADGES[evt.status] || STATUS_BADGES.planned;

              return (
                <div
                  key={evt.id}
                  onClick={() => {
                    onClose();
                    onSelectEvent(evt);
                  }}
                  className="p-3.5 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 hover:border-emerald-300 shadow-sm cursor-pointer transition-all space-y-2 group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${catColor}`}>
                          {evt.event_type}
                        </span>
                        <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${statusColor}`}>
                          {evt.status.replace('_', ' ')}
                        </span>
                        {evt.is_client_visible ? (
                          <span className="px-1.5 py-0.5 text-[10px] text-emerald-700 bg-emerald-50 rounded border border-emerald-200 flex items-center gap-0.5">
                            <Eye className="w-2.5 h-2.5" /> Portal
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 text-[10px] text-slate-500 bg-slate-50 rounded border border-slate-200 flex items-center gap-0.5">
                            <EyeOff className="w-2.5 h-2.5" /> Internal
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                        {evt.title}
                      </h4>
                    </div>

                    <div className="text-right text-xs shrink-0 text-slate-500">
                      {evt.is_all_day ? (
                        <span className="text-[11px] font-medium text-slate-500">All Day</span>
                      ) : evt.start_time ? (
                        <span className="text-[11px] font-medium text-slate-700 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {evt.start_time.slice(0, 5)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 pt-1 border-t border-slate-100">
                    <div className="flex items-center gap-1 text-slate-700 font-medium">
                      <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{evt.client_company_name || evt.client_name}</span>
                    </div>
                    {evt.assignee_name && (
                      <div className="flex items-center gap-1 text-slate-600">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>{evt.assignee_name}</span>
                      </div>
                    )}
                    {evt.platform && (
                      <div className="flex items-center gap-1 text-slate-600">
                        <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{evt.platform}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          {canAdd ? (
            <button
              onClick={() => {
                onClose();
                onAddEvent(date);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Activity for this Day
            </button>
          ) : (
            <div />
          )}
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
