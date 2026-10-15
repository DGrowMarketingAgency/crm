import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { tasksService, projectsService, approvalsService, timeService, deliverablesService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { TaskModal } from './TaskModal';
import { LogTimeModal } from '../time/LogTimeModal';
import {
  Sparkles,
  CheckSquare,
  ArrowLeft,
  Calendar,
  Clock,
  Square,
  User,
  Users,
  Flag,
  Tag,
  Link as LinkIcon,
  MessageSquare,
  Paperclip,
  History,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Plus,
  Trash2,
  Edit2,
  Download,
  Loader2,
  Play,
  RotateCcw,
  CheckCheck,
  Ban,
  UploadCloud,
  FileText,
  ShieldCheck,
  Send,
  MoreVertical,
  Layers,
  ChevronRight,
  ThumbsUp,
  FileCheck2,
  ExternalLink,
  XCircle,
  Check
} from 'lucide-react';

const STATUS_DETAILS = {
  todo: { label: 'To Do', badge: 'bg-slate-100 text-slate-700 border-slate-200' },
  in_progress: { label: 'In Progress', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  in_review: { label: 'In Review', badge: 'bg-purple-50 text-purple-700 border-purple-200' },
  blocked: { label: 'Blocked', badge: 'bg-rose-50 text-rose-700 border-rose-200' },
  completed: { label: 'Completed', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
};

const PRIORITY_DETAILS = {
  low: { label: 'Low', badge: 'bg-slate-100 text-slate-700 border-slate-200' },
  medium: { label: 'Medium', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  high: { label: 'High', badge: 'bg-orange-50 text-orange-700 border-orange-200' },
  urgent: { label: 'Urgent', badge: 'bg-rose-50 text-rose-700 border-rose-200 font-bold' }
};

export function TaskDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission, isOwner, user: currentUser } = usePermission();

  const [task, setTask] = useState(null);
  const [comments, setComments] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [subtasks, setSubtasks] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [taskDeliverables, setTaskDeliverables] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Active section tab
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'subtasks' | 'comments' | 'attachments' | 'approvals' | 'history'

  // Subtask creation state
  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [isSubmittingSubtask, setIsSubmittingSubtask] = useState(false);

  // Comment state
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentText, setEditingCommentText] = useState('');

  // Attachment state
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  // Transition modal state
  const [transitionModal, setTransitionModal] = useState({ open: false, targetStatus: '', comment: '' });
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Phase 5 Deliverables & Review Modals
  const [submitDeliverableModal, setSubmitDeliverableModal] = useState({
    open: false,
    title: '',
    deliverableType: 'document',
    deliverableUrl: '',
    submissionNotes: '',
    file: null
  });
  const [reviewDeliverableModal, setReviewDeliverableModal] = useState({
    open: false,
    submissionId: null,
    decision: 'approved',
    feedback: ''
  });
  const [clientActionModal, setClientActionModal] = useState({
    open: false,
    submissionId: null,
    action: 'approve',
    reason: ''
  });

  // Legacy Approvals & Review Modals
  const [submitReviewModal, setSubmitReviewModal] = useState({ open: false, notes: '' });
  const [approveModal, setApproveModal] = useState({ open: false, approvalId: null, feedback: '' });
  const [revisionModal, setRevisionModal] = useState({ open: false, approvalId: null, feedback: '' });
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);

  // Edit task modal
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Phase 7 Time Tracking State
  const [activeTimer, setActiveTimer] = useState(null);
  const [taskTimeEntries, setTaskTimeEntries] = useState([]);
  const [taskTimeSummary, setTaskTimeSummary] = useState(null);
  const [isTimerActionLoading, setIsTimerActionLoading] = useState(false);
  const [logTimeModalOpen, setLogTimeModalOpen] = useState(false);
  const [selectedTimeEntry, setSelectedTimeEntry] = useState(null);
  const [stopTimerNoteModal, setStopTimerNoteModal] = useState({ open: false, description: '' });

  // Permissions
  const canUpdate = isOwner || hasPermission('tasks.update');
  const canDelete = isOwner || hasPermission('tasks.delete');
  const canChangeStatus = isOwner || hasPermission('tasks.change_status');
  const canReopen = isOwner || hasPermission('tasks.reopen');
  const canCreateSubtask = isOwner || hasPermission('subtasks.create');
  const canComment = isOwner || hasPermission('task_comments.create');
  const canUploadAttachment = isOwner || hasPermission('task_attachments.upload');

  const canSubmitReview = isOwner || hasPermission('approvals.submit') || hasPermission('deliverables.submit');
  const canApprove = isOwner || hasPermission('approvals.approve') || hasPermission('deliverables.review_internal');
  const canRequestRevision = isOwner || hasPermission('approvals.request_revision') || hasPermission('deliverables.review_internal');
  const canCancelApproval = isOwner || hasPermission('approvals.cancel');

  const canClientApprove = isOwner || hasPermission('deliverables.review_client');
  const canClientRequestRevision = isOwner || hasPermission('deliverables.request_revision');

  const canStartTimer = isOwner || hasPermission('timers.start');
  const canStopTimer = isOwner || hasPermission('timers.stop_own');
  const canCreateTimeEntry = isOwner || hasPermission('time_entries.create');
  const canViewTimeEntries = isOwner || hasPermission('time_entries.view_own') || hasPermission('time_entries.view_all');
  const canManageAllTime = isOwner || hasPermission('time_entries.manage_all');

  useEffect(() => {
    fetchTaskDetails();
  }, [id]);

  const fetchTaskDetails = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await tasksService.getTask(id);
      setTask(res.data.task);

      // Fetch comments, attachments, subtasks, approvals, deliverables, and time tracking in parallel
      const [cRes, aRes, sRes, appRes, delivRes, timerRes, summaryRes, entriesRes] = await Promise.all([
        tasksService.getComments(id).catch(() => ({ data: { comments: [] } })),
        tasksService.getAttachments(id).catch(() => ({ data: { attachments: [] } })),
        tasksService.getSubtasks(id).catch(() => ({ data: { subtasks: [] } })),
        approvalsService.getApprovals(id).catch(() => ({ data: { approvals: [] } })),
        deliverablesService.getTaskDeliverables(id).catch(() => ({ data: { submissions: [] } })),
        timeService.getActiveTimer().catch(() => ({ data: { timer: null } })),
        timeService.getTaskTimeSummary(id).catch(() => ({ data: { summary: null } })),
        timeService.getTimeEntries({ taskId: id, limit: 100 }).catch(() => ({ data: { entries: [] } }))
      ]);

      setComments(cRes.data.comments || []);
      setAttachments(aRes.data.attachments || []);
      setSubtasks(sRes.data.subtasks || []);
      setApprovals(appRes.data.approvals || []);
      setTaskDeliverables(delivRes.data?.submissions || []);
      setActiveTimer(timerRes.data.timer || null);
      setTaskTimeSummary(summaryRes.data.summary || null);
      setTaskTimeEntries(entriesRes.data.entries || []);
    } catch (err) {
      const errMsg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        (typeof err.response?.data?.error === 'string' ? err.response?.data?.error : null) ||
        'Failed to load task details. You may lack access to this project.';
      setError(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const reloadTimeData = async () => {
    try {
      const [timerRes, summaryRes, entriesRes] = await Promise.all([
        timeService.getActiveTimer().catch(() => ({ data: { timer: null } })),
        timeService.getTaskTimeSummary(id).catch(() => ({ data: { summary: null } })),
        timeService.getTimeEntries({ taskId: id, limit: 100 }).catch(() => ({ data: { entries: [] } }))
      ]);
      setActiveTimer(timerRes.data.timer || null);
      setTaskTimeSummary(summaryRes.data.summary || null);
      setTaskTimeEntries(entriesRes.data.entries || []);
    } catch (err) {
      console.error('Failed to reload time data:', err);
    }
  };

  const handleStartTimer = async () => {
    if (!task) return;
    setIsTimerActionLoading(true);
    setError('');
    try {
      const res = await timeService.startTimer(task.id, task.project_id);
      setActiveTimer(res.data.timer);
      window.dispatchEvent(new Event('active-timer-changed'));
      setNotice('Timer started for this task');
      setTimeout(() => setNotice(''), 3500);
    } catch (err) {
      console.error('Failed to start timer:', err);
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to start timer');
    } finally {
      setIsTimerActionLoading(false);
    }
  };

  const handleStopTimer = async () => {
    if (!activeTimer) return;
    setIsTimerActionLoading(true);
    setError('');
    try {
      await timeService.stopTimer(activeTimer.id, stopTimerNoteModal.description);
      setStopTimerNoteModal({ open: false, description: '' });
      window.dispatchEvent(new Event('active-timer-changed'));
      setNotice('Timer stopped and work logged successfully');
      setTimeout(() => setNotice(''), 3500);
      await reloadTimeData();
    } catch (err) {
      console.error('Failed to stop timer:', err);
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to stop timer');
    } finally {
      setIsTimerActionLoading(false);
    }
  };

  const handleDeleteTimeEntry = async (entryId) => {
    if (!window.confirm('Are you sure you want to delete this time entry?')) return;
    try {
      await timeService.deleteTimeEntry(entryId);
      setNotice('Time entry deleted');
      setTimeout(() => setNotice(''), 3500);
      await reloadTimeData();
    } catch (err) {
      console.error('Failed to delete time entry:', err);
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to delete time entry');
    }
  };

  // Workflow Status Transition
  const handleInitiateTransition = (targetStatus) => {
    setTransitionModal({ open: true, targetStatus, comment: '' });
  };

  const handleConfirmTransition = async () => {
    if (!transitionModal.targetStatus) return;
    setIsTransitioning(true);
    setError('');

    try {
      if (transitionModal.targetStatus === 'in_progress' && task.status === 'completed') {
        // Reopen call
        await tasksService.reopenTask(task.id, transitionModal.comment);
        setNotice('Task reopened successfully');
      } else {
        await tasksService.changeStatus(task.id, transitionModal.targetStatus, transitionModal.comment);
        setNotice(`Task status updated to ${transitionModal.targetStatus.replace('_', ' ')}`);
      }

      setTransitionModal({ open: false, targetStatus: '', comment: '' });
      await fetchTaskDetails();
      setTimeout(() => setNotice(''), 3500);
    } catch (err) {
      const errMsg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        (typeof err.response?.data?.error === 'string' ? err.response?.data?.error : null) ||
        'Status transition rejected. Invalid transition or missing permission.';
      setError(errMsg);
    } finally {
      setIsTransitioning(false);
    }
  };

  // Subtask handlers
  const handleAddSubtask = async (e) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;

    setIsSubmittingSubtask(true);
    try {
      await tasksService.createSubtask(task.id, {
        title: newSubtaskTitle.trim(),
        priority: 'medium'
      });
      setNewSubtaskTitle('');
      setShowAddSubtask(false);
      setNotice('Subtask created');
      await fetchTaskDetails();
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      console.error('Add subtask error:', err);
      setError(err.response?.data?.message || 'Failed to create subtask');
    } finally {
      setIsSubmittingSubtask(false);
    }
  };

  // Comment Handlers
  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setIsSubmittingComment(true);
    try {
      await tasksService.createComment(task.id, newComment.trim());
      setNewComment('');
      const cRes = await tasksService.getComments(task.id);
      setComments(cRes.data.comments || []);
    } catch (err) {
      console.error('Add comment error:', err);
      setError(err.response?.data?.message || 'Failed to post comment');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleUpdateComment = async (commentId) => {
    if (!editingCommentText.trim()) return;
    try {
      await tasksService.updateComment(task.id, commentId, editingCommentText.trim());
      setEditingCommentId(null);
      setEditingCommentText('');
      const cRes = await tasksService.getComments(task.id);
      setComments(cRes.data.comments || []);
    } catch (err) {
      console.error('Update comment error:', err);
      setError(err.response?.data?.message || 'Failed to update comment');
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Are you sure you want to delete this comment?')) return;
    try {
      await tasksService.deleteComment(task.id, commentId);
      const cRes = await tasksService.getComments(task.id);
      setComments(cRes.data.comments || []);
    } catch (err) {
      console.error('Delete comment error:', err);
      setError(err.response?.data?.message || 'Failed to delete comment');
    }
  };

  // Attachment Handlers
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError('File size exceeds the 10MB limit');
      return;
    }

    const formData = new FormData();
    formData.append('attachment', file);

    setIsUploading(true);
    setError('');
    try {
      await tasksService.uploadAttachment(task.id, formData);
      setNotice('Attachment uploaded successfully');
      const aRes = await tasksService.getAttachments(task.id);
      setAttachments(aRes.data.attachments || []);
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      console.error('File upload error:', err);
      setError(err.response?.data?.message || 'Failed to upload attachment');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleDownloadAttachment = async (attachmentId, originalFilename) => {
    try {
      const res = await tasksService.downloadAttachment(task.id, attachmentId);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', originalFilename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Download error:', err);
      setError('Failed to download attachment');
    }
  };

  const handleDeleteAttachment = async (attachmentId) => {
    if (!window.confirm('Are you sure you want to delete this attachment?')) return;
    try {
      await tasksService.deleteAttachment(task.id, attachmentId);
      setNotice('Attachment removed');
      const aRes = await tasksService.getAttachments(task.id);
      setAttachments(aRes.data.attachments || []);
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      console.error('Delete attachment error:', err);
      setError(err.response?.data?.message || 'Failed to delete attachment');
    }
  };

  // Archive Task Handler
  const handleArchiveTask = async () => {
    if (!window.confirm('Are you sure you want to archive this task?')) return;
    try {
      await tasksService.archiveTask(task.id);
      navigate('/tasks');
    } catch (err) {
      console.error('Archive task error:', err);
      setError(err.response?.data?.message || 'Failed to archive task');
    }
  };

  // Phase 6 Approval Workflow Handlers
  const handleConfirmSubmitReview = async () => {
    setIsSubmittingApproval(true);
    setError('');
    try {
      await approvalsService.submitReview(task.id, submitReviewModal.notes?.trim() || null);
      setNotice('Task submitted for review successfully');
      setSubmitReviewModal({ open: false, notes: '' });
      await fetchTaskDetails();
      setTimeout(() => setNotice(''), 3500);
    } catch (err) {
      console.error('Submit review error:', err);
      setError(err.response?.data?.message || 'Failed to submit task for review');
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  const handleConfirmApprove = async () => {
    setIsSubmittingApproval(true);
    setError('');
    try {
      await approvalsService.approve(task.id, approveModal.approvalId, approveModal.feedback?.trim() || null);
      setNotice('Task submission approved! Task marked as completed.');
      setApproveModal({ open: false, approvalId: null, feedback: '' });
      await fetchTaskDetails();
      setTimeout(() => setNotice(''), 3500);
    } catch (err) {
      console.error('Approve task error:', err);
      setError(err.response?.data?.message || 'Failed to approve task submission');
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  const handleConfirmRevision = async () => {
    if (!revisionModal.feedback || revisionModal.feedback.trim().length < 5) {
      setError('Revision feedback is required and must be at least 5 characters');
      return;
    }
    setIsSubmittingApproval(true);
    setError('');
    try {
      await approvalsService.requestRevision(task.id, revisionModal.approvalId, revisionModal.feedback.trim());
      setNotice('Revisions requested. Task returned to In Progress.');
      setRevisionModal({ open: false, approvalId: null, feedback: '' });
      await fetchTaskDetails();
      setTimeout(() => setNotice(''), 3500);
    } catch (err) {
      console.error('Request revision error:', err);
      setError(err.response?.data?.message || 'Failed to request revisions');
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  const handleCancelApproval = async (approvalId) => {
    if (!window.confirm('Are you sure you want to cancel this review request?')) return;
    setIsSubmittingApproval(true);
    setError('');
    try {
      await approvalsService.cancel(task.id, approvalId);
      setNotice('Review request cancelled. Task returned to In Progress.');
      await fetchTaskDetails();
      setTimeout(() => setNotice(''), 3500);
    } catch (err) {
      console.error('Cancel review error:', err);
      setError(err.response?.data?.message || 'Failed to cancel review request');
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  // Phase 5 Deliverable Workflow Handlers
  const handleSubmitDeliverable = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setIsSubmittingApproval(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('title', submitDeliverableModal.title?.trim() || task.title);
      formData.append('deliverableType', submitDeliverableModal.deliverableType || 'document');
      if (submitDeliverableModal.deliverableUrl) {
        formData.append('deliverableUrl', submitDeliverableModal.deliverableUrl.trim());
      }
      if (submitDeliverableModal.submissionNotes) {
        formData.append('submissionNotes', submitDeliverableModal.submissionNotes.trim());
      }
      if (submitDeliverableModal.file) {
        formData.append('file', submitDeliverableModal.file);
      }
      await deliverablesService.submitReview(task.id, formData);
      setNotice('Deliverable submitted for internal review successfully!');
      setSubmitDeliverableModal({
        open: false,
        title: '',
        deliverableType: 'document',
        deliverableUrl: '',
        submissionNotes: '',
        file: null
      });
      await fetchTaskDetails();
      setTimeout(() => setNotice(''), 3500);
    } catch (err) {
      console.error('Submit deliverable error:', err);
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to submit deliverable');
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  const handleInternalReviewDecision = async () => {
    setIsSubmittingApproval(true);
    setError('');
    try {
      await deliverablesService.reviewInternal(reviewDeliverableModal.submissionId, {
        decision: reviewDeliverableModal.decision,
        feedback: reviewDeliverableModal.feedback?.trim() || null
      });
      setNotice(
        reviewDeliverableModal.decision === 'approved'
          ? 'Deliverable internally approved!'
          : 'Changes requested. Task returned to employee for rework.'
      );
      setReviewDeliverableModal({ open: false, submissionId: null, decision: 'approved', feedback: '' });
      await fetchTaskDetails();
      setTimeout(() => setNotice(''), 3500);
    } catch (err) {
      console.error('Internal review error:', err);
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to record review decision');
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  const handleClientAction = async () => {
    setIsSubmittingApproval(true);
    setError('');
    try {
      if (clientActionModal.action === 'approve') {
        await deliverablesService.clientApprove(clientActionModal.submissionId, {
          feedback: clientActionModal.reason?.trim() || null
        });
        setNotice('Deliverable approved! Task marked complete.');
      } else {
        if (!clientActionModal.reason || clientActionModal.reason.trim().length < 5) {
          setError('A clear revision reason of at least 5 characters is required');
          setIsSubmittingApproval(false);
          return;
        }
        await deliverablesService.clientRequestRevision(clientActionModal.submissionId, {
          revisionReason: clientActionModal.reason.trim()
        });
        setNotice('Revision requested. Assigned team notified for rework.');
      }
      setClientActionModal({ open: false, submissionId: null, action: 'approve', reason: '' });
      await fetchTaskDetails();
      setTimeout(() => setNotice(''), 3500);
    } catch (err) {
      console.error('Client action error:', err);
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to record decision');
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-slate-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
        <p className="text-sm font-medium">Loading task workspace...</p>
      </div>
    );
  }

  if (error && !task) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 mb-1">Access Restricted</h2>
        <p className="text-sm text-slate-500 mb-6">{error}</p>
        <button
          onClick={() => navigate('/tasks')}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-xl transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Tasks</span>
        </button>
      </div>
    );
  }

  const statusConfig = STATUS_DETAILS[task.status] || STATUS_DETAILS.todo;
  const priorityConfig = PRIORITY_DETAILS[task.priority] || PRIORITY_DETAILS.medium;
  const isOverdue =
    task.due_date && task.status !== 'completed' && new Date(task.due_date) < new Date();

  // Phase 6 Approvals helper state
  const activePendingApproval = approvals.find((a) => a.status === 'pending');
  const lastReviewedApproval = approvals.find((a) => a.status !== 'pending');
  const isSubmitter = activePendingApproval?.submitted_by === currentUser?.id;
  const hasRevisionRequested = approvals.some((a) => a.status === 'revision_requested');

  // Parse labels
  let labelsList = [];
  if (Array.isArray(task.labels)) {
    labelsList = task.labels;
  } else if (typeof task.labels === 'string') {
    try {
      labelsList = JSON.parse(task.labels);
    } catch {
      labelsList = [task.labels];
    }
  }

  // Calculate subtask stats
  const totalSubtasks = subtasks.length;
  const completedSubtasks = subtasks.filter((s) => s.status === 'completed').length;
  const subtaskProgress =
    totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Navigation Breadcrumb & Back */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/tasks')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200/80 px-3 py-1.5 rounded-lg shadow-2xs transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>All Tasks</span>
        </button>

        <div className="flex items-center gap-2">
          {canUpdate && (
            <button
              onClick={() => setEditModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-2xs transition"
            >
              <Edit2 className="w-3.5 h-3.5 text-slate-500" />
              <span>Edit Details</span>
            </button>
          )}

          {canDelete && (
            <button
              onClick={handleArchiveTask}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200/80 hover:bg-rose-100 rounded-lg transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Archive</span>
            </button>
          )}
        </div>
      </div>

      {/* Notice & Error banners */}
      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{notice}</span>
          </div>
          <button onClick={() => setNotice('')} className="text-xs font-semibold text-emerald-700">
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="text-xs font-semibold text-rose-700">
            Dismiss
          </button>
        </div>
      )}

      {/* Active Pending Approval Banner */}
      {task.status === 'in_review' && activePendingApproval && (
        <div className="bg-purple-50/80 border border-purple-200/90 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-lg bg-purple-100 text-purple-700">
                <FileCheck2 className="w-4 h-4" />
              </span>
              <h3 className="text-sm font-bold text-purple-950">
                Task Under Formal Review
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-200/70 text-purple-800 uppercase tracking-wider">
                Pending Decision
              </span>
            </div>
            <p className="text-xs text-purple-800">
              Submitted by <span className="font-semibold">{activePendingApproval.submitter_name}</span> on{' '}
              {new Date(activePendingApproval.submitted_at || activePendingApproval.created_at).toLocaleString()}
            </p>
            {activePendingApproval.submission_notes && (
              <div className="mt-2 text-xs bg-white/80 border border-purple-100 p-2.5 rounded-xl text-slate-800 italic">
                "{activePendingApproval.submission_notes}"
              </div>
            )}
            {isSubmitter && !isOwner && (
              <p className="text-[11px] font-medium text-purple-700 flex items-center gap-1 pt-1">
                <AlertCircle className="w-3.5 h-3.5 text-purple-600" />
                <span>You submitted this task for review. Self-approval is prohibited; another authorized reviewer must approve.</span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {canApprove && (
              <button
                type="button"
                disabled={isSubmitter && !isOwner}
                onClick={() => setApproveModal({ open: true, approvalId: activePendingApproval.id, feedback: '' })}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-xs transition disabled:opacity-40 disabled:cursor-not-allowed"
                title={isSubmitter && !isOwner ? 'Self-approval is prohibited' : 'Approve submission and complete task'}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Approve</span>
              </button>
            )}

            {canRequestRevision && (
              <button
                type="button"
                onClick={() => setRevisionModal({ open: true, approvalId: activePendingApproval.id, feedback: '' })}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300/80 rounded-xl transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Request Revisions</span>
              </button>
            )}

            {(canCancelApproval || isOwner || isSubmitter) && (
              <button
                type="button"
                disabled={isSubmittingApproval}
                onClick={() => handleCancelApproval(activePendingApproval.id)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/80 rounded-xl transition"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Revision Requested Notice Banner */}
      {task.status === 'in_progress' && lastReviewedApproval?.status === 'revision_requested' && (
        <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-lg bg-amber-100 text-amber-800">
                <AlertTriangle className="w-4 h-4" />
              </span>
              <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                Revisions Requested by {lastReviewedApproval.reviewer_name || 'Reviewer'}
              </h4>
            </div>
            <p className="text-xs text-amber-900 font-medium">
              "{lastReviewedApproval.reviewer_feedback}"
            </p>
            <p className="text-[11px] text-amber-700">
              Reviewed on {new Date(lastReviewedApproval.reviewed_at || lastReviewedApproval.created_at).toLocaleString()}
            </p>
          </div>

          {canSubmitReview && (
            <button
              onClick={() => setSubmitReviewModal({ open: true, notes: '' })}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs transition shrink-0 self-start md:self-auto"
            >
              <FileCheck2 className="w-3.5 h-3.5" />
              <span>Resubmit for Review</span>
            </button>
          )}
        </div>
      )}

      {/* Main Task Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
                {task.task_code || `#${task.id}`}
              </span>

              {task.project_id && (
                <Link
                  to={`/projects/${task.project_id}`}
                  className="text-xs font-semibold text-brand-700 bg-brand-50 px-2.5 py-1 rounded-md hover:bg-brand-100 transition inline-flex items-center gap-1"
                >
                  <Layers className="w-3 h-3" />
                  <span>{task.project_name || 'Project'}</span>
                </Link>
              )}

              {task.milestone_name && (
                <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md">
                  🏁 {task.milestone_name}
                </span>
              )}

              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${statusConfig.badge}`}
              >
                {statusConfig.label}
              </span>

              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${priorityConfig.badge}`}
              >
                Priority: {priorityConfig.label}
              </span>

              {isOverdue && (
                <span className="text-xs font-bold text-rose-700 bg-rose-100 border border-rose-200 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  <span>Overdue</span>
                </span>
              )}
            </div>

            <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-snug">
              {task.title}
            </h1>
          </div>

          {/* Workflow Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {canChangeStatus && (
              <>
                {task.status === 'todo' && (
                  <button
                    onClick={() => handleInitiateTransition('in_progress')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Start Progress</span>
                  </button>
                )}

                {task.status === 'in_progress' && (
                  <>
                    {canSubmitReview && (
                      <button
                        onClick={() => setSubmitReviewModal({ open: true, notes: '' })}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs transition"
                      >
                        <FileCheck2 className="w-3.5 h-3.5" />
                        <span>{hasRevisionRequested ? 'Resubmit for Review' : 'Submit Review'}</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleInitiateTransition('blocked')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-xl transition"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Block</span>
                    </button>
                    <button
                      onClick={() => handleInitiateTransition('completed')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-xs transition"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Complete</span>
                    </button>
                  </>
                )}

                {task.status === 'in_review' && (
                  <>
                    {activePendingApproval ? (
                      <>
                        <button
                          disabled={isSubmitter && !isOwner}
                          onClick={() => setApproveModal({ open: true, approvalId: activePendingApproval.id, feedback: '' })}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-xs transition disabled:opacity-40 disabled:cursor-not-allowed"
                          title={isSubmitter && !isOwner ? 'Self-approval is prohibited' : 'Approve submission'}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Approve</span>
                        </button>
                        <button
                          onClick={() => setRevisionModal({ open: true, approvalId: activePendingApproval.id, feedback: '' })}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-xl transition"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Request Revisions</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleInitiateTransition('in_progress')}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Revise Work</span>
                        </button>
                        <button
                          onClick={() => handleInitiateTransition('completed')}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-xs transition"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Approve & Complete</span>
                        </button>
                      </>
                    )}
                  </>
                )}

                {task.status === 'blocked' && (
                  <button
                    onClick={() => handleInitiateTransition('in_progress')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Unblock & Resume</span>
                  </button>
                )}
              </>
            )}

            {task.status === 'completed' && canReopen && (
              <button
                onClick={() => handleInitiateTransition('in_progress')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reopen Task</span>
              </button>
            )}

            {/* Phase 7: Time Tracking Actions */}
            {activeTimer && Number(activeTimer.task_id) === Number(task.id) ? (
              <button
                type="button"
                onClick={() => setStopTimerNoteModal({ open: true, description: '' })}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition animate-pulse"
                title="Stop active timer and record work log"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop Timer</span>
              </button>
            ) : canStartTimer ? (
              <button
                type="button"
                disabled={isTimerActionLoading}
                onClick={handleStartTimer}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl shadow-xs transition"
                title="Start timer for this task"
              >
                <Play className="w-3.5 h-3.5 text-emerald-600 fill-emerald-600" />
                <span>Start Timer</span>
              </button>
            ) : null}

            {canCreateTimeEntry && (
              <button
                type="button"
                onClick={() => {
                  setSelectedTimeEntry(null);
                  setLogTimeModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-xl shadow-xs transition"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Log Time</span>
              </button>
            )}
          </div>
        </div>

        {/* Quick Meta Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-100 text-xs">
          <div>
            <span className="text-slate-400 block font-medium">Start Date</span>
            <span className="font-semibold text-slate-700">
              {task.start_date ? task.start_date.slice(0, 10) : 'Not specified'}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">Due Date</span>
            <span
              className={`font-semibold ${
                isOverdue ? 'text-rose-600 font-bold' : 'text-slate-700'
              }`}
            >
              {task.due_date ? task.due_date.slice(0, 10) : 'No deadline'}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">Estimated Effort</span>
            <span className="font-semibold text-slate-700">
              {task.estimated_minutes
                ? `${(task.estimated_minutes / 60).toFixed(1)} hrs (${task.estimated_minutes} min)`
                : 'Not specified'}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">Created By</span>
            <span className="font-semibold text-slate-700 truncate block">
              {task.creator_name || 'System Admin'}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-px">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition border-b-2 flex items-center gap-1.5 ${
            activeTab === 'overview'
              ? 'border-brand-600 text-brand-700 bg-white font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Overview</span>
        </button>

        <button
          onClick={() => setActiveTab('subtasks')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition border-b-2 flex items-center gap-1.5 ${
            activeTab === 'subtasks'
              ? 'border-brand-600 text-brand-700 bg-white font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <CheckSquare className="w-3.5 h-3.5" />
          <span>Subtasks ({subtasks.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('comments')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition border-b-2 flex items-center gap-1.5 ${
            activeTab === 'comments'
              ? 'border-brand-600 text-brand-700 bg-white font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Discussion ({comments.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('attachments')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition border-b-2 flex items-center gap-1.5 ${
            activeTab === 'attachments'
              ? 'border-brand-600 text-brand-700 bg-white font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Paperclip className="w-3.5 h-3.5" />
          <span>Attachments ({attachments.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('approvals')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition border-b-2 flex items-center gap-1.5 ${
            activeTab === 'approvals'
              ? 'border-brand-600 text-brand-700 bg-white font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileCheck2 className="w-3.5 h-3.5" />
          <span>Approvals ({approvals.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition border-b-2 flex items-center gap-1.5 ${
            activeTab === 'history'
              ? 'border-brand-600 text-brand-700 bg-white font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Status History</span>
        </button>

        {canViewTimeEntries && (
          <button
            onClick={() => setActiveTab('time')}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition border-b-2 flex items-center gap-1.5 ${
              activeTab === 'time'
                ? 'border-brand-600 text-brand-700 bg-white font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Time & Logs ({taskTimeEntries.length})</span>
          </button>
        )}
      </div>

      {/* TAB CONTENT AREAS */}

      {/* 1. OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Description & References */}
          <div className="lg:col-span-2 space-y-6">
            {/* Description */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                Task Description & Specs
              </h3>
              {task.description ? (
                <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {task.description}
                </div>
              ) : (
                <p className="text-sm text-slate-400 italic">No description provided for this task.</p>
              )}

              {/* Reference URL */}
              {task.reference_url && (
                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-2 text-xs">
                  <span className="text-slate-500 font-semibold">Reference:</span>
                  <a
                    href={task.reference_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-700 hover:underline flex items-center gap-1 font-mono font-medium truncate"
                  >
                    <span>{task.reference_url}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                </div>
              )}

              {/* Labels */}
              {labelsList.length > 0 && (
                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  <Tag className="w-3.5 h-3.5 text-slate-400" />
                  {labelsList.map((tag, idx) => (
                    <span
                      key={idx}
                      className="text-xs font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Subtask Overview Widget */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Subtask Progress ({completedSubtasks}/{totalSubtasks})
                </h3>
                <span className="text-xs font-bold text-brand-700">{subtaskProgress}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 mb-4 overflow-hidden">
                <div
                  className="bg-brand-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${subtaskProgress}%` }}
                />
              </div>
              {subtasks.length > 0 ? (
                <div className="space-y-2">
                  {subtasks.slice(0, 3).map((st) => (
                    <div
                      key={st.id}
                      onClick={() => navigate(`/tasks/${st.id}`)}
                      className="p-2.5 rounded-xl border border-slate-100 hover:border-slate-200 flex items-center justify-between text-xs hover:bg-slate-50 cursor-pointer transition"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckSquare
                          className={`w-3.5 h-3.5 shrink-0 ${
                            st.status === 'completed' ? 'text-emerald-600' : 'text-slate-400'
                          }`}
                        />
                        <span
                          className={`truncate font-medium ${
                            st.status === 'completed'
                              ? 'line-through text-slate-400'
                              : 'text-slate-800'
                          }`}
                        >
                          {st.title}
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded uppercase">
                        {st.status.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                  {subtasks.length > 3 && (
                    <button
                      onClick={() => setActiveTab('subtasks')}
                      className="text-xs font-semibold text-brand-700 hover:underline pt-1"
                    >
                      View all {subtasks.length} subtasks →
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No subtasks defined yet.</p>
              )}
            </div>
          </div>

          {/* Right Col: Assignees & Project details */}
          <div className="space-y-6">
            {/* Assignees Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  <span>Assignees ({(task.assignees || []).length})</span>
                </h3>
              </div>

              {(task.assignees || []).length === 0 ? (
                <p className="text-xs text-slate-400 italic py-2">
                  No assignees assigned to this task.
                </p>
              ) : (
                <div className="space-y-3">
                  {(task.assignees || []).map((a) => (
                    <div
                      key={a.id || a.user_id}
                      className="flex items-center gap-3 p-2 rounded-xl bg-slate-50 border border-slate-100"
                    >
                      <div className="w-8 h-8 rounded-lg bg-brand-700 text-white font-bold text-xs flex items-center justify-center shrink-0">
                        {a.name?.charAt(0).toUpperCase() || 'U'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-800 truncate">{a.name}</p>
                        <p className="text-[11px] text-slate-400 truncate">{a.email}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Parent Task Card (if this is a subtask) */}
            {task.parent_task_id && (
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Parent Task
                </h3>
                <Link
                  to={`/tasks/${task.parent_task_id}`}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/70 hover:bg-slate-100 transition group"
                >
                  <div className="min-w-0">
                    <span className="text-[10px] font-mono font-bold text-brand-700 uppercase">
                      Parent Item
                    </span>
                    <p className="text-xs font-bold text-slate-800 truncate group-hover:text-brand-700 transition">
                      View Parent Task Details
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-brand-700" />
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. SUBTASKS TAB */}
      {activeTab === 'subtasks' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Task Hierarchy & Subtasks</h3>
              <p className="text-xs text-slate-500">
                Break work into independent checkable subtasks under the same project
              </p>
            </div>

            {canCreateSubtask && (
              <button
                onClick={() => setShowAddSubtask(!showAddSubtask)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-brand-700 hover:bg-brand-800 rounded-xl transition self-start sm:self-auto"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Subtask</span>
              </button>
            )}
          </div>

          {/* Inline Add Subtask Form */}
          {showAddSubtask && (
            <form
              onSubmit={handleAddSubtask}
              className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3"
            >
              <label className="block text-xs font-semibold text-slate-700 uppercase">
                New Subtask Title
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  placeholder="e.g. Write integration test for webhook payload"
                  className="flex-1 px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
                <button
                  type="submit"
                  disabled={isSubmittingSubtask}
                  className="px-4 py-2 text-xs font-bold text-white bg-brand-700 hover:bg-brand-800 rounded-xl transition disabled:opacity-50"
                >
                  {isSubmittingSubtask ? 'Adding...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddSubtask(false)}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Subtasks List */}
          {subtasks.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <CheckSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs">No subtasks recorded yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {subtasks.map((st) => (
                <div
                  key={st.id}
                  className="py-3 flex items-center justify-between gap-4 hover:bg-slate-50/50 px-2 rounded-xl transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-[11px] font-mono font-bold text-slate-400">
                      {st.task_code || `#${st.id}`}
                    </span>
                    <Link
                      to={`/tasks/${st.id}`}
                      className={`text-sm font-semibold truncate hover:text-brand-700 transition ${
                        st.status === 'completed'
                          ? 'line-through text-slate-400'
                          : 'text-slate-800'
                      }`}
                    >
                      {st.title}
                    </Link>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        STATUS_DETAILS[st.status]?.badge || 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {STATUS_DETAILS[st.status]?.label || st.status}
                    </span>
                    <Link
                      to={`/tasks/${st.id}`}
                      className="p-1 text-slate-400 hover:text-brand-700"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. COMMENTS & DISCUSSION TAB */}
      {activeTab === 'comments' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-6">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900">Task Discussion</h3>
            <p className="text-xs text-slate-500">
              Collaborate and communicate with authorized team members on this task
            </p>
          </div>

          {/* New Comment Input */}
          {canComment && (
            <form onSubmit={handleAddComment} className="space-y-3">
              <textarea
                rows={3}
                required
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Write a comment or status update..."
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900 placeholder:text-slate-400 transition"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmittingComment || !newComment.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-brand-700 hover:bg-brand-800 rounded-xl shadow-xs transition disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmittingComment ? 'Posting...' : 'Post Comment'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Comments Thread */}
          <div className="space-y-4 pt-2">
            {comments.length === 0 ? (
              <p className="text-center py-10 text-xs text-slate-400 italic">
                No discussion comments yet. Be the first to share an update.
              </p>
            ) : (
              comments.map((c) => {
                const isOwnComment = currentUser?.id === c.user_id;

                return (
                  <div
                    key={c.id}
                    className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/70 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-brand-700 text-white font-bold text-xs flex items-center justify-center">
                          {c.user_name?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-800">{c.user_name}</span>
                          <span className="text-[10px] text-slate-400 ml-2">
                            {new Date(c.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Edit / Delete own comment */}
                      {(isOwnComment || isOwner) && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setEditingCommentId(c.id);
                              setEditingCommentText(c.comment_text);
                            }}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded"
                            title="Edit"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteComment(c.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Comment Body or Inline Editor */}
                    {editingCommentId === c.id ? (
                      <div className="space-y-2 pt-1">
                        <textarea
                          rows={2}
                          value={editingCommentText}
                          onChange={(e) => setEditingCommentText(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setEditingCommentId(null)}
                            className="px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200 rounded"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleUpdateComment(c.id)}
                            className="px-3 py-1 text-xs font-bold text-white bg-brand-700 rounded"
                          >
                            Update
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                        {c.comment_text}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 4. ATTACHMENTS TAB */}
      {activeTab === 'attachments' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Task Attachments & Deliverables</h3>
              <p className="text-xs text-slate-500">
                Securely uploaded documents, specifications, and files (Max 10MB per file)
              </p>
            </div>

            {canUploadAttachment && (
              <label className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-brand-700 hover:bg-brand-800 rounded-xl cursor-pointer shadow-xs transition">
                <UploadCloud className="w-4 h-4" />
                <span>{isUploading ? 'Uploading...' : 'Upload File'}</span>
                <input
                  type="file"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Attachments List */}
          {attachments.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Paperclip className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs">No files attached to this task yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-brand-50 border border-brand-100 text-brand-700 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 truncate" title={att.original_filename}>
                        {att.original_filename}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {(att.file_size / 1024).toFixed(1)} KB • {att.uploader_name}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      onClick={() => handleDownloadAttachment(att.id, att.original_filename)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg transition"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download</span>
                    </button>
                    {(currentUser?.id === att.uploaded_by || isOwner) && (
                      <button
                        onClick={() => handleDeleteAttachment(att.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. APPROVALS TAB (PHASE 5 WORKFLOW LIFECYCLE) */}
      {activeTab === 'approvals' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Review & Client Approval Lifecycle</h3>
                <span className="text-[11px] font-mono px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-bold">
                  Phase 5
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Multi-version deliverables, internal AM signoff, client portal approvals, and rework cycles
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {task.status === 'in_progress' && canSubmitReview && (
                <button
                  onClick={() =>
                    setSubmitDeliverableModal({
                      open: true,
                      title: task.title,
                      deliverableType: task.expected_deliverable_type || 'document',
                      deliverableUrl: task.deliverable_url || '',
                      submissionNotes: '',
                      file: null
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-xs transition"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>
                    {task.revision_count > 0 || taskDeliverables.length > 0
                      ? `Submit Revised Version (v${(taskDeliverables[0]?.version_number || 0) + 1})`
                      : 'Submit Deliverable for Review'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Workflow Requirements Summary Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Internal Review</span>
              <span className="font-semibold text-slate-800 flex items-center gap-1 mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                {task.requires_internal_review ? 'Mandatory AM Review' : 'Optional'}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Client Approval</span>
              <span className="font-semibold text-slate-800 flex items-center gap-1 mt-0.5">
                {task.requires_client_approval || task.is_client_deliverable ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                    <span>Required in Portal</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-3.5 h-3.5 text-slate-400" />
                    <span>Internal Task Only</span>
                  </>
                )}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Deliverable Mandate</span>
              <span className="font-semibold text-slate-800 capitalize mt-0.5 block">
                {task.requires_deliverable ? `${task.expected_deliverable_type || 'Document'} Required` : 'Flexible / Optional'}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Revision Cycles</span>
              <span className="font-semibold text-slate-800 mt-0.5 block">
                {task.revision_count || 0} rework cycles recorded
              </span>
            </div>
          </div>

          {/* Deliverables Submissions List */}
          {taskDeliverables.length === 0 ? (
            <div className="py-12 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
              <FileCheck2 className="w-10 h-10 mx-auto mb-2 opacity-40 text-slate-400" />
              <h4 className="font-bold text-slate-700 text-sm">No Deliverable Versions Submitted</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Assigned team members can submit completed work with files, links, or notes to initiate the review workflow.
              </p>
              {task.status === 'in_progress' && canSubmitReview && (
                <button
                  onClick={() =>
                    setSubmitDeliverableModal({
                      open: true,
                      title: task.title,
                      deliverableType: task.expected_deliverable_type || 'document',
                      deliverableUrl: task.deliverable_url || '',
                      submissionNotes: '',
                      file: null
                    })
                  }
                  className="mt-4 px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl inline-flex items-center gap-1.5 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create First Submission</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {taskDeliverables.map((sub, index) => {
                const isLatest = index === 0;
                const isInternalPending = sub.internal_review_status === 'pending';
                const isInternalApproved = sub.internal_review_status === 'approved';
                const isInternalChanges = sub.internal_review_status === 'changes_requested';

                const isClientPending = sub.client_approval_status === 'pending';
                const isClientApproved = sub.client_approval_status === 'approved';
                const isClientRevision = sub.client_approval_status === 'revision_requested';

                return (
                  <div
                    key={sub.id}
                    className={`rounded-2xl border p-5 space-y-4 transition ${
                      isLatest
                        ? 'border-emerald-300/80 bg-white shadow-xs'
                        : 'border-slate-200/80 bg-slate-50/60'
                    }`}
                  >
                    {/* Header: Version badge, statuses, timestamps */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold px-2.5 py-0.5 bg-slate-900 text-white rounded-md">
                          v{sub.version_number}
                        </span>
                        {isLatest && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md">
                            Current Version
                          </span>
                        )}
                        <span className="text-[11px] capitalize px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-medium">
                          {sub.deliverable_type || 'Document'}
                        </span>

                        {/* Internal Review Status Badge */}
                        <span
                          className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                            isInternalApproved
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : isInternalChanges
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-purple-50 text-purple-700 border-purple-200'
                          }`}
                        >
                          {isInternalApproved
                            ? 'Internal: Approved'
                            : isInternalChanges
                            ? 'Internal: Changes Requested'
                            : 'Internal: In Review'}
                        </span>

                        {/* Client Approval Status Badge */}
                        {sub.requires_client_approval && (
                          <span
                            className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                              isClientApproved
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : isClientRevision
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : isClientPending
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {isClientApproved
                              ? 'Client: Approved'
                              : isClientRevision
                              ? 'Client: Revision Requested'
                              : isClientPending
                              ? 'Client: Pending Approval'
                              : 'Client: Awaiting Internal Approval'}
                          </span>
                        )}
                      </div>

                      <span className="text-[11px] text-slate-400">
                        Submitted: {new Date(sub.submitted_at || sub.created_at).toLocaleString()}
                      </span>
                    </div>

                    {/* Deliverable Metadata & Assets */}
                    <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/60 space-y-3">
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                          <FileText className="w-4 h-4 text-emerald-700" />
                          {sub.title || 'Untitled Deliverable'}
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Submitted by <span className="font-medium text-slate-700">{sub.submitter_name}</span>
                        </p>
                      </div>

                      {/* Attached URL or File */}
                      <div className="flex items-center gap-3 flex-wrap">
                        {sub.deliverable_url && (
                          <a
                            href={sub.deliverable_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-lg text-xs font-semibold text-emerald-700 transition shadow-2xs"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>View External Asset / Link</span>
                          </a>
                        )}

                        {sub.file_name && (
                          <a
                            href={`/api/deliverables/${sub.id}/download`}
                            download
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-lg text-xs font-semibold text-slate-800 transition shadow-2xs"
                          >
                            <Download className="w-3.5 h-3.5 text-emerald-600" />
                            <span>
                              {sub.file_name} ({sub.file_size ? `${(sub.file_size / 1024).toFixed(0)} KB` : 'File'})
                            </span>
                          </a>
                        )}
                      </div>

                      {sub.submission_notes && (
                        <div className="p-3 bg-white rounded-lg border border-slate-100 text-xs">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                            Submission Notes
                          </span>
                          <p className="text-slate-700 whitespace-pre-wrap italic">"{sub.submission_notes}"</p>
                        </div>
                      )}
                    </div>

                    {/* Dual Decision Panes: Internal Review & Client Portal Approval */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      {/* 1. Internal Review Pane */}
                      <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <span className="font-bold text-slate-800 uppercase tracking-wide text-[10px] flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            Internal AM Review
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                              isInternalApproved
                                ? 'bg-emerald-100 text-emerald-800'
                                : isInternalChanges
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-purple-100 text-purple-800'
                            }`}
                          >
                            {sub.internal_review_status}
                          </span>
                        </div>

                        {sub.internal_reviewer_name ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center">
                                {sub.internal_reviewer_name[0]}
                              </div>
                              <div>
                                <p className="font-semibold text-slate-900">{sub.internal_reviewer_name}</p>
                                <p className="text-[10px] text-slate-400">
                                  {sub.internal_reviewed_at
                                    ? new Date(sub.internal_reviewed_at).toLocaleString()
                                    : 'Reviewed'}
                                </p>
                              </div>
                            </div>
                            {sub.internal_review_feedback && (
                              <p className="text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-100 italic">
                                "{sub.internal_review_feedback}"
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-3 pt-1">
                            <p className="text-slate-500 italic text-[11px]">
                              Awaiting internal Account Manager or designated reviewer evaluation.
                            </p>
                            {isInternalPending && canApprove && sub.submitted_by !== currentUser?.id && (
                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  onClick={() =>
                                    setReviewDeliverableModal({
                                      open: true,
                                      submissionId: sub.id,
                                      decision: 'approved',
                                      feedback: ''
                                    })
                                  }
                                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs flex items-center gap-1 shadow-2xs transition"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Approve Internally</span>
                                </button>
                                <button
                                  onClick={() =>
                                    setReviewDeliverableModal({
                                      open: true,
                                      submissionId: sub.id,
                                      decision: 'changes_requested',
                                      feedback: ''
                                    })
                                  }
                                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs flex items-center gap-1 shadow-2xs transition"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span>Request Changes</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 2. Client Portal Approval Pane */}
                      <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <span className="font-bold text-slate-800 uppercase tracking-wide text-[10px] flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                            Client Portal Approval
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                              isClientApproved
                                ? 'bg-emerald-100 text-emerald-800'
                                : isClientRevision
                                ? 'bg-rose-100 text-rose-800'
                                : isClientPending
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {sub.client_approval_status || 'not_required'}
                          </span>
                        </div>

                        {!sub.requires_client_approval ? (
                          <p className="text-slate-400 italic text-[11px] pt-1">
                            Internal task only. Work completes automatically upon internal AM approval.
                          </p>
                        ) : !isInternalApproved ? (
                          <p className="text-slate-400 italic text-[11px] pt-1">
                            Locked — Deliverable is submitted to client portal once internal AM review is approved.
                          </p>
                        ) : sub.client_reviewer_name ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-md bg-blue-100 text-blue-800 font-bold text-xs flex items-center justify-center">
                                {sub.client_reviewer_name[0]}
                              </div>
                              <div>
                                <p className="font-semibold text-slate-900">{sub.client_reviewer_name}</p>
                                <p className="text-[10px] text-slate-400">
                                  {sub.client_reviewed_at
                                    ? new Date(sub.client_reviewed_at).toLocaleString()
                                    : 'Decision recorded'}
                                </p>
                              </div>
                            </div>
                            {sub.client_feedback && (
                              <p className="text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-100 italic">
                                "{sub.client_feedback}"
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-3 pt-1">
                            <p className="text-blue-700 bg-blue-50/60 p-2 rounded-lg border border-blue-100 text-[11px]">
                              Awaiting client review & signoff in client portal.
                            </p>
                            {isClientPending && (canClientApprove || isOwner) && (
                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  onClick={() =>
                                    setClientActionModal({
                                      open: true,
                                      submissionId: sub.id,
                                      action: 'approve',
                                      reason: ''
                                    })
                                  }
                                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs flex items-center gap-1 shadow-2xs transition"
                                >
                                  <ThumbsUp className="w-3.5 h-3.5" />
                                  <span>Client Approve</span>
                                </button>
                                <button
                                  onClick={() =>
                                    setClientActionModal({
                                      open: true,
                                      submissionId: sub.id,
                                      action: 'revision',
                                      reason: ''
                                    })
                                  }
                                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs flex items-center gap-1 shadow-2xs transition"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span>Request Revision</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Associated Revision Requests */}
                    {sub.revisions && sub.revisions.length > 0 && (
                      <div className="p-3 bg-rose-50/50 rounded-xl border border-rose-100 space-y-2 text-xs">
                        <span className="font-bold text-rose-900 text-[11px] block">
                          Revision Feedback History
                        </span>
                        {sub.revisions.map((rev) => (
                          <div
                            key={rev.id}
                            className="p-2.5 bg-white rounded-lg border border-rose-100 flex items-start justify-between gap-3"
                          >
                            <div>
                              <p className="font-semibold text-slate-800">{rev.revision_reason}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                Cycle #{rev.revision_cycle} • Requested by {rev.requested_by_name || rev.requested_by_type} on {new Date(rev.created_at).toLocaleDateString()}
                              </p>
                            </div>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                                rev.status === 'resolved'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {rev.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 6. STATUS HISTORY TAB */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900">Workflow Audit & Status History</h3>
            <p className="text-xs text-slate-500">
              Verified record of status transitions and actor actions
            </p>
          </div>

          {(task.history || []).length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">
              No status history entries recorded yet.
            </p>
          ) : (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {task.history.map((h) => (
                <div key={h.id} className="relative group">
                  <div className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-brand-600 ring-4 ring-white" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="font-bold text-slate-800">{h.actor_name || 'System'}</span>
                      <span className="text-slate-400">changed status from</span>
                      <span className="font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded uppercase text-[10px]">
                        {h.from_status ? h.from_status.replace('_', ' ') : 'Initial'}
                      </span>
                      <span className="text-slate-400">to</span>
                      <span className="font-bold text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded uppercase text-[10px]">
                        {h.to_status.replace('_', ' ')}
                      </span>
                      <span className="text-slate-400 text-[11px] ml-auto">
                        {new Date(h.created_at).toLocaleString()}
                      </span>
                    </div>
                    {h.comment && (
                      <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        "{h.comment}"
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 7. TIME & EFFORT TAB */}
      {activeTab === 'time' && (
        <div className="space-y-6">
          {/* Progress & Effort Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Tracked Effort</span>
              <p className="text-xl font-bold text-slate-900 mt-1">
                {taskTimeSummary?.totalHours || 0} hrs
              </p>
              <span className="text-xs text-slate-500">
                {taskTimeSummary?.totalMinutes || 0} minutes total
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Billable Effort</span>
              <p className="text-xl font-bold text-emerald-700 mt-1">
                {taskTimeSummary?.billableHours || 0} hrs
              </p>
              <span className="text-xs text-slate-500">
                {taskTimeSummary?.totalMinutes > 0
                  ? `${Math.round(((taskTimeSummary.billableMinutes || 0) / taskTimeSummary.totalMinutes) * 100)}% of effort`
                  : '0%'}
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Non-Billable</span>
              <p className="text-xl font-bold text-slate-700 mt-1">
                {taskTimeSummary?.nonBillableHours || 0} hrs
              </p>
              <span className="text-xs text-slate-500">
                {taskTimeSummary?.nonBillableMinutes || 0} minutes
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Estimated Effort</span>
              <p className="text-xl font-bold text-slate-800 mt-1">
                {task.estimated_minutes ? `${(task.estimated_minutes / 60).toFixed(1)} hrs` : 'None'}
              </p>
              <span className="text-xs text-slate-500">
                {task.estimated_minutes
                  ? `${Math.round(((taskTimeSummary?.totalMinutes || 0) / task.estimated_minutes) * 100)}% of estimate`
                  : 'Estimate not configured'}
              </span>
            </div>
          </div>

          {/* Effort Progress Bar */}
          {task.estimated_minutes > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-700">Estimated Effort Progress</span>
                <span className="text-slate-500">
                  {taskTimeSummary?.totalHours || 0} hrs / {(task.estimated_minutes / 60).toFixed(1)} hrs
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-2.5 rounded-full transition-all ${
                    (taskTimeSummary?.totalMinutes || 0) > task.estimated_minutes
                      ? 'bg-rose-500'
                      : 'bg-brand-600'
                  }`}
                  style={{
                    width: `${Math.min(100, Math.round(((taskTimeSummary?.totalMinutes || 0) / task.estimated_minutes) * 100))}%`
                  }}
                />
              </div>
            </div>
          )}

          {/* Time Entries Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Recorded Work Logs</h3>
                <p className="text-xs text-slate-500">Logged time entries against this task</p>
              </div>
              {canCreateTimeEntry && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTimeEntry(null);
                    setLogTimeModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Log Time</span>
                </button>
              )}
            </div>

            {taskTimeEntries.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No time entries logged for this task yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Member</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3">Duration</th>
                      <th className="px-4 py-3">Billable</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {taskTimeEntries.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {e.work_date ? e.work_date.slice(0, 10) : '—'}
                        </td>
                        <td className="px-4 py-3">{e.user_name || 'Member'}</td>
                        <td className="px-4 py-3 max-w-xs truncate">{e.description || '—'}</td>
                        <td className="px-4 py-3 font-semibold text-slate-800">
                          {(e.duration_minutes / 60).toFixed(2)}h ({e.duration_minutes}m)
                        </td>
                        <td className="px-4 py-3">
                          {e.is_billable ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Billable
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                              Non-Billable
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            e.approval_status === 'approved'
                              ? 'bg-emerald-100 text-emerald-800'
                              : e.approval_status === 'submitted'
                              ? 'bg-blue-100 text-blue-800'
                              : e.approval_status === 'rejected'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {e.approval_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right space-x-1">
                          {e.approval_status === 'draft' && (currentUser?.id === e.user_id || canManageAllTime) && (
                            <>
                              <button
                                onClick={() => {
                                  setSelectedTimeEntry(e);
                                  setLogTimeModalOpen(true);
                                }}
                                className="p-1 text-slate-400 hover:text-slate-600 rounded"
                                title="Edit Entry"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteTimeEntry(e.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded"
                                title="Delete Entry"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transition Modal */}
      {transitionModal.open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Confirm Status Transition: {transitionModal.targetStatus.replace('_', ' ')}
            </h3>
            <p className="text-xs text-slate-500">
              Optionally provide a reason or handover comment for this transition.
            </p>
            <textarea
              rows={3}
              value={transitionModal.comment}
              onChange={(e) =>
                setTransitionModal((prev) => ({ ...prev, comment: e.target.value }))
              }
              placeholder="e.g. All review feedback implemented and tests passing..."
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setTransitionModal({ open: false, targetStatus: '', comment: '' })}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isTransitioning}
                onClick={handleConfirmTransition}
                className="px-4 py-1.5 text-xs font-bold text-white bg-brand-700 hover:bg-brand-800 rounded-lg transition disabled:opacity-50"
              >
                {isTransitioning ? 'Applying...' : 'Confirm Status Change'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit for Review Modal */}
      {submitReviewModal.open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                <FileCheck2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {hasRevisionRequested ? 'Resubmit Task for Review' : 'Submit Task for Review'}
                </h3>
                <p className="text-xs text-slate-500">
                  Task will transition to In Review for authorized project reviewers.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Submission Notes & Deliverables (Optional)
              </label>
              <textarea
                rows={4}
                value={submitReviewModal.notes}
                onChange={(e) =>
                  setSubmitReviewModal((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder="Describe deliverables completed, test coverage, PR links, or comments for the reviewer..."
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSubmitReviewModal({ open: false, notes: '' })}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmittingApproval}
                onClick={handleConfirmSubmitReview}
                className="px-4 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition disabled:opacity-50"
              >
                {isSubmittingApproval ? 'Submitting...' : 'Submit for Review'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve Modal */}
      {approveModal.open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Approve Task Submission</h3>
                <p className="text-xs text-slate-500">
                  This task meets requirements and will transition to Completed.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Reviewer Feedback (Optional)
              </label>
              <textarea
                rows={3}
                value={approveModal.feedback}
                onChange={(e) =>
                  setApproveModal((prev) => ({ ...prev, feedback: e.target.value }))
                }
                placeholder="Great work, clean delivery and verified acceptance criteria..."
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setApproveModal({ open: false, approvalId: null, feedback: '' })}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmittingApproval}
                onClick={handleConfirmApprove}
                className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition disabled:opacity-50"
              >
                {isSubmittingApproval ? 'Approving...' : 'Confirm Approval & Complete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Revision Modal */}
      {revisionModal.open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center">
                <RotateCcw className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Request Work Revisions</h3>
                <p className="text-xs text-slate-500">
                  Task will return to In Progress for the assignee to address your feedback.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Revision Feedback <span className="text-rose-500">* (Min 5 chars)</span>
              </label>
              <textarea
                rows={4}
                required
                value={revisionModal.feedback}
                onChange={(e) =>
                  setRevisionModal((prev) => ({ ...prev, feedback: e.target.value }))
                }
                placeholder="Explain clearly what changes are needed before this task can be approved..."
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRevisionModal({ open: false, approvalId: null, feedback: '' })}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmittingApproval || !revisionModal.feedback || revisionModal.feedback.trim().length < 5}
                onClick={handleConfirmRevision}
                className="px-4 py-1.5 text-xs font-bold text-white bg-amber-700 hover:bg-amber-800 rounded-lg transition disabled:opacity-50"
              >
                {isSubmittingApproval ? 'Sending...' : 'Request Revisions'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Edit Task Modal */}
      <TaskModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        task={task}
        onSuccess={() => {
          fetchTaskDetails();
          setNotice('Task details updated successfully');
          setTimeout(() => setNotice(''), 3500);
        }}
      />

      {/* Stop Timer Note Modal */}
      {stopTimerNoteModal.open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
                <Square className="w-4 h-4 fill-current" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Stop Active Timer</h3>
                <p className="text-xs text-slate-500">
                  Save elapsed time as a draft work log entry.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Work Description (Optional)
              </label>
              <textarea
                rows={3}
                value={stopTimerNoteModal.description}
                onChange={(e) =>
                  setStopTimerNoteModal((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="What did you work on during this timed session?..."
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStopTimerNoteModal({ open: false, description: '' })}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isTimerActionLoading}
                onClick={handleStopTimer}
                className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition disabled:opacity-50"
              >
                {isTimerActionLoading ? 'Saving...' : 'Stop & Record Time'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 5: Submit Deliverable Modal */}
      {submitDeliverableModal.open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                <UploadCloud className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {task.revision_count > 0 || taskDeliverables.length > 0
                    ? `Submit Revised Deliverable (v${(taskDeliverables[0]?.version_number || 0) + 1})`
                    : 'Submit Deliverable for Internal Review'}
                </h3>
                <p className="text-xs text-slate-500">
                  Account Manager will inspect work internally before client submission.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmitDeliverable} className="space-y-3.5">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">Deliverable Title</label>
                <input
                  type="text"
                  required
                  value={submitDeliverableModal.title}
                  onChange={(e) => setSubmitDeliverableModal({ ...submitDeliverableModal, title: e.target.value })}
                  placeholder="e.g. SEO Technical Crawl Audit Sheet v1"
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">Deliverable Type</label>
                  <select
                    value={submitDeliverableModal.deliverableType}
                    onChange={(e) => setSubmitDeliverableModal({ ...submitDeliverableModal, deliverableType: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                  >
                    <option value="document">Document / PDF</option>
                    <option value="link">Cloud Link / Drive</option>
                    <option value="design">Figma / Design Asset</option>
                    <option value="file">File Archive / ZIP</option>
                    <option value="code">Code / Repo Link</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">Asset URL (Optional)</label>
                  <input
                    type="url"
                    value={submitDeliverableModal.deliverableUrl}
                    onChange={(e) => setSubmitDeliverableModal({ ...submitDeliverableModal, deliverableUrl: e.target.value })}
                    placeholder="https://..."
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">Attach Deliverable File (Max 25MB)</label>
                <input
                  type="file"
                  onChange={(e) => setSubmitDeliverableModal({ ...submitDeliverableModal, file: e.target.files[0] || null })}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">Submission Notes for Reviewer</label>
                <textarea
                  rows={3}
                  value={submitDeliverableModal.submissionNotes}
                  onChange={(e) => setSubmitDeliverableModal({ ...submitDeliverableModal, submissionNotes: e.target.value })}
                  placeholder="Outline key findings, methodology, and items ready for signoff..."
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSubmitDeliverableModal({ open: false, title: '', deliverableType: 'document', deliverableUrl: '', submissionNotes: '', file: null })}
                  className="px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingApproval}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmittingApproval ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Submit for Review</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Phase 5: Internal AM Review Decision Modal */}
      {reviewDeliverableModal.open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${reviewDeliverableModal.decision === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {reviewDeliverableModal.decision === 'approved' ? <CheckCircle2 className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {reviewDeliverableModal.decision === 'approved' ? 'Internal Signoff & Approval' : 'Request Changes Internally'}
                </h3>
                <p className="text-xs text-slate-500">
                  {reviewDeliverableModal.decision === 'approved'
                    ? (task.requires_client_approval || task.is_client_deliverable
                        ? 'Approves work and moves deliverable to Client Portal review.'
                        : 'Approves work and marks task completed internally.')
                    : 'Returns task to In Progress for the employee to rework.'}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setReviewDeliverableModal({ ...reviewDeliverableModal, decision: 'approved' })}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${reviewDeliverableModal.decision === 'approved' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-600'}`}
                >
                  Approve Internally
                </button>
                <button
                  type="button"
                  onClick={() => setReviewDeliverableModal({ ...reviewDeliverableModal, decision: 'changes_requested' })}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${reviewDeliverableModal.decision === 'changes_requested' ? 'bg-white text-amber-800 shadow-2xs' : 'text-slate-600'}`}
                >
                  Request Changes
                </button>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Reviewer Feedback {reviewDeliverableModal.decision === 'changes_requested' && <span className="text-rose-500">*</span>}
                </label>
                <textarea
                  rows={4}
                  required={reviewDeliverableModal.decision === 'changes_requested'}
                  value={reviewDeliverableModal.feedback}
                  onChange={(e) => setReviewDeliverableModal({ ...reviewDeliverableModal, feedback: e.target.value })}
                  placeholder={reviewDeliverableModal.decision === 'approved' ? 'Optional feedback and praise for work delivered...' : 'Detail required improvements before client review...'}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setReviewDeliverableModal({ open: false, submissionId: null, decision: 'approved', feedback: '' })}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmittingApproval || (reviewDeliverableModal.decision === 'changes_requested' && !reviewDeliverableModal.feedback?.trim())}
                onClick={handleInternalReviewDecision}
                className={`px-4 py-1.5 text-xs font-bold text-white rounded-lg transition disabled:opacity-50 ${reviewDeliverableModal.decision === 'approved' ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-amber-600 hover:bg-amber-700'}`}
              >
                {isSubmittingApproval ? 'Processing...' : reviewDeliverableModal.decision === 'approved' ? 'Confirm Approval' : 'Send Change Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 5: Client Portal Action Modal */}
      {clientActionModal.open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${clientActionModal.action === 'approve' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                {clientActionModal.action === 'approve' ? <CheckCircle2 className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {clientActionModal.action === 'approve' ? 'Approve Client Deliverable' : 'Request Deliverable Revision'}
                </h3>
                <p className="text-xs text-slate-500">
                  {clientActionModal.action === 'approve'
                    ? 'Records formal client approval and marks task complete.'
                    : 'Moves work to rework for the team to revise. Explanation required.'}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setClientActionModal({ ...clientActionModal, action: 'approve' })}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${clientActionModal.action === 'approve' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-600'}`}
                >
                  Client Approve
                </button>
                <button
                  type="button"
                  onClick={() => setClientActionModal({ ...clientActionModal, action: 'revision' })}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${clientActionModal.action === 'revision' ? 'bg-white text-rose-800 shadow-2xs' : 'text-slate-600'}`}
                >
                  Request Revision
                </button>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">
                  {clientActionModal.action === 'approve' ? 'Approval Comments (Optional)' : 'Revision Explanation (Mandatory, Min 5 chars)'}
                </label>
                <textarea
                  rows={4}
                  required={clientActionModal.action === 'revision'}
                  value={clientActionModal.reason}
                  onChange={(e) => setClientActionModal({ ...clientActionModal, reason: e.target.value })}
                  placeholder={clientActionModal.action === 'approve' ? 'Optional feedback for agency team...' : 'Clearly explain what revisions are required...'}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setClientActionModal({ open: false, submissionId: null, action: 'approve', reason: '' })}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmittingApproval || (clientActionModal.action === 'revision' && (!clientActionModal.reason || clientActionModal.reason.trim().length < 5))}
                onClick={handleClientAction}
                className={`px-4 py-1.5 text-xs font-bold text-white rounded-lg transition disabled:opacity-50 ${clientActionModal.action === 'approve' ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-rose-600 hover:bg-rose-700'}`}
              >
                {isSubmittingApproval ? 'Processing...' : clientActionModal.action === 'approve' ? 'Confirm Approval' : 'Send Revision Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Time Modal */}
      {task && (
        <LogTimeModal
          isOpen={logTimeModalOpen}
          onClose={() => {
            setLogTimeModalOpen(false);
            setSelectedTimeEntry(null);
          }}
          onSuccess={() => {
            reloadTimeData();
            setNotice('Time entry saved successfully');
            setTimeout(() => setNotice(''), 3500);
          }}
          initialTaskId={task.id}
          initialProjectId={task.project_id}
          entryToEdit={selectedTimeEntry}
        />
      )}
    </div>
  );
}
