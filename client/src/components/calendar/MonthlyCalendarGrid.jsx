import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  Clock,
  Building2,
  Repeat,
  EyeOff,
  CheckCircle2,
  Sparkles,
  Filter,
  CheckSquare
} from 'lucide-react';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const CATEGORY_STYLES = {
  content_publishing: 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100',
  content_production: 'bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100',
  seo_activities: 'bg-purple-50 text-purple-800 border-purple-300 hover:bg-purple-100',
  agency_operations: 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
};

export function MonthlyCalendarGrid({
  currentDate,
  onDateChange,
  events = [],
  onSelectEvent,
  onSelectDate,
  onAddEvent,
  canAdd = true,
  isClientScope = false,
  clientName = null
}) {
  const [viewMode, setViewMode] = useState('month'); // 'month' or 'week'

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  // Navigation handlers
  const handlePrevMonth = () => {
    onDateChange(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    onDateChange(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    onDateChange(new Date());
  };

  // Calendar calculations
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  const startDayOfWeek = firstDayOfMonth.getDay(); // 0 is Sunday
  const daysInMonth = lastDayOfMonth.getDate();

  // Trailing days from previous month
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  const prevMonthDays = [];
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    prevMonthDays.push({
      dateStr: new Date(year, month - 1, prevMonthLastDay - i).toISOString().slice(0, 10),
      dayNum: prevMonthLastDay - i,
      isCurrentMonth: false
    });
  }

  // Current month days
  const currentMonthDays = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    currentMonthDays.push({
      dateStr: dStr,
      dayNum: day,
      isCurrentMonth: true
    });
  }

  // Leading days from next month to complete 7-column rows
  const totalDaysSoFar = prevMonthDays.length + currentMonthDays.length;
  const nextMonthDaysCount = totalDaysSoFar % 7 === 0 ? 0 : 7 - (totalDaysSoFar % 7);
  const nextMonthDays = [];
  for (let day = 1; day <= nextMonthDaysCount; day++) {
    nextMonthDays.push({
      dateStr: new Date(year, month + 1, day).toISOString().slice(0, 10),
      dayNum: day,
      isCurrentMonth: false
    });
  }

  const allCalendarDays = [...prevMonthDays, ...currentMonthDays, ...nextMonthDays];

  // Group events by date string (YYYY-MM-DD)
  const eventsByDate = {};
  events.forEach((evt) => {
    const d = evt.event_date;
    if (!eventsByDate[d]) {
      eventsByDate[d] = [];
    }
    eventsByDate[d].push(evt);
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const monthName = currentDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      {/* Calendar Top Header Toolbar */}
      <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/60">
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white border border-slate-300 rounded-lg p-0.5 shadow-xs">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-md transition-colors"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleToday}
              className="px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-md transition-colors border-x border-slate-200"
            >
              Today
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-md transition-colors"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-baseline gap-2">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">{monthName}</h2>
            {clientName && (
              <span className="text-xs font-medium text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                {clientName}
              </span>
            )}
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1 font-semibold rounded-md transition-all ${
                viewMode === 'month' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Month View
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1 font-semibold rounded-md transition-all ${
                viewMode === 'week' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Week View
            </button>
          </div>

          {canAdd && (
            <button
              onClick={() => onAddEvent()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" /> Schedule Activity
            </button>
          )}
        </div>
      </div>

      {/* Weekday Names Header */}
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80 text-center text-xs font-semibold text-slate-600">
        {WEEKDAYS.map((dayName, idx) => (
          <div key={dayName} className="py-2.5 border-r last:border-r-0 border-slate-200">
            <span className="hidden sm:inline">{dayName}</span>
            <span className="sm:hidden">{dayName.slice(0, 3)}</span>
          </div>
        ))}
      </div>

      {/* Calendar Grid Cells */}
      <div className="grid grid-cols-7 auto-rows-fr bg-slate-200 gap-[1px]">
        {allCalendarDays.map((dayObj) => {
          const isToday = dayObj.dateStr === todayStr;
          const dayEvents = eventsByDate[dayObj.dateStr] || [];
          const visibleEvents = dayEvents.slice(0, 3);
          const hiddenCount = dayEvents.length - 3;

          return (
            <div
              key={dayObj.dateStr}
              onClick={() => onSelectDate(dayObj.dateStr, dayEvents)}
              className={`min-h-[110px] sm:min-h-[135px] p-1.5 sm:p-2 bg-white transition-colors cursor-pointer group flex flex-col justify-between ${
                !dayObj.isCurrentMonth ? 'bg-slate-50/60 text-slate-400' : 'hover:bg-slate-50/80'
              }`}
            >
              {/* Day Cell Top: Date Number & Quick Add */}
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className={`inline-flex items-center justify-center w-6 h-6 text-xs font-bold rounded-full transition-colors ${
                    isToday
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : dayObj.isCurrentMonth
                      ? 'text-slate-800 group-hover:text-emerald-700'
                      : 'text-slate-400'
                  }`}
                >
                  {dayObj.dayNum}
                </span>

                {canAdd && dayObj.isCurrentMonth && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddEvent(dayObj.dateStr);
                    }}
                    title="Add activity for this date"
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Day Cell Body: Events List */}
              <div className="space-y-1 flex-1 overflow-hidden">
                {visibleEvents.map((evt) => {
                  const catStyle = CATEGORY_STYLES[evt.event_category] || CATEGORY_STYLES.agency_operations;
                  const isCancelled = evt.status === 'cancelled';
                  const isPublished = evt.status === 'published';

                  return (
                    <div
                      key={evt.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEvent(evt);
                      }}
                      className={`px-1.5 py-0.5 text-[11px] rounded border font-medium truncate flex items-center justify-between gap-1 shadow-2xs transition-all ${catStyle} ${
                        isCancelled ? 'line-through opacity-60' : ''
                      }`}
                      title={`${evt.title} (${evt.event_type})`}
                    >
                      <div className="flex items-center gap-1 truncate">
                        {evt.is_task_event ? (
                          <CheckSquare className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                        ) : isPublished ? (
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                        ) : evt.recurrence_id ? (
                          <Repeat className="w-2.5 h-2.5 text-indigo-600 shrink-0" />
                        ) : null}
                        <span className="truncate">{evt.title}</span>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        {!evt.is_client_visible && (
                          <EyeOff className="w-2.5 h-2.5 text-slate-400 shrink-0" title="Internal Only" />
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* +N More indicator */}
                {hiddenCount > 0 && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectDate(dayObj.dateStr, dayEvents);
                    }}
                    className="text-[10px] font-semibold text-emerald-800 hover:text-emerald-950 bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded text-center transition-colors"
                  >
                    +{hiddenCount} more
                  </div>
                )}
              </div>

              {/* Day Cell Bottom: Dots for Mobile */}
              <div className="sm:hidden flex gap-0.5 mt-1">
                {dayEvents.slice(0, 4).map((_, i) => (
                  <div key={i} className="w-1 h-1 rounded-full bg-emerald-600" />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
