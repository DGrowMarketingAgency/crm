import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  Clock,
  User,
  Building2,
  Tag,
  AlertCircle,
  Repeat,
  Share2,
  Eye,
  EyeOff,
  CheckSquare,
  ShieldAlert,
  Loader2
} from 'lucide-react';
import { calendarService } from '../../services/api';

const CATEGORIES = [
  { key: 'content_publishing', label: 'Content Publishing' },
  { key: 'content_production', label: 'Content Production' },
  { key: 'seo_activities', label: 'SEO Activities' },
  { key: 'agency_operations', label: 'Agency Operations' }
];

const EVENT_TYPES = {
  content_publishing: [
    'Static Post',
    'Carousel Post',
    'Reel',
    'Video Post',
    'Story',
    'Blog Post',
    'Website Content',
    'Campaign Launch'
  ],
  content_production: [
    'Content Planning',
    'Content Writing',
    'Graphic Design',
    'Video Editing',
    'Photo Shoot',
    'Video Shoot',
    'Content Review',
    'Client Approval',
    'Post Scheduling'
  ],
  seo_activities: [
    'On-Page SEO',
    'Off-Page SEO',
    'Keyword Research',
    'Technical SEO Audit',
    'Content Optimization',
    'Backlink Activity',
    'SEO Review',
    'SEO Performance Report'
  ],
  agency_operations: [
    'Client Meeting',
    'Internal Meeting',
    'Monthly Reporting',
    'Performance Review',
    'Strategy Planning',
    'Campaign Review',
    'General Task'
  ]
};

const PLATFORMS = [
  'Instagram',
  'Facebook',
  'LinkedIn',
  'YouTube',
  'Twitter / X',
  'TikTok',
  'Website',
  'Google Business Profile',
  'Other'
];

const FORMATS = [
  'Single Image',
  'Carousel / Multi-Image',
  'Reel / Short Video',
  'Long-form Video',
  'Story',
  'Blog Article',
  'Infographic',
  'Copy / Text',
  'Other'
];

const STATUSES = [
  { value: 'planned', label: 'Planned' },
  { value: 'in_production', label: 'In Production' },
  { value: 'pending_internal_review', label: 'Pending Internal Review' },
  { value: 'awaiting_client_approval', label: 'Awaiting Client Approval' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'published', label: 'Published' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'on_hold', label: 'On Hold' }
];

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' }
];

const WEEKDAYS = [
  { id: 0, label: 'Sun' },
  { id: 1, label: 'Mon' },
  { id: 2, label: 'Tue' },
  { id: 3, label: 'Wed' },
  { id: 4, label: 'Thu' },
  { id: 5, label: 'Fri' },
  { id: 6, label: 'Sat' }
];

export function AddEditEventModal({
  isOpen,
  onClose,
  onSaved,
  initialData = null,
  initialDate = null,
  fixedClientId = null,
  clients = [],
  employees = [],
  departments = []
}) {
  const isEditing = Boolean(initialData && initialData.id);

  const [formData, setFormData] = useState({
    clientId: fixedClientId || '',
    title: '',
    description: '',
    eventCategory: 'content_publishing',
    eventType: 'Static Post',
    eventDate: initialDate || new Date().toISOString().slice(0, 10),
    startTime: '10:00',
    endTime: '11:00',
    isAllDay: true,
    assignedTo: '',
    department: '',
    platform: 'Instagram',
    contentFormat: 'Single Image',
    contentSummary: '',
    status: 'planned',
    priority: 'medium',
    internalNotes: '',
    clientNotes: '',
    isClientVisible: false,
    createLinkedTask: false,
    // Recurrence
    isRecurring: false,
    recurrencePattern: 'weekly',
    intervalCount: 1,
    selectedDays: [1], // Monday
    recurrenceEndDate: '',
    maxOccurrences: 12,
    // Scope for editing
    updateScope: 'single'
  });

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData({
        clientId: initialData.client_id || fixedClientId || '',
        title: initialData.title || '',
        description: initialData.description || '',
        eventCategory: initialData.event_category || 'content_publishing',
        eventType: initialData.event_type || 'Static Post',
        eventDate: initialData.event_date || initialDate || new Date().toISOString().slice(0, 10),
        startTime: initialData.start_time ? initialData.start_time.slice(0, 5) : '10:00',
        endTime: initialData.end_time ? initialData.end_time.slice(0, 5) : '11:00',
        isAllDay: initialData.is_all_day !== undefined ? Boolean(initialData.is_all_day) : true,
        assignedTo: initialData.assigned_to || '',
        department: initialData.department || '',
        platform: initialData.platform || 'Instagram',
        contentFormat: initialData.content_format || 'Single Image',
        contentSummary: initialData.content_summary || '',
        status: initialData.status || 'planned',
        priority: initialData.priority || 'medium',
        internalNotes: initialData.internal_notes || '',
        clientNotes: initialData.client_notes || '',
        isClientVisible: Boolean(initialData.is_client_visible),
        createLinkedTask: false,
        isRecurring: false,
        recurrencePattern: 'weekly',
        intervalCount: 1,
        selectedDays: [1],
        recurrenceEndDate: '',
        maxOccurrences: 12,
        updateScope: 'single'
      });
    } else {
      setFormData((prev) => ({
        ...prev,
        clientId: fixedClientId || (clients[0]?.id ? String(clients[0].id) : ''),
        eventDate: initialDate || new Date().toISOString().slice(0, 10),
        title: '',
        description: '',
        internalNotes: '',
        clientNotes: '',
        contentSummary: '',
        status: 'planned',
        isRecurring: false,
        createLinkedTask: false
      }));
    }
    setError('');
  }, [initialData, initialDate, fixedClientId, isOpen]);

  if (!isOpen) return null;

  const handleCategoryChange = (cat) => {
    const defaultType = EVENT_TYPES[cat]?.[0] || 'General Task';
    setFormData((prev) => ({
      ...prev,
      eventCategory: cat,
      eventType: defaultType
    }));
  };

  const handleWeekdayToggle = (dayId) => {
    setFormData((prev) => {
      const exists = prev.selectedDays.includes(dayId);
      const newDays = exists ? prev.selectedDays.filter((d) => d !== dayId) : [...prev.selectedDays, dayId];
      return { ...prev, selectedDays: newDays.sort() };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.clientId) {
      setError('Please select a client');
      return;
    }
    if (!formData.title.trim()) {
      setError('Please provide an event title');
      return;
    }
    if (!formData.eventDate) {
      setError('Please select an event date');
      return;
    }
    if (!formData.isAllDay && formData.startTime && formData.endTime && formData.endTime < formData.startTime) {
      setError('End time cannot precede start time');
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEditing) {
        const payload = {
          title: formData.title.trim(),
          description: formData.description.trim() || null,
          eventCategory: formData.eventCategory,
          eventType: formData.eventType,
          eventDate: formData.eventDate,
          startTime: formData.isAllDay ? null : formData.startTime || null,
          endTime: formData.isAllDay ? null : formData.endTime || null,
          isAllDay: formData.isAllDay,
          assignedTo: formData.assignedTo ? Number(formData.assignedTo) : null,
          department: formData.department || null,
          platform: formData.platform || null,
          contentFormat: formData.contentFormat || null,
          contentSummary: formData.contentSummary.trim() || null,
          status: formData.status,
          priority: formData.priority,
          internalNotes: formData.internalNotes.trim() || null,
          clientNotes: formData.clientNotes.trim() || null,
          isClientVisible: formData.isClientVisible,
          updateScope: formData.updateScope
        };

        const res = await calendarService.updateEvent(initialData.id, payload);
        if (onSaved) onSaved(res.data.data);
      } else {
        const payload = {
          clientId: Number(formData.clientId),
          title: formData.title.trim(),
          description: formData.description.trim() || null,
          eventCategory: formData.eventCategory,
          eventType: formData.eventType,
          eventDate: formData.eventDate,
          startTime: formData.isAllDay ? null : formData.startTime || null,
          endTime: formData.isAllDay ? null : formData.endTime || null,
          isAllDay: formData.isAllDay,
          assignedTo: formData.assignedTo ? Number(formData.assignedTo) : null,
          department: formData.department || null,
          platform: formData.platform || null,
          contentFormat: formData.contentFormat || null,
          contentSummary: formData.contentSummary.trim() || null,
          status: formData.status,
          priority: formData.priority,
          internalNotes: formData.internalNotes.trim() || null,
          clientNotes: formData.clientNotes.trim() || null,
          isClientVisible: formData.isClientVisible,
          createLinkedTask: formData.createLinkedTask
        };

        if (formData.isRecurring) {
          payload.recurrence = {
            pattern: formData.recurrencePattern,
            intervalCount: Number(formData.intervalCount) || 1,
            daysOfWeek: formData.recurrencePattern === 'custom_weekdays' ? formData.selectedDays : null,
            endDate: formData.recurrenceEndDate || null,
            maxOccurrences: formData.maxOccurrences ? Number(formData.maxOccurrences) : 12
          };
        }

        const res = await calendarService.createEvent(payload);
        if (onSaved) onSaved(res.data.data);
      }

      onClose();
    } catch (err) {
      setError(err.response?.data?.error?.message || err.response?.data?.message || err.message || 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full border border-slate-200 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
              <Calendar className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {isEditing ? 'Edit Calendar Event' : 'Schedule Client Activity & Content'}
              </h2>
              <p className="text-xs text-slate-500">Plan posts, production shoots, SEO tasks, or client reviews</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5 max-h-[80vh] overflow-y-auto text-sm">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Section: Client & Title */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Client <span className="text-rose-500">*</span>
              </label>
              {fixedClientId ? (
                <div className="px-3 py-2 bg-slate-100 border border-slate-300 rounded-md text-xs font-medium text-slate-700 truncate">
                  {clients.find((c) => String(c.id) === String(fixedClientId))?.name || 'Selected Client'}
                </div>
              ) : (
                <select
                  disabled={isEditing}
                  value={formData.clientId}
                  onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 bg-white"
                  required
                >
                  <option value="">Select Client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Event Title <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. October Product Launch Reel or On-Page SEO Sprint"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600"
                required
              />
            </div>
          </div>

          {/* Section: Category & Event Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Activity Category</label>
              <select
                value={formData.eventCategory}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 bg-white font-medium"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Event Type</label>
              <select
                value={formData.eventType}
                onChange={(e) => setFormData({ ...formData, eventType: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 bg-white"
              >
                {(EVENT_TYPES[formData.eventCategory] || []).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Section: Date & Time Schedule */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={formData.eventDate}
                onChange={(e) => setFormData({ ...formData, eventDate: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">All Day Activity</label>
              <div className="h-9 flex items-center">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={formData.isAllDay}
                    onChange={(e) => setFormData({ ...formData, isAllDay: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                  />
                  <span>All Day Event</span>
                </label>
              </div>
            </div>

            {!formData.isAllDay && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">End Time</label>
                  <input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600"
                  />
                </div>
              </>
            )}
          </div>

          {/* Section: Assignee, Department, Status, Priority */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Employee</label>
              <select
                value={formData.assignedTo}
                onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 bg-white"
              >
                <option value="">Unassigned (Planning)</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} {emp.department ? `(${emp.department})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
              <select
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 bg-white"
              >
                <option value="">Select Department</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 bg-white"
              >
                {STATUSES.map((st) => (
                  <option key={st.value} value={st.value}>
                    {st.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 bg-white"
              >
                {PRIORITIES.map((pr) => (
                  <option key={pr.value} value={pr.value}>
                    {pr.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Section: Publishing specific fields (Platform, Format, Caption) */}
          {(formData.eventCategory === 'content_publishing' || formData.eventCategory === 'content_production') && (
            <div className="bg-emerald-50/50 border border-emerald-200 rounded-lg p-3.5 space-y-3">
              <div className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                <Share2 className="w-3.5 h-3.5 text-emerald-700" /> Content & Publishing Channel
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Target Platform</label>
                  <select
                    value={formData.platform}
                    onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 bg-white"
                  >
                    {PLATFORMS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Content Format</label>
                  <select
                    value={formData.contentFormat}
                    onChange={(e) => setFormData({ ...formData, contentFormat: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 bg-white"
                  >
                    {FORMATS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Content Summary / Working Caption
                </label>
                <textarea
                  rows={2}
                  placeholder="Outline key caption text, visual focus, hooks, or call-to-action..."
                  value={formData.contentSummary}
                  onChange={(e) => setFormData({ ...formData, contentSummary: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 bg-white"
                />
              </div>
            </div>
          )}

          {/* Section: Visibility & Client Portal Access */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  {formData.isClientVisible ? (
                    <Eye className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                  )}
                  Client Portal Visibility
                </div>
                <div className="text-[11px] text-slate-500">
                  {formData.isClientVisible
                    ? 'Client can view this activity on their portal calendar (internal notes remain strictly hidden).'
                    : 'Internal only activity. Clients cannot see this on their dashboard or calendar.'}
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isClientVisible}
                  onChange={(e) => setFormData({ ...formData, isClientVisible: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-700"></div>
              </label>
            </div>
          </div>

          {/* Section: Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <ShieldAlert className="w-3 h-3 text-amber-600" /> Confidential Internal Notes
              </label>
              <textarea
                rows={2}
                placeholder="Team instructions, raw footage links, editor brief (never shown to clients)..."
                value={formData.internalNotes}
                onChange={(e) => setFormData({ ...formData, internalNotes: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Client Notes (Visible if Client-Visible)
              </label>
              <textarea
                rows={2}
                placeholder="Client-facing overview, meeting agenda or deliverable notes..."
                value={formData.clientNotes}
                onChange={(e) => setFormData({ ...formData, clientNotes: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600"
              />
            </div>
          </div>

          {/* Section: Task Linking (Create Only) */}
          {!isEditing && (
            <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-lg flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                  <CheckSquare className="w-3.5 h-3.5 text-blue-700" /> Create Linked Task in Tasks Engine
                </div>
                <div className="text-[11px] text-blue-700">
                  Automatically generates an executable task on the agency board with matching assignee and due date.
                </div>
              </div>
              <input
                type="checkbox"
                checked={formData.createLinkedTask}
                onChange={(e) => setFormData({ ...formData, createLinkedTask: e.target.checked })}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-blue-300"
              />
            </div>
          )}

          {/* Section: Recurrence (Create Only) */}
          {!isEditing && (
            <div className="border border-slate-200 rounded-lg p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Repeat className="w-3.5 h-3.5 text-indigo-600" /> Recurring Agency Work
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={formData.isRecurring}
                    onChange={(e) => setFormData({ ...formData, isRecurring: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                  />
                  <span>Repeat this activity</span>
                </label>
              </div>

              {formData.isRecurring && (
                <div className="pt-2 border-t border-slate-100 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Recurrence Pattern</label>
                      <select
                        value={formData.recurrencePattern}
                        onChange={(e) => setFormData({ ...formData, recurrencePattern: e.target.value })}
                        className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-md focus:ring-1 focus:ring-emerald-600 bg-white"
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="custom_weekdays">Specific Weekdays</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Interval</label>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={formData.intervalCount}
                        onChange={(e) => setFormData({ ...formData, intervalCount: e.target.value })}
                        className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-md focus:ring-1 focus:ring-emerald-600"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Occurrences Limit</label>
                      <input
                        type="number"
                        min="1"
                        max="52"
                        value={formData.maxOccurrences}
                        onChange={(e) => setFormData({ ...formData, maxOccurrences: e.target.value })}
                        className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-md focus:ring-1 focus:ring-emerald-600"
                      />
                    </div>
                  </div>

                  {formData.recurrencePattern === 'custom_weekdays' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Repeat on Days</label>
                      <div className="flex gap-2">
                        {WEEKDAYS.map((w) => (
                          <button
                            key={w.id}
                            type="button"
                            onClick={() => handleWeekdayToggle(w.id)}
                            className={`w-8 h-8 rounded text-xs font-semibold transition-colors ${
                              formData.selectedDays.includes(w.id)
                                ? 'bg-emerald-700 text-white'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            {w.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Section: Recurrence Edit Scope (Edit Only) */}
          {isEditing && initialData.recurrence_id && (
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg space-y-2">
              <div className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                <Repeat className="w-3.5 h-3.5 text-indigo-600" /> Recurring Series Edit Scope
              </div>
              <div className="space-y-1.5 text-xs text-slate-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="editScope"
                    checked={formData.updateScope === 'single'}
                    onChange={() => setFormData({ ...formData, updateScope: 'single' })}
                    className="text-emerald-700"
                  />
                  <span>Update only this occurrence ({initialData.event_date})</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="editScope"
                    checked={formData.updateScope === 'series'}
                    onChange={() => setFormData({ ...formData, updateScope: 'series' })}
                    className="text-emerald-700"
                  />
                  <span>Update this and all future occurrences in the series</span>
                </label>
              </div>
            </div>
          )}

          {/* Form Actions Footer */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isEditing ? 'Save Changes' : 'Schedule Activity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
