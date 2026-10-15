import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { usePermission } from '../../hooks/usePermission';
import { chatService, departmentsService, projectsService } from '../../services/api';
import { connectSocket, getSocket } from '../../services/socket';
import {
  MessageSquare,
  Users,
  Building,
  FolderGit2,
  Search,
  Plus,
  Send,
  Paperclip,
  X,
  Reply,
  Edit2,
  Trash2,
  Check,
  CheckCheck,
  FileText,
  Image as ImageIcon,
  Download,
  Info,
  UserPlus,
  LogOut,
  ChevronLeft,
  Circle,
  MoreVertical,
  Smile
} from 'lucide-react';

export function ChatPage() {
  const { user } = useAuth();
  const { hasPermission } = usePermission();
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  const [conversations, setConversations] = useState([]);
  const [selectedConvId, setSelectedConvId] = useState(null);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingConvList, setLoadingConvList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  // Filters & Search
  const [activeFilter, setActiveFilter] = useState('all'); // all, direct, group, department, project
  const [searchQuery, setSearchQuery] = useState('');

  // Composer State
  const [inputText, setInputText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [typingUsers, setTypingUsers] = useState(new Map());

  // Modals & Panels
  const [showDirectModal, setShowDirectModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showInfoDrawer, setShowInfoDrawer] = useState(false);
  const [selectedInfoMessage, setSelectedInfoMessage] = useState(null);
  const [messageInfoData, setMessageInfoData] = useState(null);
  const [loadingMessageInfo, setLoadingMessageInfo] = useState(false);
  const [messageInfoError, setMessageInfoError] = useState(null);

  // Colleague search for modals
  const [colleagues, setColleagues] = useState([]);
  const [colleagueSearch, setColleagueSearch] = useState('');
  const [loadingColleagues, setLoadingColleagues] = useState(false);

  // Group creation state
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);

  // Department & Project lists for quick channels
  const [departmentsList, setDepartmentsList] = useState([]);
  const [projectsList, setProjectsList] = useState([]);

  // Socket connection state
  const [socketConnected, setSocketConnected] = useState(false);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // 1. Initialize Socket.IO connection
  useEffect(() => {
    const socket = connectSocket();
    if (socket) {
      setSocketConnected(socket.connected);

      const handleConnect = () => setSocketConnected(true);
      const handleDisconnect = () => setSocketConnected(false);

      socket.on('connect', handleConnect);
      socket.on('disconnect', handleDisconnect);

      return () => {
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
      };
    }
  }, []);

  // 2. Load conversations list on mount
  const loadConversations = async () => {
    try {
      setLoadingConvList(true);
      const res = await chatService.listConversations();
      const list = res.data?.data || [];
      setConversations(list);

      // Check query param ?c=123
      const paramC = searchParams.get('c');
      if (paramC && !selectedConvId) {
        setSelectedConvId(Number(paramC));
      } else if (list.length > 0 && !selectedConvId && window.innerWidth >= 768) {
        setSelectedConvId(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoadingConvList(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, []);

  // 3. Handle active conversation selection & room joining
  useEffect(() => {
    if (!selectedConvId) {
      setActiveConversation(null);
      setMessages([]);
      return;
    }

    setSearchParams({ c: selectedConvId }, { replace: true });

    // Join socket room
    const socket = getSocket();
    if (socket) {
      socket.emit('chat:join', { conversationId: selectedConvId });
    }

    // Fetch conversation details and messages
    const fetchConvAndMessages = async () => {
      try {
        setLoadingMessages(true);
        const [convRes, msgRes] = await Promise.all([
          chatService.getConversation(selectedConvId),
          chatService.getMessages(selectedConvId)
        ]);

        setActiveConversation(convRes.data?.data || null);
        setMessages(msgRes.data?.data || []);

        // Mark as read immediately
        chatService.markAsRead(selectedConvId).catch(() => {});

        // Decrement local unread count
        setConversations((prev) =>
          prev.map((c) => (c.id === selectedConvId ? { ...c, unreadCount: 0 } : c))
        );
      } catch (err) {
        console.error('Error fetching conversation messages:', err);
      } finally {
        setLoadingMessages(false);
      }
    };

    fetchConvAndMessages();

    return () => {
      if (socket) {
        socket.emit('chat:leave', { conversationId: selectedConvId });
      }
    };
  }, [selectedConvId]);

  // 4. Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  // 5. Socket Event Listeners
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // A. Incoming new message
    const handleNewMessage = (msg) => {
      if (Number(msg.conversationId) === Number(selectedConvId)) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });

        // Mark as read if active
        if (Number(msg.senderId) !== Number(user?.id)) {
          chatService.markAsRead(selectedConvId).catch(() => {});
        }
      }

      // Update sidebar conversations list
      setConversations((prev) => {
        const index = prev.findIndex((c) => Number(c.id) === Number(msg.conversationId));
        if (index !== -1) {
          const updated = [...prev];
          const conv = { ...updated[index] };
          conv.lastMessage = {
            id: msg.id,
            content: msg.content,
            messageType: msg.messageType,
            senderId: msg.senderId,
            senderName: msg.sender?.name,
            createdAt: msg.createdAt
          };
          conv.lastMessageAt = msg.createdAt;
          if (Number(msg.conversationId) !== Number(selectedConvId) && Number(msg.senderId) !== Number(user?.id)) {
            conv.unreadCount = (conv.unreadCount || 0) + 1;
          }
          // Move conversation to top
          updated.splice(index, 1);
          return [conv, ...updated];
        } else {
          // If brand new conversation, reload list
          loadConversations();
          return prev;
        }
      });
    };

    // B. Message edited
    const handleMessageEdited = (payload) => {
      if (Number(payload.conversationId) === Number(selectedConvId)) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === payload.messageId
              ? { ...m, content: payload.content, isEdited: true, editedAt: payload.editedAt }
              : m
          )
        );
      }
    };

    // C. Message deleted
    const handleMessageDeleted = (payload) => {
      setReplyingTo((current) => (current && Number(current.id) === Number(payload.messageId) ? null : current));
      setEditingMessage((current) => {
        if (current && Number(current.id) === Number(payload.messageId)) {
          setInputText('');
          return null;
        }
        return current;
      });

      if (Number(payload.conversationId) === Number(selectedConvId)) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === payload.messageId
              ? {
                  ...m,
                  content: '[This message was deleted]',
                  attachments: [],
                  replyTo: null,
                  isDeleted: true,
                  deletedAt: payload.deletedAt
                }
              : m
          )
        );
      }
    };

    // D. Read receipt
    const handleReadReceipt = (payload) => {
      if (Number(payload.conversationId) === Number(selectedConvId)) {
        setMessages((prev) =>
          prev.map((m) => {
            const receipts = m.readReceipts || [];
            if (!receipts.some((r) => Number(r.userId) === Number(payload.userId))) {
              return {
                ...m,
                readReceipts: [
                  ...receipts,
                  { userId: payload.userId, userName: payload.userName, readAt: payload.readAt }
                ]
              };
            }
            return m;
          })
        );
      }
    };

    // D2. Messages delivered event
    const handleMessagesDelivered = (payload) => {
      if (Number(payload.conversationId) === Number(selectedConvId)) {
        setMessages((prev) =>
          prev.map((m) => {
            const deliveries = m.deliveryReceipts || [];
            if (!deliveries.some((d) => Number(d.userId) === Number(payload.userId))) {
              return {
                ...m,
                deliveryReceipts: [
                  ...deliveries,
                  { userId: payload.userId, userName: payload.userName, deliveredAt: payload.deliveredAt }
                ]
              };
            }
            return m;
          })
        );
      }
    };

    // E. User typing indicator
    const handleUserTyping = (payload) => {
      if (Number(payload.conversationId) === Number(selectedConvId) && Number(payload.userId) !== Number(user?.id)) {
        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.set(payload.userId, payload.userName);
          return next;
        });
      }
    };

    const handleUserStopTyping = (payload) => {
      if (Number(payload.conversationId) === Number(selectedConvId)) {
        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.delete(payload.userId);
          return next;
        });
      }
    };

    // F. Unread bump for background conversations
    const handleUnreadBump = (payload) => {
      setConversations((prev) => {
        const index = prev.findIndex((c) => Number(c.id) === Number(payload.conversationId));
        if (index !== -1) {
          const updated = [...prev];
          const conv = { ...updated[index] };
          if (Number(payload.conversationId) !== Number(selectedConvId)) {
            conv.unreadCount = (conv.unreadCount || 0) + 1;
          }
          if (payload.lastMessage) {
            conv.lastMessage = payload.lastMessage;
            conv.lastMessageAt = payload.lastMessage.createdAt;
          }
          updated.splice(index, 1);
          return [conv, ...updated];
        }
        return prev;
      });
    };

    // G. Conversation created
    const handleConversationCreated = () => {
      loadConversations();
    };

    socket.on('chat:message', handleNewMessage);
    socket.on('chat:message_edited', handleMessageEdited);
    socket.on('chat:message_deleted', handleMessageDeleted);
    socket.on('chat:read_receipt', handleReadReceipt);
    socket.on('chat:messages_delivered', handleMessagesDelivered);
    socket.on('chat:user_typing', handleUserTyping);
    socket.on('chat:user_stop_typing', handleUserStopTyping);
    socket.on('chat:unread_bump', handleUnreadBump);
    socket.on('chat:conversation_created', handleConversationCreated);

    return () => {
      socket.off('chat:message', handleNewMessage);
      socket.off('chat:message_edited', handleMessageEdited);
      socket.off('chat:message_deleted', handleMessageDeleted);
      socket.off('chat:read_receipt', handleReadReceipt);
      socket.off('chat:messages_delivered', handleMessagesDelivered);
      socket.off('chat:user_typing', handleUserTyping);
      socket.off('chat:user_stop_typing', handleUserStopTyping);
      socket.off('chat:unread_bump', handleUnreadBump);
      socket.off('chat:conversation_created', handleConversationCreated);
    };
  }, [selectedConvId, user?.id]);

  // 6. Handle input change and emit typing
  const handleInputChange = (e) => {
    setInputText(e.target.value);

    const socket = getSocket();
    if (socket && selectedConvId) {
      socket.emit('chat:typing', { conversationId: selectedConvId });

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('chat:stop_typing', { conversationId: selectedConvId });
      }, 2000);
    }
  };

  // 7. Send message
  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (sending) return;

    const trimmed = inputText.trim();
    if (!trimmed && !selectedFile) return;

    setSending(true);
    try {
      if (editingMessage) {
        // Edit flow
        await chatService.editMessage(editingMessage.id, { content: trimmed });
        setEditingMessage(null);
        setInputText('');
      } else {
        // New message flow
        if (selectedFile) {
          const formData = new FormData();
          formData.append('file', selectedFile);
          if (trimmed) formData.append('content', trimmed);
          if (replyingTo) formData.append('replyToId', replyingTo.id);

          await chatService.sendMessage(selectedConvId, formData);
        } else {
          await chatService.sendTextMessage(selectedConvId, {
            content: trimmed,
            messageType: 'text',
            replyToId: replyingTo?.id || null
          });
        }

        setInputText('');
        setSelectedFile(null);
        setReplyingTo(null);
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      alert(err.response?.data?.error?.message || 'Failed to send message.');
    } finally {
      setSending(false);
      // Stop typing
      const socket = getSocket();
      if (socket && selectedConvId) {
        socket.emit('chat:stop_typing', { conversationId: selectedConvId });
      }
    }
  };

  // 8. Delete message
  const handleDeleteMessage = async (msgId) => {
    if (!window.confirm('Are you sure you want to delete this message?')) return;
    try {
      await chatService.deleteMessage(msgId);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                content: '[This message was deleted]',
                attachments: [],
                replyTo: null,
                isDeleted: true,
                deletedAt: new Date().toISOString()
              }
            : m
        )
      );
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to delete message.');
    }
  };

  // 9. Colleague search for Direct & Group modals
  const fetchColleagues = async (term = '') => {
    try {
      setLoadingColleagues(true);
      const res = await chatService.searchColleagues({ search: term });
      setColleagues(res.data?.data || []);
    } catch (err) {
      console.error('Failed to fetch colleagues:', err);
    } finally {
      setLoadingColleagues(false);
    }
  };

  // 10. Start Direct Chat
  const handleStartDirectChat = async (targetUserId) => {
    try {
      const res = await chatService.getOrCreateDirect(targetUserId);
      const conv = res.data?.data;
      setShowDirectModal(false);
      await loadConversations();
      setSelectedConvId(conv.id);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to start direct conversation.');
    }
  };

  // 11. Create Group Chat
  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupTitle.trim()) return;

    try {
      const res = await chatService.createGroup({
        title: newGroupTitle.trim(),
        description: newGroupDesc.trim(),
        memberIds: selectedMemberIds
      });
      const conv = res.data?.data;
      setShowGroupModal(false);
      setNewGroupTitle('');
      setNewGroupDesc('');
      setSelectedMemberIds([]);
      await loadConversations();
      setSelectedConvId(conv.id);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to create group conversation.');
    }
  };

  // 12. Open Department Chat
  const handleOpenDepartmentChat = async (deptId) => {
    try {
      const res = await chatService.getOrCreateDepartment(deptId);
      const conv = res.data?.data;
      setShowDeptModal(false);
      await loadConversations();
      setSelectedConvId(conv.id);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to open department channel.');
    }
  };

  // 13. Open Project Chat
  const handleOpenProjectChat = async (projId) => {
    try {
      const res = await chatService.getOrCreateProject(projId);
      const conv = res.data?.data;
      setShowProjectModal(false);
      await loadConversations();
      setSelectedConvId(conv.id);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to open project channel.');
    }
  };

  // Filtered conversations list
  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      // Filter by type
      if (activeFilter === 'direct' && c.type !== 'direct') return false;
      if (activeFilter === 'group' && c.type !== 'group') return false;
      if (activeFilter === 'department' && c.type !== 'department') return false;
      if (activeFilter === 'project' && c.type !== 'project') return false;

      // Filter by query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = (c.title || '').toLowerCase().includes(q);
        const matchDept = (c.departmentName || '').toLowerCase().includes(q);
        const matchProj = (c.projectName || '').toLowerCase().includes(q);
        const matchOther = (c.otherUser?.name || '').toLowerCase().includes(q);
        return matchTitle || matchDept || matchProj || matchOther;
      }
      return true;
    });
  }, [conversations, activeFilter, searchQuery]);

  // Formatter helpers
  const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateLabel = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // WhatsApp Message Info modal opener
  const handleOpenMessageInfo = async (msg) => {
    setSelectedInfoMessage(msg);
    setMessageInfoData(null);
    setMessageInfoError(null);
    setLoadingMessageInfo(true);
    try {
      const res = await chatService.getMessageInfo(msg.id);
      setMessageInfoData(res.data?.data || null);
    } catch (err) {
      console.error('Failed to load message info:', err);
      setMessageInfoError(err.response?.data?.error?.message || 'Failed to load message details');
    } finally {
      setLoadingMessageInfo(false);
    }
  };

  // Helper to calculate WhatsApp tick status: 'sent' | 'delivered' | 'read'
  const getMessageTickStatus = (msg) => {
    if (!msg || msg.isDeleted) return null;

    const currentUserId = Number(user?.id);
    const reads = msg.readReceipts || [];
    const deliveries = msg.deliveryReceipts || [];

    if (activeConversation?.type === 'direct') {
      const otherUserId = Number(activeConversation.otherUser?.id);
      const isRead = reads.some(
        (r) => Number(r.userId) !== currentUserId && (!otherUserId || Number(r.userId) === otherUserId)
      );
      if (isRead) return 'read';

      const isDelivered = deliveries.some(
        (d) => Number(d.userId) !== currentUserId && (!otherUserId || Number(d.userId) === otherUserId)
      );
      if (isDelivered) return 'delivered';

      return 'sent';
    }

    // Group / Channel / Project
    const otherMembers = (activeConversation?.members || []).filter(
      (m) => Number(m.userId) !== currentUserId
    );
    const readOthers = reads.filter((r) => Number(r.userId) !== currentUserId);

    if (otherMembers.length > 0 && readOthers.length >= otherMembers.length) {
      return 'read';
    }

    const delivUserIds = new Set([
      ...deliveries.map((d) => Number(d.userId)),
      ...reads.map((r) => Number(r.userId))
    ]);
    delivUserIds.delete(currentUserId);

    if (delivUserIds.size > 0) {
      return 'delivered';
    }

    return 'sent';
  };

  const formatDetailedDateTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (isToday) {
      return `Today at ${timeStr}`;
    }
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return `Yesterday at ${timeStr}`;
    }
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} at ${timeStr}`;
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-50 font-sans">
      {/* ========================================================= */}
      {/* 1. LEFT CONVERSATIONS SIDEBAR */}
      {/* ========================================================= */}
      <aside
        className={`${
          selectedConvId ? 'hidden md:flex' : 'flex'
        } w-full md:w-80 lg:w-96 flex-col border-r border-slate-200 bg-white shrink-0 select-none`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-600 to-brand-700 text-white flex items-center justify-center shadow-sm shadow-brand-600/25">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-800 leading-tight">Team Chat</h1>
                <div className="flex items-center space-x-1.5 text-xs text-slate-500">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      socketConnected ? 'bg-emerald-500' : 'bg-amber-400'
                    }`}
                  />
                  <span>{socketConnected ? 'Live Real-Time' : 'Connecting...'}</span>
                </div>
              </div>
            </div>

            {/* Quick Action Menus */}
            <div className="flex items-center space-x-1">
              <button
                title="New Direct Message"
                onClick={() => {
                  fetchColleagues();
                  setShowDirectModal(true);
                }}
                className="p-1.5 rounded-lg text-slate-600 hover:text-brand-600 hover:bg-brand-50 transition"
              >
                <Plus className="w-5 h-5" />
              </button>
              <button
                title="New Group Chat"
                onClick={() => {
                  fetchColleagues();
                  setShowGroupModal(true);
                }}
                className="p-1.5 rounded-lg text-slate-600 hover:text-brand-600 hover:bg-brand-50 transition"
              >
                <Users className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-100/80 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 focus:bg-white transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center space-x-1 mt-3 overflow-x-auto pb-1 text-xs text-slate-600">
            {[
              { id: 'all', label: 'All' },
              { id: 'direct', label: 'Direct' },
              { id: 'group', label: 'Groups' },
              { id: 'department', label: 'Departments' },
              { id: 'project', label: 'Projects' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={`px-2.5 py-1 rounded-md font-medium whitespace-nowrap transition ${
                  activeFilter === tab.id
                    ? 'bg-brand-600 text-white shadow-xs shadow-brand-500/20'
                    : 'hover:bg-slate-100 text-slate-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Channels Quick Launch Buttons */}
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <button
            onClick={async () => {
              try {
                const res = await departmentsService.getAll();
                setDepartmentsList(res.data?.data || []);
                setShowDeptModal(true);
              } catch (e) {
                console.error(e);
              }
            }}
            className="flex items-center space-x-1 text-brand-600 hover:underline font-medium"
          >
            <Building className="w-3.5 h-3.5" />
            <span>Join Dept Channel</span>
          </button>
          <span className="text-slate-300">|</span>
          <button
            onClick={async () => {
              try {
                const res = await projectsService.getAll();
                setProjectsList(res.data?.data || []);
                setShowProjectModal(true);
              } catch (e) {
                console.error(e);
              }
            }}
            className="flex items-center space-x-1 text-brand-600 hover:underline font-medium"
          >
            <FolderGit2 className="w-3.5 h-3.5" />
            <span>Project Chat</span>
          </button>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {loadingConvList ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading conversations...</div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No conversations found.
              <div className="mt-2 text-brand-600 font-medium cursor-pointer" onClick={() => setShowDirectModal(true)}>
                + Start a conversation
              </div>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = Number(selectedConvId) === Number(conv.id);
              const unread = Number(conv.unreadCount || 0);

              return (
                <div
                  key={conv.id}
                  onClick={() => setSelectedConvId(conv.id)}
                  className={`flex items-start p-3.5 cursor-pointer transition relative ${
                    isSelected
                      ? 'bg-brand-50/60 border-l-4 border-brand-600'
                      : 'hover:bg-slate-50/80'
                  }`}
                >
                  {/* Avatar / Icon */}
                  <div className="relative mr-3 shrink-0">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                        conv.type === 'direct'
                          ? 'bg-brand-50 text-brand-700 border border-brand-200/80'
                          : conv.type === 'department'
                          ? 'bg-blue-100 text-blue-800'
                          : conv.type === 'project'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {conv.type === 'direct' ? (
                        (conv.title || 'U').slice(0, 2).toUpperCase()
                      ) : conv.type === 'department' ? (
                        <Building className="w-4 h-4" />
                      ) : conv.type === 'project' ? (
                        <FolderGit2 className="w-4 h-4" />
                      ) : (
                        <Users className="w-4 h-4" />
                      )}
                    </div>
                  </div>

                  {/* Body */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h2 className="text-xs font-semibold text-slate-800 truncate" title={conv.title}>
                        {conv.title}
                      </h2>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap ml-1">
                        {conv.lastMessageAt ? formatTime(conv.lastMessageAt) : ''}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-slate-500 truncate mr-2">
                        {conv.lastMessage ? (
                          <>
                            {conv.lastMessage.senderId === user?.id && <span className="font-medium text-slate-600">You: </span>}
                            {conv.lastMessage.content}
                          </>
                        ) : (
                          <span className="italic text-slate-400">No messages yet</span>
                        )}
                      </p>

                      {unread > 0 && (
                        <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold bg-brand-600 text-white rounded-full shrink-0">
                          {unread}
                        </span>
                      )}
                    </div>

                    {/* Tag badge */}
                    <div className="mt-1">
                      <span
                        className={`inline-block text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${
                          conv.type === 'direct'
                            ? 'bg-slate-100 text-slate-600'
                            : conv.type === 'department'
                            ? 'bg-blue-50 text-blue-700'
                            : conv.type === 'project'
                            ? 'bg-purple-50 text-purple-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {conv.type}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* ========================================================= */}
      {/* 2. MAIN CHAT AREA */}
      {/* ========================================================= */}
      <main className="flex-1 flex flex-col bg-slate-50 min-w-0">
        {selectedConvId && activeConversation ? (
          <>
            {/* Active Header */}
            <header className="h-14 px-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 shadow-xs">
              <div className="flex items-center space-x-3 min-w-0">
                <button
                  onClick={() => setSelectedConvId(null)}
                  className="md:hidden p-1 text-slate-500 hover:text-slate-800"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                    activeConversation.type === 'direct'
                      ? 'bg-brand-50 text-brand-700 border border-brand-200/80'
                      : activeConversation.type === 'department'
                      ? 'bg-blue-100 text-blue-800'
                      : activeConversation.type === 'project'
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {activeConversation.type === 'direct' ? (
                    (activeConversation.title || 'U').slice(0, 2).toUpperCase()
                  ) : activeConversation.type === 'department' ? (
                    <Building className="w-4 h-4" />
                  ) : activeConversation.type === 'project' ? (
                    <FolderGit2 className="w-4 h-4" />
                  ) : (
                    <Users className="w-4 h-4" />
                  )}
                </div>

                <div className="min-w-0">
                  <h2 className="text-xs sm:text-sm font-bold text-slate-800 truncate">
                    {activeConversation.title}
                  </h2>
                  <p className="text-[11px] text-slate-500 truncate">
                    {activeConversation.type === 'direct' ? (
                      activeConversation.otherUser?.department ||
                      activeConversation.otherUser?.role ||
                      'Direct Message'
                    ) : activeConversation.type === 'department' ? (
                      'Department-wide internal channel'
                    ) : activeConversation.type === 'project' ? (
                      `Project: ${activeConversation.projectName || 'Internal'}`
                    ) : (
                      `${activeConversation.members?.length || 0} members`
                    )}
                  </p>
                </div>
              </div>

              {/* Header Actions */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowInfoDrawer(!showInfoDrawer)}
                  className={`p-1.5 rounded-lg border transition ${
                    showInfoDrawer
                      ? 'bg-brand-50 text-brand-700 border-brand-200'
                      : 'text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                  title="Conversation Info & Members"
                >
                  <Info className="w-4 h-4" />
                </button>
              </div>
            </header>

            {/* Messages Scroll View */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#f8fafc]">
              {loadingMessages ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  Loading message history...
                </div>
              ) : messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                  <MessageSquare className="w-10 h-10 text-slate-300 mb-2 stroke-1" />
                  <p className="font-medium text-slate-600">No messages in this conversation yet</p>
                  <p className="text-slate-400">Send a greeting to start the communication thread!</p>
                </div>
              ) : (
                messages.map((msg, index) => {
                  const isMe = Number(msg.senderId) === Number(user?.id);
                  const isSystem = msg.messageType === 'system';

                  // Date separator
                  const prevMsg = messages[index - 1];
                  const showDate =
                    !prevMsg ||
                    new Date(prevMsg.createdAt).toDateString() !==
                      new Date(msg.createdAt).toDateString();

                  if (isSystem) {
                    return (
                      <React.Fragment key={msg.id}>
                        {showDate && (
                          <div className="flex justify-center my-3">
                            <span className="px-2.5 py-0.5 text-[10px] font-medium text-slate-500 bg-slate-200/60 rounded-full">
                              {formatDateLabel(msg.createdAt)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-center my-2">
                          <span className="px-3 py-1 text-[11px] italic text-slate-500 bg-slate-100 border border-slate-200 rounded-full">
                            {msg.content}
                          </span>
                        </div>
                      </React.Fragment>
                    );
                  }

                  return (
                    <React.Fragment key={msg.id}>
                      {showDate && (
                        <div className="flex justify-center my-3">
                          <span className="px-2.5 py-0.5 text-[10px] font-medium text-slate-500 bg-slate-200/60 rounded-full">
                            {formatDateLabel(msg.createdAt)}
                          </span>
                        </div>
                      )}

                      <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group`}>
                        {/* Sender Name (for incoming group/dept messages) */}
                        {!isMe && (
                          <span className="text-[10px] font-semibold text-slate-500 mb-0.5 ml-1">
                            {msg.sender?.name || 'User'}
                          </span>
                        )}

                        <div className="relative max-w-[85%] sm:max-w-md md:max-w-lg">
                          {/* Message Bubble */}
                          <div
                            className={`rounded-2xl px-3.5 py-2 text-xs shadow-xs transition ${
                              msg.isDeleted
                                ? 'bg-slate-100/90 text-slate-500 border border-slate-200/90 italic' +
                                  (isMe ? ' rounded-br-none' : ' rounded-bl-none')
                                : isMe
                                ? 'bg-gradient-to-r from-brand-600 to-brand-700 text-white rounded-br-none shadow-xs shadow-brand-600/10'
                                : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'
                            }`}
                          >
                            {msg.isDeleted ? (
                              <div className="flex items-center space-x-1.5 py-0.5 select-none">
                                <Trash2 className="w-3.5 h-3.5 text-slate-400 shrink-0 not-italic" />
                                <span className="italic text-slate-500 font-normal">
                                  This message was deleted
                                </span>
                              </div>
                            ) : (
                              <>
                                {/* Quoted Reply if present */}
                                {msg.replyTo && (
                                  <div
                                    className={`mb-1.5 p-1.5 rounded text-[11px] border-l-2 ${
                                      isMe
                                        ? 'bg-brand-800/80 border-brand-300 text-brand-100'
                                        : 'bg-slate-100 border-slate-400 text-slate-600'
                                    }`}
                                  >
                                    <span className="font-semibold block">{msg.replyTo.senderName}</span>
                                    <span className="truncate block opacity-90">{msg.replyTo.content}</span>
                                  </div>
                                )}

                                {/* Attachments if any */}
                                {!msg.isDeleted && msg.attachments && msg.attachments.length > 0 && (
                                  <div className="mb-2 space-y-1">
                                    {msg.attachments.map((att) => {
                                      const isImg = att.mimeType?.startsWith('image/');
                                      return (
                                        <div key={att.id} className="rounded overflow-hidden">
                                          {isImg ? (
                                            <div className="rounded overflow-hidden border border-black/10">
                                              <img
                                                src={chatService.getAttachmentUrl(msg.id)}
                                                alt={att.fileName}
                                                className="max-h-60 rounded object-cover cursor-pointer hover:opacity-95"
                                                onClick={() => window.open(chatService.getAttachmentUrl(msg.id), '_blank')}
                                              />
                                            </div>
                                          ) : (
                                            <a
                                              href={chatService.getAttachmentUrl(msg.id)}
                                              target="_blank"
                                              rel="noreferrer"
                                              className={`flex items-center space-x-2 p-2 rounded border ${
                                                isMe
                                                  ? 'bg-brand-800/60 border-brand-500 text-white'
                                                  : 'bg-slate-50 border-slate-200 text-slate-800'
                                              } hover:opacity-90`}
                                            >
                                              <FileText className="w-4 h-4 shrink-0" />
                                              <div className="min-w-0 flex-1">
                                                <p className="truncate font-medium">{att.fileName}</p>
                                                <p className="text-[10px] opacity-75">
                                                  {(att.fileSize / 1024).toFixed(1)} KB
                                                </p>
                                              </div>
                                              <Download className="w-3.5 h-3.5 shrink-0 ml-1" />
                                            </a>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Text Content */}
                                <p className="whitespace-pre-wrap break-words leading-relaxed">
                                  {msg.content}
                                </p>
                              </>
                            )}

                            {/* Footer inside bubble */}
                            <div
                              className={`flex items-center justify-end space-x-1 mt-1 text-[9px] ${
                                msg.isDeleted
                                  ? 'text-slate-400 not-italic'
                                  : isMe
                                  ? 'text-brand-200'
                                  : 'text-slate-400'
                              }`}
                            >
                              {!msg.isDeleted && msg.isEdited && <span>(edited)</span>}
                              <span>{formatTime(msg.createdAt)}</span>
                              {!msg.isDeleted && isMe && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenMessageInfo(msg);
                                  }}
                                  className="inline-flex items-center ml-0.5 hover:scale-110 active:scale-95 transition cursor-pointer"
                                  title="Click to view WhatsApp Message Info"
                                >
                                  {(() => {
                                    const tickStatus = getMessageTickStatus(msg);
                                    if (tickStatus === 'read') {
                                      return (
                                        <span title="Read (Seen)" className="inline-flex items-center text-[#53bdeb] drop-shadow-xs">
                                          <CheckCheck className="w-3.5 h-3.5 stroke-[2.4]" />
                                        </span>
                                      );
                                    }
                                    if (tickStatus === 'delivered') {
                                      return (
                                        <span title="Delivered to device" className="inline-flex items-center text-white/85">
                                          <CheckCheck className="w-3.5 h-3.5 stroke-[2.1]" />
                                        </span>
                                      );
                                    }
                                    return (
                                      <span title="Sent to server" className="inline-flex items-center text-white/60">
                                        <Check className="w-3.5 h-3.5 stroke-[2]" />
                                      </span>
                                    );
                                  })()}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Quick Message Actions on hover - only for active messages */}
                          {!msg.isDeleted && (
                            <div
                              className={`absolute top-0 ${
                                isMe ? '-left-24' : '-right-20'
                              } hidden group-hover:flex items-center space-x-0.5 bg-white border border-slate-200 shadow-md rounded-lg p-0.5 text-slate-500 z-10`}
                            >
                              <button
                                title="Message info"
                                onClick={() => handleOpenMessageInfo(msg)}
                                className="p-1 hover:text-brand-600 hover:bg-slate-100 rounded transition"
                              >
                                <Info className="w-3.5 h-3.5" />
                              </button>
                              <button
                                title="Reply"
                                onClick={() => {
                                  setReplyingTo(msg);
                                  setEditingMessage(null);
                                }}
                                className="p-1 hover:text-brand-600 hover:bg-slate-100 rounded transition"
                              >
                                <Reply className="w-3.5 h-3.5" />
                              </button>
                              {isMe && (
                                <button
                                  title="Edit"
                                  onClick={() => {
                                    setEditingMessage(msg);
                                    setInputText(msg.content);
                                    setReplyingTo(null);
                                  }}
                                  className="p-1 hover:text-brand-600 hover:bg-slate-100 rounded transition"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {(isMe || hasPermission('roles.view')) && (
                                <button
                                  title="Delete"
                                  onClick={() => handleDeleteMessage(msg.id)}
                                  className="p-1 hover:text-rose-600 hover:bg-slate-100 rounded transition"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })
              )}

              {/* Typing indicator */}
              {typingUsers.size > 0 && (
                <div className="flex items-center space-x-2 text-xs text-slate-400 italic">
                  <div className="flex space-x-1">
                    <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" />
                    <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                  <span>
                    {Array.from(typingUsers.values()).join(', ')} is typing...
                  </span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Replying or Editing Indicator Banner */}
            {(replyingTo || editingMessage) && (
              <div className="px-4 py-2 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2 truncate">
                  {replyingTo && <Reply className="w-3.5 h-3.5 text-brand-600" />}
                  {editingMessage && <Edit2 className="w-3.5 h-3.5 text-brand-600" />}
                  <span className="text-slate-600 font-medium">
                    {replyingTo ? `Replying to ${replyingTo.sender?.name}:` : 'Editing message:'}
                  </span>
                  <span className="text-slate-500 truncate max-w-xs">
                    {replyingTo?.content || editingMessage?.content}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setReplyingTo(null);
                    setEditingMessage(null);
                    if (editingMessage) setInputText('');
                  }}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Selected File Banner */}
            {selectedFile && (
              <div className="px-4 py-2 bg-brand-50 border-t border-brand-100 flex items-center justify-between text-xs text-brand-800">
                <div className="flex items-center space-x-2">
                  <Paperclip className="w-3.5 h-3.5" />
                  <span className="font-medium truncate max-w-xs">{selectedFile.name}</span>
                  <span className="text-brand-600">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                </div>
                <button
                  onClick={() => setSelectedFile(null)}
                  className="text-brand-600 hover:text-brand-800 p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Message Composer */}
            <form onSubmit={handleSendMessage} className="p-3 sm:p-3.5 bg-white border-t border-slate-200/80 shrink-0 sticky bottom-0 z-10">
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/90 rounded-2xl p-1.5 pl-2.5 focus-within:bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20 shadow-xs transition-all">
                {/* File picker */}
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition shrink-0"
                  title="Attach file or image"
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                {/* Text Input */}
                <input
                  type="text"
                  placeholder={
                    editingMessage
                      ? 'Update your message...'
                      : selectedFile
                      ? 'Add a caption (optional)...'
                      : 'Type a message...'
                  }
                  value={inputText}
                  onChange={handleInputChange}
                  className="flex-1 bg-transparent border-0 px-2 py-1 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-0"
                />

                {/* Send Button */}
                <button
                  type="submit"
                  disabled={sending || (!inputText.trim() && !selectedFile)}
                  className="px-4 py-2 bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-500 hover:to-brand-600 active:scale-95 text-white rounded-xl text-xs font-semibold shadow-sm shadow-brand-500/25 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 transition flex items-center gap-1.5 shrink-0"
                >
                  <span>{editingMessage ? 'Update' : 'Send'}</span>
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mb-4 shadow-sm shadow-brand-500/10">
              <MessageSquare className="w-8 h-8 stroke-1" />
            </div>
            <h2 className="text-base font-bold text-slate-800 mb-1">Internal Team Communication</h2>
            <p className="text-xs text-slate-500 max-w-sm mb-6">
              Connect with your colleagues via 1:1 direct messages, custom group chats, department channels, and project discussion streams.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => {
                  fetchColleagues();
                  setShowDirectModal(true);
                }}
                className="px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-semibold hover:bg-brand-700 shadow-sm shadow-brand-500/20 transition"
              >
                + Start Direct Chat
              </button>
              <button
                onClick={() => {
                  fetchColleagues();
                  setShowGroupModal(true);
                }}
                className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 transition"
              >
                + Create Group
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ========================================================= */}
      {/* 3. RIGHT INFO & MEMBERS DRAWER */}
      {/* ========================================================= */}
      {showInfoDrawer && activeConversation && (
        <aside className="w-72 border-l border-slate-200 bg-white p-4 flex flex-col shrink-0 select-none overflow-y-auto">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Conversation Info</h3>
            <button
              onClick={() => setShowInfoDrawer(false)}
              className="p-1 text-slate-400 hover:text-slate-600 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Details */}
          <div className="mb-6">
            <div className="text-center mb-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-brand-50 text-brand-700 border border-brand-200/80 flex items-center justify-center font-bold text-lg mb-2">
                {activeConversation.title?.slice(0, 2).toUpperCase()}
              </div>
              <h4 className="text-sm font-bold text-slate-800">{activeConversation.title}</h4>
              <p className="text-xs text-slate-500 capitalize">{activeConversation.type} Chat</p>
            </div>

            {activeConversation.description && (
              <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                {activeConversation.description}
              </p>
            )}
          </div>

          {/* Members List */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-700">
                Members ({activeConversation.members?.length || 0})
              </span>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {activeConversation.members?.map((m) => (
                <div key={m.userId} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                  <div>
                    <p className="font-semibold text-slate-800">{m.name}</p>
                    <p className="text-[10px] text-slate-400">{m.department || m.systemRole}</p>
                  </div>
                  <span className="text-[9px] uppercase px-1.5 py-0.5 rounded font-semibold bg-slate-200/60 text-slate-600">
                    {m.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      )}

      {/* ========================================================= */}
      {/* 4. MODALS */}
      {/* ========================================================= */}

      {/* A. NEW DIRECT CHAT MODAL */}
      {showDirectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">New Direct Message</h3>
              <button onClick={() => setShowDirectModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5">
              <div className="relative mb-3">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search colleagues by name, email, department..."
                  value={colleagueSearch}
                  onChange={(e) => {
                    setColleagueSearch(e.target.value);
                    fetchColleagues(e.target.value);
                  }}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 focus:bg-white"
                />
              </div>

              <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                {loadingColleagues ? (
                  <p className="text-center py-6 text-xs text-slate-400">Loading team members...</p>
                ) : colleagues.length === 0 ? (
                  <p className="text-center py-6 text-xs text-slate-400">No eligible internal colleagues found.</p>
                ) : (
                  colleagues.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => handleStartDirectChat(c.id)}
                      className="p-3 flex items-center justify-between hover:bg-brand-50/60 cursor-pointer rounded-xl transition"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-brand-50 text-brand-700 border border-brand-200/80 flex items-center justify-center font-bold text-xs">
                          {c.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-800">{c.name}</p>
                          <p className="text-[10px] text-slate-400">{c.department || c.role} • {c.email}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold text-brand-700 bg-brand-100/60 px-2 py-0.5 rounded-md">
                        Chat
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* B. NEW GROUP CHAT MODAL */}
      {showGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">Create Group Conversation</h3>
              <button onClick={() => setShowGroupModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Group Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Marketing Sprint, Design Review"
                  value={newGroupTitle}
                  onChange={(e) => setNewGroupTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description (Optional)</label>
                <textarea
                  placeholder="Purpose of this group..."
                  rows={2}
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Add Members ({selectedMemberIds.length} selected)
                </label>
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl p-2 divide-y divide-slate-100">
                  {colleagues.map((c) => {
                    const isSelected = selectedMemberIds.includes(c.id);
                    return (
                      <label key={c.id} className="flex items-center space-x-2 p-1.5 hover:bg-slate-50 rounded cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedMemberIds([...selectedMemberIds, c.id]);
                            } else {
                              setSelectedMemberIds(selectedMemberIds.filter((id) => id !== c.id));
                            }
                          }}
                          className="rounded text-brand-600 focus:ring-brand-500"
                        />
                        <span className="font-medium text-slate-800">{c.name}</span>
                        <span className="text-[10px] text-slate-400">({c.department || c.role})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowGroupModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newGroupTitle.trim()}
                  className="px-4 py-1.5 text-xs font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 shadow-sm shadow-brand-500/20 disabled:opacity-50"
                >
                  Create Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* C. DEPARTMENT CHANNEL SELECTOR MODAL */}
      {showDeptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">Select Department Channel</h3>
              <button onClick={() => setShowDeptModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 max-h-72 overflow-y-auto space-y-2">
              {departmentsList.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-4">No departments found.</p>
              ) : (
                departmentsList.map((d) => (
                  <div
                    key={d.id}
                    onClick={() => handleOpenDepartmentChat(d.id)}
                    className="p-3 bg-slate-50 hover:bg-blue-50/60 border border-slate-200 rounded-xl cursor-pointer flex items-center justify-between transition"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs">
                        <Building className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">{d.name}</h4>
                        <p className="text-[10px] text-slate-500">{d.code} • {d.member_count || 0} members</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold text-blue-700 bg-blue-100/60 px-2 py-0.5 rounded-md">
                      Open
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* D. PROJECT CHAT SELECTOR MODAL */}
      {showProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">Select Project Channel</h3>
              <button onClick={() => setShowProjectModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 max-h-72 overflow-y-auto space-y-2">
              {projectsList.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-4">No accessible projects found.</p>
              ) : (
                projectsList.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => handleOpenProjectChat(p.id)}
                    className="p-3 bg-slate-50 hover:bg-purple-50/60 border border-slate-200 rounded-xl cursor-pointer flex items-center justify-between transition"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-800 flex items-center justify-center font-bold text-xs">
                        <FolderGit2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">{p.name}</h4>
                        <p className="text-[10px] text-slate-500">{p.status || 'Active'} • Internal Stream</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold text-purple-700 bg-purple-100/60 px-2 py-0.5 rounded-md">
                      Open
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* E. WHATSAPP MESSAGE INFO MODAL (SEEN / DELIVERED DETAILS) */}
      {/* ========================================================= */}
      {selectedInfoMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-5 py-3.5 bg-[#008069] text-white flex items-center justify-between shadow-xs">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
                  <Info className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white leading-tight">Message info</h3>
                  <p className="text-[11px] text-emerald-100">
                    {messageInfoData?.conversation?.type === 'direct'
                      ? 'Direct message delivery & seen status'
                      : `${messageInfoData?.conversation?.title || 'Group'} receipts`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedInfoMessage(null);
                  setMessageInfoData(null);
                }}
                className="p-1 rounded-lg text-emerald-100 hover:text-white hover:bg-white/10 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 bg-slate-50 flex-1">
              {/* Message Bubble Preview */}
              <div className="bg-slate-200/50 p-3.5 rounded-xl border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1.5 block">
                  Message Preview
                </span>
                <div className="flex justify-end">
                  <div className="bg-gradient-to-r from-brand-600 to-brand-700 text-white rounded-2xl rounded-br-none px-3.5 py-2 text-xs shadow-xs max-w-[90%]">
                    {selectedInfoMessage.isDeleted ? (
                      <p className="italic text-brand-100">[This message was deleted]</p>
                    ) : (
                      <>
                        {selectedInfoMessage.replyTo && (
                          <div className="mb-1.5 p-1.5 rounded text-[11px] bg-brand-800/80 border-l-2 border-brand-300 text-brand-100">
                            <span className="font-semibold block">{selectedInfoMessage.replyTo.senderName}</span>
                            <span className="truncate block opacity-90">{selectedInfoMessage.replyTo.content}</span>
                          </div>
                        )}
                        <p className="whitespace-pre-wrap break-words leading-relaxed">{selectedInfoMessage.content}</p>
                      </>
                    )}
                    <div className="flex items-center justify-end space-x-1.5 mt-1 text-[10px] text-brand-200">
                      <span>Sent {formatDetailedDateTime(selectedInfoMessage.createdAt)}</span>
                      {(() => {
                        const tick = getMessageTickStatus(selectedInfoMessage);
                        if (tick === 'read') return <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb] stroke-[2.3]" />;
                        if (tick === 'delivered') return <CheckCheck className="w-3.5 h-3.5 text-white/85" />;
                        return <Check className="w-3.5 h-3.5 text-white/60" />;
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              {loadingMessageInfo ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-2">
                  <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs">Fetching delivery and seen receipts...</span>
                </div>
              ) : messageInfoError ? (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                  {messageInfoError}
                </div>
              ) : messageInfoData ? (
                <div className="space-y-4">
                  {/* Direct Conversation Layout */}
                  {messageInfoData.conversation.type === 'direct' ? (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100 shadow-xs">
                      {/* Read / Seen Row */}
                      <div className="p-4 flex items-start space-x-3.5 hover:bg-slate-50/60 transition">
                        <div className="w-9 h-9 rounded-full bg-sky-50 text-[#53bdeb] flex items-center justify-center shrink-0 border border-sky-100">
                          <CheckCheck className="w-5 h-5 stroke-[2.3]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold text-slate-800">Read (Seen)</h4>
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                messageInfoData.directStatus?.isRead
                                  ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {messageInfoData.directStatus?.isRead ? 'Seen' : 'Unread'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1 font-medium">
                            {messageInfoData.directStatus?.isRead
                              ? formatDetailedDateTime(messageInfoData.directStatus.readAt)
                              : 'Not read yet'}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Recipient: {messageInfoData.directStatus?.recipientName || 'Counterpart'}
                          </p>
                        </div>
                      </div>

                      {/* Delivered Row */}
                      <div className="p-4 flex items-start space-x-3.5 hover:bg-slate-50/60 transition">
                        <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0 border border-slate-200">
                          <CheckCheck className="w-5 h-5 stroke-[2]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold text-slate-800">Delivered</h4>
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                messageInfoData.directStatus?.isDelivered
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}
                            >
                              {messageInfoData.directStatus?.isDelivered ? 'Delivered' : 'Pending Device'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1 font-medium">
                            {messageInfoData.directStatus?.isDelivered
                              ? formatDetailedDateTime(messageInfoData.directStatus.deliveredAt)
                              : 'Not delivered yet (recipient device offline)'}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Status updates automatically when recipient is online.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Group / Channel Conversation Layout */
                    <div className="space-y-3">
                      {/* Summary Cards */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-lg bg-sky-50 text-[#53bdeb] flex items-center justify-center">
                            <CheckCheck className="w-4 h-4 stroke-[2.3]" />
                          </div>
                          <div>
                            <p className="text-[10px] uppercase font-bold text-slate-400">Read By</p>
                            <p className="text-sm font-bold text-slate-800">
                              {messageInfoData.summary?.readCount || 0} / {messageInfoData.summary?.totalRecipients || 0}
                            </p>
                          </div>
                        </div>

                        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                            <CheckCheck className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-[10px] uppercase font-bold text-slate-400">Delivered To</p>
                            <p className="text-sm font-bold text-slate-800">
                              {messageInfoData.summary?.deliveredCount || 0} / {messageInfoData.summary?.totalRecipients || 0}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Read By List */}
                      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                          <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-700">
                            <CheckCheck className="w-4 h-4 text-[#53bdeb] stroke-[2.3]" />
                            <span>Read by</span>
                          </div>
                          <span className="text-[10px] font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full">
                            {messageInfoData.readBy?.length || 0} members
                          </span>
                        </div>
                        <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                          {!messageInfoData.readBy || messageInfoData.readBy.length === 0 ? (
                            <p className="p-3 text-center text-xs text-slate-400 italic">
                              No participants have seen this message yet.
                            </p>
                          ) : (
                            messageInfoData.readBy.map((r) => (
                              <div key={r.userId} className="p-3 flex items-center justify-between hover:bg-slate-50/60">
                                <div className="flex items-center space-x-2.5">
                                  <div className="w-7 h-7 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center text-xs font-bold border border-brand-200">
                                    {r.name.slice(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <h5 className="text-xs font-bold text-slate-800">{r.name}</h5>
                                    <p className="text-[10px] text-slate-400">{r.department || r.role || 'Member'}</p>
                                  </div>
                                </div>
                                <span className="text-[11px] font-medium text-slate-600">
                                  {formatDetailedDateTime(r.readAt)}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Delivered To List */}
                      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                          <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-700">
                            <CheckCheck className="w-4 h-4 text-slate-400" />
                            <span>Delivered to</span>
                          </div>
                          <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                            {messageInfoData.deliveredTo?.length || 0} members
                          </span>
                        </div>
                        <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                          {!messageInfoData.deliveredTo || messageInfoData.deliveredTo.length === 0 ? (
                            <p className="p-3 text-center text-xs text-slate-400 italic">
                              Not delivered to any participants yet.
                            </p>
                          ) : (
                            messageInfoData.deliveredTo.map((d) => (
                              <div key={d.userId} className="p-3 flex items-center justify-between hover:bg-slate-50/60">
                                <div className="flex items-center space-x-2.5">
                                  <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-bold border border-slate-200">
                                    {d.name.slice(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <h5 className="text-xs font-bold text-slate-800">{d.name}</h5>
                                    <p className="text-[10px] text-slate-400">{d.department || d.role || 'Member'}</p>
                                  </div>
                                </div>
                                <span className="text-[11px] font-medium text-slate-600">
                                  {formatDetailedDateTime(d.deliveredAt)}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Remaining Members */}
                      {messageInfoData.remaining?.length > 0 && (
                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-700">Remaining</span>
                            <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                              {messageInfoData.remaining.length} unread
                            </span>
                          </div>
                          <div className="divide-y divide-slate-100 max-h-40 overflow-y-auto">
                            {messageInfoData.remaining.map((m) => (
                              <div key={m.userId} className="p-2.5 flex items-center justify-between hover:bg-slate-50/60">
                                <div className="flex items-center space-x-2">
                                  <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-bold">
                                    {m.name.slice(0, 2).toUpperCase()}
                                  </div>
                                  <span className="text-xs text-slate-700 font-medium">{m.name}</span>
                                </div>
                                <span
                                  className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${
                                    m.isDelivered
                                      ? 'text-slate-600 bg-slate-100'
                                      : 'text-amber-700 bg-amber-50'
                                  }`}
                                >
                                  {m.isDelivered ? 'Delivered' : 'Offline'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-white border-t border-slate-100 flex justify-end">
              <button
                onClick={() => {
                  setSelectedInfoMessage(null);
                  setMessageInfoData(null);
                }}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default ChatPage;
