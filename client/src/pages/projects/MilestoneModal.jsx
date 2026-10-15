import React, { useState, useEffect } from 'react';
import { projectsService } from '../../services/api';
import { X, Loader2, AlertCircle, Flag } from 'lucide-react';

export function MilestoneModal({ isOpen, onClose, projectId, milestone = null, onSuccess }) {
  const isEditing = Boolean(milestone);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState('pending');
  const [displayOrder, setDisplayOrder] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (milestone) {
        setTitle(milestone.title || '');
        setDescription(milestone.description || '');
        setDueDate(milestone.due_date ? milestone.due_date.slice(0, 10) : '');
        setStatus(milestone.status || 'pending');
        setDisplayOrder(milestone.display_order ?? 1);
      } else {
        setTitle('');
        setDescription('');
        setDueDate('');
        setStatus('pending');
        setDisplayOrder(1);
      }
      setError('');
    }
  }, [isOpen, milestone]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Milestone title is required.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEditing) {
        await projectsService.updateMilestone(projectId, milestone.id, {
          title: title.trim(),
          description: description.trim() || null,
          dueDate: dueDate || null,
          status,
          displayOrder: Number(displayOrder)
        });
        onSuccess('Milestone updated successfully.');
      } else {
        await projectsService.createMilestone(projectId, {
          title: title.trim(),
          description: description.trim() || null,
          dueDate: dueDate || null,
          status,
          displayOrder: Number(displayOrder)
        });
        onSuccess('Milestone created successfully.');
      }
      onClose();
    } catch (err) {
      console.error(err);
      const msg = typeof err.response?.data?.error === 'object'
        ? err.response?.data?.error?.message
        : err.response?.data?.error || 'Failed to save milestone.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl relative">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600">
              <Flag className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-gray-900 text-lg">
              {isEditing ? 'Edit Milestone' : 'Add Project Milestone'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="my-3 p-3 bg-rose-50 border border-rose-200 rounded text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pt-3 text-sm">
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Milestone Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. UX Wireframe Signoff"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Description / Deliverables
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Key deliverable items required to fulfill this milestone..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Target Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Display Order
              </label>
              <input
                type="number"
                min="1"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 text-sm"
            >
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-2"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEditing ? 'Save Changes' : 'Create Milestone'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
