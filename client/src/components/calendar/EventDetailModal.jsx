import React, { useState } from 'react';
import {
  X,
  Calendar,
  Clock,
  User,
  Building2,
  Tag,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Globe,
  Share2,
  Layers,
  Repeat,
  FileText,
  ShieldCheck,
  Send
} from 'lucide-react';
import { calendarService } from '../../services/api';

const CATEGORY_COLORS = {
  content_publishing: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  content_production: 'bg-blue-50 text-blue-700 border-blue-200',
  seo_activities: 'bg-purple-50 text-purple-700 border-purple-200',
  agency_operations: 'bg-amber-50 text-amber-700 border-amber-200'
};

const CATEGORY_LABELS = {
  content_publishing: 'Content Publishing',
  content_production: 'Content Production',
  seo_activities: 'SEO Activities',
  agency_operations: 'Agency Operations'
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

const STATUS_LABELS = {
  planned: 'Planned',
  in_production: 'In Production',
  pending_internal_review: 'Internal Review',
  awaiting_client_approval: 'Client Approval',
  scheduled: 'Scheduled',
  completed: 'Completed',
  published: 'Published',
  cancelled: 'Cancelled',
  on_hold: 'On Hold'
};

export function EventDetailModal({
  event,
  isOpen,
  onClose,
  onEdit,
  onDeleted,
  onUpdated,
  canEdit = true,
  canDelete = true,
  canPublish = true,
  isClientUser = false
}) {
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState('');
  const [publishNotes, setPublishNotes] = useState('');
  const [publishError, setPublishError] = useState('');
  const [isSubmittingPublish, setIsSubmittingPublish] = useState(false);
  const [deleteScope, setDeleteScope] = useState('single');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen || !event) return null;

  const categoryColor = CATEGORY_COLORS[event.event_category] || CATEGORY_COLORS.agency_operations;
  const categoryLabel = CATEGORY_LABELS[event.event_category] || event.event_category;
  const statusColor = STATUS_BADGES[event.status] || STATUS_BADGES.planned;
  const statusLabel = STATUS_LABELS[event.status] || event.status;

  const handleRecordPublication = async (e) => {
    e.preventDefault();
    setPublishError('');
    setIsSubmittingPublish(true);
    try {
      const res = await calendarService.publishEvent(event.id, {
        publishedUrl: publishedUrl.trim() || undefined,
        notes: publishNotes.trim() || undefined
      });
      if (onUpdated) onUpdated(res.data.data);
      setIsPublishing(false);
    } catch (err) {
      setPublishError(err.response?.data?.message || err.message || 'Failed to record publication');
    } finally {
      setIsSubmittingPublish(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await calendarService.deleteEvent(event.id, { deleteScope });
      if (onDeleted) onDeleted(event.id, deleteScope);
      onClose();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete event');
    } finally {
      setIsDeleting(false);
      setIsConfirmingDelete(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${categoryColor}`}>
                {categoryLabel}
              </span>
              <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${statusColor}`}>
                {statusLabel}
              </span>
              <span
                className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${
                  event.is_client_visible
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                {event.is_client_visible ? (
                  <span className="flex items-center gap-1">
                    <Eye className="w-3 h-3 text-emerald-600" /> Client Visible
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <EyeOff className="w-3 h-3 text-slate-500" /> Internal Only
                  </span>
                )}
              </span>
              {event.recurrence_id && (
                <span className="px-2 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full flex items-center gap-1">
                  <Repeat className="w-3 h-3" /> Recurring
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-slate-900 leading-snug">{event.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="px-6 py-5 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Key Metas Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200 text-sm">
            <div className="flex items-center gap-3 text-slate-700">
              <Building2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <div className="text-xs text-slate-500 font-medium">Client</div>
                <div className="font-semibold text-slate-900">{event.client_company_name || event.client_name}</div>
              </div>
            </div>

            <div className="flex items-center gap-3 text-slate-700">
              <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <div className="text-xs text-slate-500 font-medium">Scheduled Date</div>
                <div className="font-semibold text-slate-900">
                  {event.event_date}
                  {event.is_all_day ? (
                    <span className="ml-2 text-xs text-slate-500 font-normal">(All Day)</span>
                  ) : event.start_time ? (
                    <span className="ml-2 text-xs text-slate-600 font-normal">
                      {event.start_time.slice(0, 5)} {event.end_time ? `- ${event.end_time.slice(0, 5)}` : ''}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 text-slate-700">
              <Tag className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <div className="text-xs text-slate-500 font-medium">Event Type</div>
                <div className="font-semibold text-slate-900">{event.event_type}</div>
              </div>
            </div>

            <div className="flex items-center gap-3 text-slate-700">
              <User className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <div className="text-xs text-slate-500 font-medium">Assigned To</div>
                <div className="font-semibold text-slate-900">
                  {event.assignee_name ? (
                    <span>
                      {event.assignee_name}{' '}
                      {event.department && <span className="text-xs text-slate-500">({event.department})</span>}
                    </span>
                  ) : (
                    <span className="text-slate-400 italic">Unassigned</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Publishing details (if relevant) */}
          {(event.platform || event.content_format || event.content_summary || event.published_url) && (
            <div className="border border-emerald-100 bg-emerald-50/40 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 text-emerald-900 font-semibold text-sm">
                <Share2 className="w-4 h-4 text-emerald-700" /> Content & Publishing Details
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                {event.platform && (
                  <div>
                    <span className="text-slate-500 font-medium">Platform:</span>{' '}
                    <span className="font-semibold text-slate-800">{event.platform}</span>
                  </div>
                )}
                {event.content_format && (
                  <div>
                    <span className="text-slate-500 font-medium">Format:</span>{' '}
                    <span className="font-semibold text-slate-800">{event.content_format}</span>
                  </div>
                )}
              </div>
              {event.content_summary && (
                <div>
                  <div className="text-xs text-slate-500 font-medium mb-1">Caption / Summary:</div>
                  <div className="p-2.5 bg-white rounded border border-emerald-200 text-xs text-slate-700 whitespace-pre-wrap">
                    {event.content_summary}
                  </div>
                </div>
              )}
              {event.published_url && (
                <div className="pt-1">
                  <a
                    href={event.published_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-semibold hover:text-emerald-800 hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> View Live Publication ({event.published_url})
                  </a>
                  {event.published_at && (
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Published on {new Date(event.published_at).toLocaleString()}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Description</h4>
              <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 p-3 rounded-lg border border-slate-200">
                {event.description}
              </p>
            </div>
          )}

          {/* Linked Task or Project */}
          {(event.project_name || event.linked_task_code || event.service_name) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              {event.project_name && (
                <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                  <div className="text-slate-500 font-medium">Project</div>
                  <div className="font-semibold text-slate-800 truncate">{event.project_name}</div>
                </div>
              )}
              {event.linked_task_code && (
                <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                  <div className="text-slate-500 font-medium">Linked Task</div>
                  <div className="font-semibold text-blue-700 truncate">
                    {event.linked_task_code}: {event.linked_task_title}
                  </div>
                </div>
              )}
              {event.service_name && (
                <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                  <div className="text-slate-500 font-medium">Service</div>
                  <div className="font-semibold text-slate-800 truncate">{event.service_name}</div>
                </div>
              )}
            </div>
          )}

          {/* Client-Facing Notes */}
          {event.client_notes && (
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-600" /> Client Notes
              </h4>
              <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200">
                {event.client_notes}
              </p>
            </div>
          )}

          {/* Internal Notes (strictly confidential to staff) */}
          {!isClientUser && event.internal_notes && (
            <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-3">
              <h4 className="text-xs font-semibold text-amber-900 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-700" /> Confidential Internal Notes
              </h4>
              <p className="text-xs text-amber-950 whitespace-pre-wrap">{event.internal_notes}</p>
            </div>
          )}

          {/* Record Publication Form */}
          {isPublishing && (
            <form onSubmit={handleRecordPublication} className="bg-emerald-50 border border-emerald-300 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-emerald-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" /> Record Live Publication
                </h4>
                <button
                  type="button"
                  onClick={() => setIsPublishing(false)}
                  className="text-slate-400 hover:text-slate-600 text-xs font-medium"
                >
                  Cancel
                </button>
              </div>
              <p className="text-xs text-emerald-800">
                Marking this content as Published verifies that it has been manually or verified posted to the live platform.
              </p>
              {publishError && <div className="text-xs text-rose-600 bg-rose-50 p-2 rounded">{publishError}</div>}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Live URL (Optional)</label>
                <input
                  type="url"
                  placeholder="https://instagram.com/p/..."
                  value={publishedUrl}
                  onChange={(e) => setPublishedUrl(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Publication Notes (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Notes on performance, hashtags used, or client approval confirmation..."
                  value={publishNotes}
                  onChange={(e) => setPublishNotes(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsPublishing(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPublish}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md shadow-sm transition-colors disabled:opacity-50"
                >
                  {isSubmittingPublish ? 'Saving...' : 'Confirm Publication'}
                </button>
              </div>
            </form>
          )}

          {/* Delete Confirmation Box */}
          {isConfirmingDelete && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 space-y-3">
              <h4 className="text-sm font-bold text-rose-900 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-rose-600" /> Confirm Deletion
              </h4>
              <p className="text-xs text-rose-700">
                Are you sure you want to delete this event? This action cannot be undone.
              </p>
              {event.recurrence_id && (
                <div className="text-xs space-y-1.5 text-slate-700 pt-1">
                  <div className="font-semibold text-slate-900">Recurring Series Option:</div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="delScope"
                      checked={deleteScope === 'single'}
                      onChange={() => setDeleteScope('single')}
                      className="text-rose-600"
                    />
                    <span>Delete only this occurrence ({event.event_date})</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="delScope"
                      checked={deleteScope === 'series'}
                      onChange={() => setDeleteScope('series')}
                      className="text-rose-600"
                    />
                    <span>Delete this and all future occurrences in the series</span>
                  </label>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-md shadow-sm disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {canDelete && !isClientUser && !isConfirmingDelete && (
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            )}
            {canPublish && !isClientUser && !isPublishing && event.status !== 'published' && (
              <button
                type="button"
                onClick={() => setIsPublishing(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 bg-emerald-50 border border-emerald-300 rounded-lg transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" /> Record Publication
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {canEdit && !isClientUser && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  if (onEdit) onEdit(event);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-sm transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" /> Edit Event
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
