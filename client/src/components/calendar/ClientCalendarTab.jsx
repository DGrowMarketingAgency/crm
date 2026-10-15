import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar as CalendarIcon,
  Plus,
  Loader2,
  Filter,
  Search,
  RotateCcw,
  SlidersHorizontal,
  ChevronDown,
  X
} from 'lucide-react';
import { calendarService } from '../../services/api';
import { MonthlyCalendarGrid } from './MonthlyCalendarGrid';
import { EventDetailModal } from './EventDetailModal';
import { AddEditEventModal } from './AddEditEventModal';
import { DayActivitiesModal } from './DayActivitiesModal';
import { usePermission } from '../../hooks/usePermission';

export function ClientCalendarTab({ clientId, clientName }) {
  const { hasPermission, user } = usePermission();

  const isClientUser = Boolean(user?.client_id) || (user?.roles || []).some((r) => r.slug === 'client');
  const canCreate = hasPermission('calendar.create') && !isClientUser;
  const canUpdate = hasPermission('calendar.update') && !isClientUser;
  const canDelete = hasPermission('calendar.delete') && !isClientUser;
  const canPublish = hasPermission('calendar.publish') && !isClientUser;

  const [currentDate, setCurrentDate] = useState(new Date());

  // Filter states
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState('');
  const [selectedVisibility, setSelectedVisibility] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  // Data states
  const [events, setEvents] = useState([]);
  const [options, setOptions] = useState({
    employees: [],
    departments: [],
    clients: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [selectedDayEvents, setSelectedDayEvents] = useState([]);
  const [selectedDayDate, setSelectedDayDate] = useState(null);
  const [isDayModalOpen, setIsDayModalOpen] = useState(false);
  const [modalInitialDate, setModalInitialDate] = useState(null);

  // Load options
  useEffect(() => {
    async function loadOptions() {
      try {
        const res = await calendarService.getFilterOptions();
        setOptions(res.data.data);
      } catch (err) {
        console.error('Failed to load options:', err);
      }
    }
    loadOptions();
  }, []);

  // Fetch client events
  const fetchEvents = useCallback(async () => {
    if (!clientId) return;
    setIsLoading(true);
    setError('');

    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');

    const params = {
      clientId,
      month: `${year}-${month}`,
      includeTasks: 'true'
    };

    if (selectedCategory) params.eventCategory = selectedCategory;
    if (selectedStatus) params.status = selectedStatus;
    if (selectedPlatform) params.platform = selectedPlatform;
    if (selectedVisibility) params.isClientVisible = selectedVisibility;
    if (searchQuery.trim()) params.search = searchQuery.trim();

    try {
      const res = await calendarService.getEvents(params);
      setEvents(res.data.data || []);
    } catch (err) {
      setError(err.response?.data?.error?.message || err.response?.data?.message || err.message || 'Failed to load client calendar');
    } finally {
      setIsLoading(false);
    }
  }, [clientId, currentDate, selectedCategory, selectedStatus, selectedPlatform, selectedVisibility, searchQuery]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleOpenAdd = (date = null) => {
    setEditingEvent(null);
    setModalInitialDate(date || currentDate.toISOString().slice(0, 10));
    setIsAddEditModalOpen(true);
  };

  const handleOpenEdit = (evt) => {
    setEditingEvent(evt);
    setIsAddEditModalOpen(true);
  };

  const activeFiltersCount = [
    selectedCategory,
    selectedStatus,
    selectedPlatform,
    selectedVisibility,
    searchQuery
  ].filter(Boolean).length;

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Client Calendar Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search posts, SEO activities, meetings..."
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

            {canCreate && (
              <button
                onClick={() => handleOpenAdd()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-sm transition-colors"
              >
                <Plus className="w-4 h-4" /> Add Event
              </button>
            )}
          </div>
        </div>

        {isFilterPanelOpen && (
          <div className="pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
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
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Platform</label>
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

            {!isClientUser && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Visibility</label>
                <select
                  value={selectedVisibility}
                  onChange={(e) => setSelectedVisibility(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
                >
                  <option value="">All Visibility</option>
                  <option value="true">Client Visible</option>
                  <option value="false">Internal Only</option>
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      {isLoading && (
        <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-700" />
          <span className="text-xs font-medium">Loading client schedule...</span>
        </div>
      )}

      {error && !isLoading && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs">
          {error}
        </div>
      )}

      {!isLoading && (
        <MonthlyCalendarGrid
          currentDate={currentDate}
          onDateChange={setCurrentDate}
          events={events}
          onSelectEvent={(evt) => {
            setSelectedEvent(evt);
            setIsDetailModalOpen(true);
          }}
          onSelectDate={(d, dEvts) => {
            setSelectedDayDate(d);
            setSelectedDayEvents(dEvts);
            setIsDayModalOpen(true);
          }}
          onAddEvent={handleOpenAdd}
          canAdd={canCreate}
          isClientScope={true}
          clientName={clientName}
        />
      )}

      <EventDetailModal
        event={selectedEvent}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        onEdit={handleOpenEdit}
        onDeleted={fetchEvents}
        onUpdated={fetchEvents}
        canEdit={canUpdate}
        canDelete={canDelete}
        canPublish={canPublish}
        isClientUser={isClientUser}
      />

      <AddEditEventModal
        isOpen={isAddEditModalOpen}
        onClose={() => setIsAddEditModalOpen(false)}
        onSaved={fetchEvents}
        initialData={editingEvent}
        initialDate={modalInitialDate}
        fixedClientId={clientId}
        clients={[{ id: clientId, name: clientName }]}
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
