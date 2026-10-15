import React, { useState, useEffect } from 'react';
import { ticketsService, clientsService, projectsService } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { usePermission } from '../../hooks/usePermission';
import {
  LifeBuoy,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  MessageSquare,
  Lock,
  Send,
  User,
  Building2,
  Tag,
  ArrowRight,
  X,
  RotateCcw,
  ShieldAlert,
  ChevronRight,
  HelpCircle,
  FolderKanban
} from 'lucide-react';

export function TicketsPage() {
  const { user } = useAuth();
  const { hasPermission } = usePermission();

  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState({ total: 0, open: 0, assigned: 0, inProgress: 0, waiting: 0, resolved: 0, closed: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  // Drawer / Conversation Detail
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketDetails, setTicketDetails] = useState(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // New Ticket Modal
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newTicket, setNewTicket] = useState({
    clientId: user?.client_id || '',
    subject: '',
    category: 'Website / Development',
    priority: 'medium',
    projectId: '',
    description: ''
  });
  const [clientsList, setClientsList] = useState([]);
  const [projectsList, setProjectsList] = useState([]);

  const isClientUser = Boolean(user?.client_id);
  const canInternalNote = !isClientUser && hasPermission('tickets.internal_note');

  useEffect(() => {
    fetchTickets();
    fetchStats();
    if (!isClientUser) {
      loadClients();
    }
  }, [statusFilter, priorityFilter]);

  const loadClients = async () => {
    try {
      const res = await clientsService.getClients({ limit: 100 });
      setClientsList(res.data.clients || []);
    } catch (e) {
      console.error('Failed to load clients', e);
    }
  };

  const fetchTickets = async () => {
    setIsLoading(true);
    try {
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (priorityFilter !== 'all') params.priority = priorityFilter;
      if (search.trim()) params.search = search.trim();

      const res = await ticketsService.list(params);
      setTickets(res.data.tickets || []);
    } catch (err) {
      setError('Failed to load support tickets');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await ticketsService.getStats();
      setStats(res.data.stats || {});
    } catch (e) {
      console.error('Failed to load ticket stats', e);
    }
  };

  const handleOpenTicket = async (ticket) => {
    setSelectedTicket(ticket);
    setIsLoadingDetails(true);
    setReplyMessage('');
    setIsInternalNote(false);
    try {
      const res = await ticketsService.get(ticket.id);
      setTicketDetails(res.data);
    } catch (err) {
      setError('Failed to load ticket conversation');
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!replyMessage.trim() || !selectedTicket) return;

    setIsSending(true);
    try {
      const res = await ticketsService.addMessage(selectedTicket.id, {
        message: replyMessage.trim(),
        messageType: isInternalNote ? 'internal_note' : 'reply'
      });
      setTicketDetails(res.data);
      setReplyMessage('');
      setIsInternalNote(false);
      fetchTickets();
      fetchStats();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const handleStatusUpdate = async (newStatus) => {
    if (!selectedTicket) return;
    try {
      const res = await ticketsService.update(selectedTicket.id, { status: newStatus });
      setTicketDetails(res.data);
      setSelectedTicket(res.data.ticket);
      fetchTickets();
      fetchStats();
      setNotice(`Ticket status updated to ${newStatus}`);
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update status');
    }
  };

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    try {
      await ticketsService.create(newTicket);
      setIsNewModalOpen(false);
      setNewTicket({
        clientId: user?.client_id || '',
        subject: '',
        category: 'Website / Development',
        priority: 'medium',
        projectId: '',
        description: ''
      });
      fetchTickets();
      fetchStats();
      setNotice('Support ticket created successfully!');
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create ticket');
    }
  };

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'urgent':
        return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'high':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'medium':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'open':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'assigned':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'in_progress':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'waiting_client':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'resolved':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'closed':
        return 'bg-slate-100 text-slate-600 border-slate-200';
      case 'reopened':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#047857] flex items-center justify-center font-bold">
              <LifeBuoy className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Support Desk & Client Tickets</h1>
              <p className="text-xs text-slate-500">Track client queries, bug reports, and technical requests</p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsNewModalOpen(true)}
          className="px-4 py-2.5 bg-[#047857] hover:bg-[#065f46] text-white text-xs font-semibold rounded-xl flex items-center gap-2 shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>Raise Support Ticket</span>
        </button>
      </div>

      {notice && (
        <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold">
          {notice}
        </div>
      )}
      {error && (
        <div className="p-3 bg-rose-50 text-rose-800 border border-rose-200 rounded-xl text-xs font-semibold flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Tickets</span>
          <p className="text-xl font-extrabold text-slate-900 mt-1">{stats.total || 0}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600">Open</span>
          <p className="text-xl font-extrabold text-slate-900 mt-1">{stats.open || 0}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">In Progress</span>
          <p className="text-xl font-extrabold text-slate-900 mt-1">{stats.inProgress || 0}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-purple-600">Waiting Response</span>
          <p className="text-xl font-extrabold text-slate-900 mt-1">{stats.waiting || 0}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Resolved</span>
          <p className="text-xl font-extrabold text-slate-900 mt-1">{stats.resolved || 0}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Closed</span>
          <p className="text-xl font-extrabold text-slate-900 mt-1">{stats.closed || 0}</p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search ticket #, subject, client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchTickets()}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Filter className="w-3.5 h-3.5" />
            <span>Status:</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In Progress</option>
            <option value="waiting_client">Waiting for Client</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* Ticket List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading support tickets...</div>
        ) : tickets.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <LifeBuoy className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-sm font-bold text-slate-700">No Support Tickets Found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              No tickets match your active filter settings. Click "Raise Support Ticket" to create one.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {tickets.map((t) => (
              <div
                key={t.id}
                onClick={() => handleOpenTicket(t)}
                className="p-4 hover:bg-slate-50/80 transition cursor-pointer flex flex-col md:flex-row items-start md:items-center justify-between gap-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200">
                      {t.ticket_number}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getPriorityBadge(t.priority)}`}>
                      {t.priority}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getStatusBadge(t.status)}`}>
                      {t.status.replace('_', ' ')}
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">
                      {t.category}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900">{t.subject}</h3>

                  <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1 font-semibold text-slate-700">
                      <Building2 className="w-3 h-3 text-slate-400" />
                      {t.client_company_name || t.client_name}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-400" />
                      {t.assignee_name ? `Assigned: ${t.assignee_name}` : 'Unassigned'}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {new Date(t.created_at).toLocaleDateString()}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="w-3 h-3 text-slate-400" />
                      {t.message_count ?? 0} messages
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 self-end md:self-center">
                  <button className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1">
                    <span>View Thread</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ticket Conversation Drawer / Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex justify-end">
          <div className="bg-white w-full max-w-2xl h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 bg-slate-100 rounded border">
                    {selectedTicket.ticket_number}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getPriorityBadge(selectedTicket.priority)}`}>
                    {selectedTicket.priority}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getStatusBadge(selectedTicket.status)}`}>
                    {selectedTicket.status.replace('_', ' ')}
                  </span>
                </div>
                <h2 className="text-base font-bold text-slate-900 mt-1">{selectedTicket.subject}</h2>
                <p className="text-xs text-slate-500">
                  {selectedTicket.client_company_name || selectedTicket.client_name} • Category: {selectedTicket.category}
                </p>
              </div>

              <button
                onClick={() => {
                  setSelectedTicket(null);
                  setTicketDetails(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Status Bar */}
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-medium">Status Action:</span>
                {selectedTicket.status !== 'resolved' && selectedTicket.status !== 'closed' && (
                  <button
                    onClick={() => handleStatusUpdate('resolved')}
                    className="px-2.5 py-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 rounded font-bold text-[11px]"
                  >
                    Mark Resolved
                  </button>
                )}
                {selectedTicket.status === 'resolved' && (
                  <button
                    onClick={() => handleStatusUpdate('closed')}
                    className="px-2.5 py-1 bg-slate-200 text-slate-800 hover:bg-slate-300 rounded font-bold text-[11px]"
                  >
                    Close Ticket
                  </button>
                )}
                {['resolved', 'closed'].includes(selectedTicket.status) && (
                  <button
                    onClick={() => handleStatusUpdate('reopened')}
                    className="px-2.5 py-1 bg-rose-100 text-rose-800 hover:bg-rose-200 rounded font-bold text-[11px] flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" /> Reopen Ticket
                  </button>
                )}
              </div>

              {!isClientUser && (
                <div className="text-[11px] text-slate-400">
                  Assignee: <strong className="text-slate-700">{selectedTicket.assignee_name || 'None'}</strong>
                </div>
              )}
            </div>

            {/* Messages Thread */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
              {isLoadingDetails ? (
                <div className="text-center py-8 text-xs text-slate-400">Loading conversation history...</div>
              ) : ticketDetails?.messages?.map((msg) => {
                if (msg.message_type === 'status_change') {
                  return (
                    <div key={msg.id} className="text-center py-1">
                      <span className="text-[10px] font-bold px-2.5 py-0.5 bg-slate-100 text-slate-500 rounded-full border">
                        {msg.message} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                }

                if (msg.message_type === 'internal_note') {
                  return (
                    <div key={msg.id} className="p-3.5 rounded-xl bg-amber-50/90 border border-amber-200 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-amber-900 flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5 text-amber-600" />
                          Internal Team Note — {msg.sender_name}
                        </span>
                        <span className="text-amber-700 text-[10px]">
                          {new Date(msg.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs text-amber-950 whitespace-pre-wrap">{msg.message}</p>
                    </div>
                  );
                }

                return (
                  <div
                    key={msg.id}
                    className={`p-3.5 rounded-xl border space-y-1 ${
                      msg.is_client_sender
                        ? 'bg-blue-50/80 border-blue-200 ml-4'
                        : 'bg-white border-slate-200 mr-4'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-slate-900">
                        {msg.sender_name} {msg.is_client_sender ? '(Client)' : '(Agency Team)'}
                      </span>
                      <span className="text-slate-400 text-[10px]">
                        {new Date(msg.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 whitespace-pre-wrap">{msg.message}</p>
                  </div>
                );
              })}
            </div>

            {/* Reply Composer */}
            <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-200 bg-slate-50/50 space-y-2.5">
              {canInternalNote && (
                <div className="flex items-center gap-4 text-xs">
                  <label className="flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="msgType"
                      checked={!isInternalNote}
                      onChange={() => setIsInternalNote(false)}
                      className="text-emerald-600 focus:ring-emerald-600"
                    />
                    <span>Client-Visible Reply</span>
                  </label>
                  <label className="flex items-center gap-1.5 font-semibold text-amber-700 cursor-pointer">
                    <input
                      type="radio"
                      name="msgType"
                      checked={isInternalNote}
                      onChange={() => setIsInternalNote(true)}
                      className="text-amber-600 focus:ring-amber-600"
                    />
                    <span className="flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      Internal Team Note (Hidden from client)
                    </span>
                  </label>
                </div>
              )}

              <div className="flex items-end gap-2">
                <textarea
                  rows={3}
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  placeholder={
                    isInternalNote
                      ? 'Write a private note visible only to agency team...'
                      : 'Type your message to the client...'
                  }
                  className={`flex-1 p-2.5 text-xs rounded-xl border bg-white focus:outline-none focus:ring-2 placeholder:text-slate-400 ${
                    isInternalNote
                      ? 'border-amber-300 focus:ring-amber-500'
                      : 'border-slate-200 focus:ring-emerald-600'
                  }`}
                />
                <button
                  type="submit"
                  disabled={isSending || !replyMessage.trim()}
                  className={`px-4 py-2.5 rounded-xl font-bold text-xs text-white flex items-center gap-1.5 shadow-sm transition disabled:opacity-50 ${
                    isInternalNote ? 'bg-amber-600 hover:bg-amber-700' : 'bg-[#047857] hover:bg-[#065f46]'
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSending ? 'Sending...' : 'Send'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Ticket Modal */}
      {isNewModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-[#047857] flex items-center justify-center font-bold">
                  <LifeBuoy className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Create Support Ticket</h3>
              </div>
              <button onClick={() => setIsNewModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="py-4 space-y-3.5">
              {!isClientUser && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Select Client *</label>
                  <select
                    required
                    value={newTicket.clientId}
                    onChange={(e) => setNewTicket({ ...newTicket, clientId: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
                  >
                    <option value="">-- Choose Client --</option>
                    {clientsList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.company_name || c.name} ({c.client_code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Subject *</label>
                <input
                  type="text"
                  required
                  placeholder="E.g., SSL certificate error on staging domain"
                  value={newTicket.subject}
                  onChange={(e) => setNewTicket({ ...newTicket, subject: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={newTicket.category}
                    onChange={(e) => setNewTicket({ ...newTicket, category: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
                  >
                    <option value="Website / Development">Website / Development</option>
                    <option value="SEO">SEO</option>
                    <option value="Social Media">Social Media</option>
                    <option value="Graphic Design">Graphic Design</option>
                    <option value="Video Editing">Video Editing</option>
                    <option value="Billing">Billing</option>
                    <option value="General Support">General Support</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
                  <select
                    value={newTicket.priority}
                    onChange={(e) => setNewTicket({ ...newTicket, priority: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Detailed Description *</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Provide detailed steps to reproduce the issue, affected URLs, or questions..."
                  value={newTicket.description}
                  onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-[#047857] hover:bg-[#065f46] rounded-xl shadow-sm"
                >
                  Create Support Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default TicketsPage;
