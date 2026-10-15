import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar as CalendarIcon,
  Filter,
  Search,
  RotateCcw,
  Plus,
  Loader2,
  Building2,
  User,
  CheckSquare,
  Sparkles,
  SlidersHorizontal,
  ChevronDown,
  Layers,
  X
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { calendarService } from '../../services/api';
import { MonthlyCalendarGrid } from '../../components/calendar/MonthlyCalendarGrid';
import { EventDetailModal } from '../../components/calendar/EventDetailModal';
import { AddEditEventModal } from '../../components/calendar/AddEditEventModal';
import { DayActivitiesModal } from '../../components/calendar/DayActivitiesModal';
import { usePermission } from '../../hooks/usePermission';

export function CalendarPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasPermission, user } = usePermission();

  const isClientUser = Boolean(user?.client_id) || (user?.roles || []).some((r) => r.slug === 'client');
  const canCreate = hasPermission('calendar.create') && !isClientUser;
  const canUpdate = hasPermission('calendar.update') && !isClientUser;
  const canDelete = hasPermission('calendar.delete') && !isClientUser;
  const canPublish = hasPermission('calendar.publish') && !isClientUser;

  // Active view date
  const [currentDate, setCurrentDate] = useState(() => {
    const qDate = searchParams.get('date');
    if (qDate) {
      const d = new Date(qDate);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  });

  // Filter states
  const [selectedClientId, setSelectedClientId] = useState(searchParams.get('clientId') || '');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState('');
  const [selectedVisibility, setSelectedVisibility] = useState('');
  const [includeTasks, setIncludeTasks] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  // Data states
  const [events, setEvents] = useState([]);
  const [options, setOptions] = useState({
    clients: [],
    departments: [],
    employees: [],
    eventCategories: [],
    eventTypes: {}
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal states
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [selectedDayEvents, setSelectedDayEvents] = useState([]);
  const [selectedDayDate, setSelectedDayDate] = useState(null);
  const [isDayModalOpen, setIsDayModalOpen] = useState(false);
  const [modalInitialDate, setModalInitialDate] = useState(null);

  // Fetch meta filter options on mount
  useEffect(() => {
    async function loadOptions() {
      try {
        const res = await calendarService.getFilterOptions();
        setOptions(res.data.data);
      } catch (err) {
        console.error('Failed to load calendar options:', err);
      }
    }
    loadOptions();
  }, []);

  // Fetch events for current month and applied filters
  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    setError('');

    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const monthParam = `${year}-${month}`;

    const params = {
      month: monthParam,
      includeTasks: includeTasks ? 'true' : 'false'
    };

    if (selectedClientId) params.clientId = selectedClientId;
    if (selectedCategory) params.eventCategory = selectedCategory;
    if (selectedType) params.eventType = selectedType;
    if (selectedStatus) params.status = selectedStatus;
    if (selectedAssignee) params.assignedTo = selectedAssignee;
    if (selectedDepartment) params.department = selectedDepartment;
    if (selectedPlatform) params.platform = selectedPlatform;
    if (selectedVisibility) params.isClientVisible = selectedVisibility;
    if (searchQuery.trim()) params.search = searchQuery.trim();

    try {
      const res = await calendarService.getEvents(params);
      setEvents(res.data.data || []);
    } catch (err) {
      setError(err.response?.data?.error?.message || err.response?.data?.message || err.message || 'Failed to fetch calendar events');
    } finally {
      setIsLoading(false);
    }
  }, [
    currentDate,
    selectedClientId,
    selectedCategory,
    selectedType,
    selectedStatus,
    selectedAssignee,
    selectedDepartment,
    selectedPlatform,
    selectedVisibility,
    includeTasks,
    searchQuery
  ]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleClearFilters = () => {
    setSelectedClientId('');
    setSelectedCategory('');
    setSelectedType('');
    setSelectedStatus('');
    setSelectedAssignee('');
    setSelectedDepartment('');
    setSelectedPlatform('');
    setSelectedVisibility('');
    setSearchQuery('');
  };

  const handleOpenAdd = (date = null) => {
    setEditingEvent(null);
    setModalInitialDate(date || currentDate.toISOString().slice(0, 10));
    setIsAddEditModalOpen(true);
  };

  const handleOpenEdit = (evt) => {
    setEditingEvent(evt);
    setIsAddEditModalOpen(true);
  };

  const handleEventSaved = (savedEvt) => {
    fetchEvents();
  };

  const handleEventDeleted = (deletedId) => {
    fetchEvents();
  };

  const handleSelectDay = (dateStr, dayEvents) => {
    setSelectedDayDate(dateStr);
    setSelectedDayEvents(dayEvents);
    setIsDayModalOpen(true);
  };

  const activeFiltersCount = [
    selectedClientId,
    selectedCategory,
    selectedType,
    selectedStatus,
    selectedAssignee,
    selectedDepartment,
    selectedPlatform,
    selectedVisibility,
    searchQuery
  ].filter(Boolean).length;

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-12 animate-in fade-in duration-200">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
              <CalendarIcon className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Client Content & Work Calendar
              </h1>
              <p className="text-xs text-slate-500">
                Plan, schedule, and track all social posts, video productions, shoot days, SEO activities, and client milestones
              </p>
            </div>
          </div>
        </div>

        {canCreate && (
          <button
            onClick={() => handleOpenAdd()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-sm transition-colors self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" /> Add Event
          </button>
        )}
      </div>

      {/* Main Filter Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Client Selector & Search */}
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
            {/* Client Select */}
            <div className="w-full sm:w-64">
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 bg-white font-medium text-slate-800"
              >
                <option value="">All Clients Calendar</option>
                {options.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Title / Caption Search */}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search events, captions, topics..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Filter Panel Toggle & Reset */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                isFilterPanelOpen || activeFiltersCount > 0
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Filters</span>
              {activeFiltersCount > 0 && (
                <span className="w-4 h-4 text-[10px] bg-emerald-700 text-white rounded-full inline-flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
              <ChevronDown className={`w-3 h-3 transition-transform ${isFilterPanelOpen ? 'rotate-180' : ''}`} />
            </button>

            {activeFiltersCount > 0 && (
              <button
                onClick={handleClearFilters}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                title="Clear Filters"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Filter Panel */}
        {isFilterPanelOpen && (
          <div className="pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 animate-in fade-in duration-150 text-xs">
            {/* Category */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Category</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
              >
                <option value="">All Categories</option>
                <option value="content_publishing">Content Publishing</option>
                <option value="content_production">Content Production</option>
                <option value="seo_activities">SEO Activities</option>
                <option value="agency_operations">Agency Operations</option>
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Status</label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
              >
                <option value="">All Statuses</option>
                <option value="planned">Planned</option>
                <option value="in_production">In Production</option>
                <option value="pending_internal_review">Internal Review</option>
                <option value="awaiting_client_approval">Client Approval</option>
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="published">Published</option>
                <option value="cancelled">Cancelled</option>
                <option value="on_hold">On Hold</option>
              </select>
            </div>

            {/* Assignee */}
            {!isClientUser && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Assigned Staff</label>
                <select
                  value={selectedAssignee}
                  onChange={(e) => setSelectedAssignee(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
                >
                  <option value="">All Staff</option>
                  {options.employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Department */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Department</label>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
              >
                <option value="">All Departments</option>
                {options.departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {/* Platform */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Social Platform</label>
              <select
                value={selectedPlatform}
                onChange={(e) => setSelectedPlatform(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
              >
                <option value="">All Platforms</option>
                <option value="Instagram">Instagram</option>
                <option value="Facebook">Facebook</option>
                <option value="LinkedIn">LinkedIn</option>
                <option value="YouTube">YouTube</option>
                <option value="Twitter / X">Twitter / X</option>
                <option value="TikTok">TikTok</option>
                <option value="Website">Website</option>
              </select>
            </div>

            {/* Client Visibility */}
            {!isClientUser && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Visibility</label>
                <select
                  value={selectedVisibility}
                  onChange={(e) => setSelectedVisibility(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
                >
                  <option value="">All Visibility</option>
                  <option value="true">Client Visible Only</option>
                  <option value="false">Internal Only</option>
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Loading or Error State */}
      {isLoading && (
        <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-700" />
          <span className="text-xs font-medium">Loading scheduled activities...</span>
        </div>
      )}

      {error && !isLoading && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs">
          {error}
        </div>
      )}

      {/* Monthly Calendar Grid */}
      {!isLoading && (
        <MonthlyCalendarGrid
          currentDate={currentDate}
          onDateChange={setCurrentDate}
          events={events}
          onSelectEvent={(evt) => {
            setSelectedEvent(evt);
            setIsDetailModalOpen(true);
          }}
          onSelectDate={handleSelectDay}
          onAddEvent={handleOpenAdd}
          canAdd={canCreate}
          isClientScope={Boolean(selectedClientId)}
          clientName={
            selectedClientId
              ? options.clients.find((c) => String(c.id) === String(selectedClientId))?.name
              : null
          }
        />
      )}

      {/* Modals */}
      <EventDetailModal
        event={selectedEvent}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        onEdit={handleOpenEdit}
        onDeleted={handleEventDeleted}
        onUpdated={fetchEvents}
        canEdit={canUpdate}
        canDelete={canDelete}
        canPublish={canPublish}
        isClientUser={isClientUser}
      />

      <AddEditEventModal
        isOpen={isAddEditModalOpen}
        onClose={() => setIsAddEditModalOpen(false)}
        onSaved={handleEventSaved}
        initialData={editingEvent}
        initialDate={modalInitialDate}
        fixedClientId={selectedClientId || null}
        clients={options.clients}
        employees={options.employees}
        departments={options.departments}
      />

      <DayActivitiesModal
        isOpen={isDayModalOpen}
        onClose={() => setIsDayModalOpen(false)}
        date={selectedDayDate}
        events={selectedDayEvents}
        onSelectEvent={(evt) => {
          setSelectedEvent(evt);
          setIsDetailModalOpen(true);
        }}
        onAddEvent={(d) => handleOpenAdd(d)}
        canAdd={canCreate}
      />
    </div>
  );
}
