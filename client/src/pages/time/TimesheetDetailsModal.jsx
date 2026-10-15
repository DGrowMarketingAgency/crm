import React, { useState, useEffect } from 'react';
import { timeService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import {
  Calendar,
  X,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Send,
  Loader2,
  Clock,
  DollarSign,
  User,
  Check,
  Ban
} from 'lucide-react';

const STATUS_BADGES = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  submitted: 'bg-purple-50 text-purple-700 border-purple-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200'
};

export function TimesheetDetailsModal({ isOpen, onClose, timesheetId, onStatusChange }) {
  const { isOwner, hasPermission, user: currentUser } = usePermission();
  const [timesheet, setTimesheet] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Rejection modal state
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const canApprove = isOwner || hasPermission('timesheets.approve');
  const canReject = isOwner || hasPermission('timesheets.reject');

  useEffect(() => {
    if (isOpen && timesheetId) {
      loadTimesheet();
    }
  }, [isOpen, timesheetId]);

  const loadTimesheet = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await timeService.getTimesheet(timesheetId);
      setTimesheet(res.data.timesheet);
    } catch (err) {
      console.error('Failed to load timesheet details:', err);
      setError(err.response?.data?.error?.message || 'Failed to load timesheet');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    setIsProcessing(true);
    setError('');
    try {
      await timeService.submitTimesheet(timesheetId);
      setNotice('Timesheet submitted for approval!');
      await loadTimesheet();
      if (onStatusChange) onStatusChange();
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to submit timesheet');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApprove = async () => {
    if (timesheet?.user_id === currentUser?.id && !isOwner) {
      setError('Self-approval is prohibited. Another manager must review your timesheet.');
      return;
    }

    if (!window.confirm('Are you sure you want to approve this timesheet? All entries will be locked.')) return;
    setIsProcessing(true);
    setError('');
    try {
      await timeService.approveTimesheet(timesheetId);
      setNotice('Timesheet approved successfully!');
      await loadTimesheet();
      if (onStatusChange) onStatusChange();
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to approve timesheet');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (e) => {
    e.preventDefault();
    if (!rejectComment || rejectComment.trim().length < 5) {
      setError('Rejection explanation must be at least 5 characters long');
      return;
    }

    setIsProcessing(true);
    setError('');
    try {
      await timeService.rejectTimesheet(timesheetId, rejectComment.trim());
      setNotice('Timesheet rejected with feedback.');
      setShowRejectBox(false);
      setRejectComment('');
      await loadTimesheet();
      if (onStatusChange) onStatusChange();
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to reject timesheet');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-3xl overflow-hidden animate-in fade-in duration-200 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-100 text-purple-700 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  Timesheet Details
                </h3>
                {timesheet && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${STATUS_BADGES[timesheet.status]}`}>
                    {timesheet.status}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {timesheet ? `${timesheet.period_start?.slice(0, 10)} to ${timesheet.period_end?.slice(0, 10)} • ${timesheet.user_name}` : 'Loading...'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Banners */}
        {notice && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{notice}</span>
          </div>
        )}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {isLoading ? (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
              <p className="text-xs">Loading timesheet entries...</p>
            </div>
          ) : !timesheet ? (
            <p className="text-center py-10 text-xs text-slate-400">Timesheet record not found.</p>
          ) : (
            <>
              {/* Reviewer rejection feedback note */}
              {timesheet.status === 'rejected' && timesheet.reviewer_comment && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-1">
                  <div className="flex items-center gap-1.5 text-rose-900 font-bold text-xs uppercase">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Revisions Required by {timesheet.reviewer_name || 'Reviewer'}</span>
                  </div>
                  <p className="text-xs text-rose-800 italic">"{timesheet.reviewer_comment}"</p>
                </div>
              )}

              {/* Summary Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1">
                  <span className="text-slate-400 block font-medium">Total Tracked</span>
                  <span className="text-lg font-bold text-slate-900">{timesheet.totalHours} hrs</span>
                </div>
                <div className="p-3 bg-emerald-50/70 border border-emerald-200/70 rounded-xl space-y-1">
                  <span className="text-emerald-700 block font-medium">Billable</span>
                  <span className="text-lg font-bold text-emerald-900">{timesheet.billableHours} hrs</span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1">
                  <span className="text-slate-400 block font-medium">Non-Billable</span>
                  <span className="text-lg font-bold text-slate-700">{timesheet.nonBillableHours} hrs</span>
                </div>
                <div className="p-3 bg-purple-50/70 border border-purple-200/70 rounded-xl space-y-1">
                  <span className="text-purple-700 block font-medium">Work Entries</span>
                  <span className="text-lg font-bold text-purple-900">{timesheet.entries?.length || 0}</span>
                </div>
              </div>

              {/* Entries Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Detailed Work Logs for Period
                </h4>
                {timesheet.entries?.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-6 text-center">
                    No work entries attached to this timesheet.
                  </p>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                        <tr>
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Task & Project</th>
                          <th className="py-2.5 px-3">Duration</th>
                          <th className="py-2.5 px-3">Type</th>
                          <th className="py-2.5 px-3">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {timesheet.entries?.map((e) => (
                          <tr key={e.id} className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-3 font-semibold text-slate-700 whitespace-nowrap">
                              {e.work_date?.slice(0, 10)}
                            </td>
                            <td className="py-2.5 px-3 min-w-[160px]">
                              <p className="font-bold text-slate-800">{e.task_title}</p>
                              <p className="text-[10px] text-brand-700 font-medium">
                                {e.task_code} • {e.project_name}
                              </p>
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span className="font-bold text-slate-900">
                                {(e.duration_minutes / 60).toFixed(1)} hrs
                              </span>
                              <span className="text-[10px] text-slate-400 ml-1">
                                ({e.duration_minutes}m)
                              </span>
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {e.is_billable ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                  Billable
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                  Non-billable
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 text-[11px] max-w-[200px] truncate">
                              {e.description || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Reject Reason Box */}
              {showRejectBox && (
                <form onSubmit={handleReject} className="p-4 rounded-xl bg-rose-50/60 border border-rose-200 space-y-3">
                  <label className="block text-xs font-bold text-rose-900 uppercase">
                    Provide Rejection Feedback <span className="text-rose-600">* (Min 5 chars)</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={rejectComment}
                    onChange={(e) => setRejectComment(e.target.value)}
                    placeholder="Specify why this timesheet cannot be approved and what entries need modification..."
                    className="w-full px-3 py-2 text-xs bg-white border border-rose-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowRejectBox(false)}
                      className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isProcessing || !rejectComment || rejectComment.trim().length < 5}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50"
                    >
                      {isProcessing ? 'Submitting...' : 'Confirm Rejection'}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
          >
            Close
          </button>

          {timesheet && (
            <div className="flex items-center gap-2">
              {/* Employee submit action */}
              {(timesheet.status === 'draft' || timesheet.status === 'rejected') &&
                (timesheet.user_id === currentUser?.id || isOwner) && (
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleSubmit}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-brand-700 hover:bg-brand-800 rounded-xl shadow-xs transition disabled:opacity-50"
                  >
                    {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>Submit Timesheet</span>
                  </button>
                )}

              {/* Manager Review actions */}
              {timesheet.status === 'submitted' && (
                <>
                  {canReject && !showRejectBox && (
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => setShowRejectBox(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Request Revisions</span>
                    </button>
                  )}

                  {canApprove && (
                    <button
                      type="button"
                      disabled={isProcessing || (timesheet.user_id === currentUser?.id && !isOwner)}
                      onClick={handleApprove}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-xs transition disabled:opacity-50 disabled:cursor-not-allowed"
                      title={timesheet.user_id === currentUser?.id && !isOwner ? 'Self-approval is prohibited' : 'Approve timesheet'}
                    >
                      {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      <span>Approve Timesheet</span>
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
