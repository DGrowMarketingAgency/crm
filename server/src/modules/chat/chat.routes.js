import { Router } from 'express';
import { ChatController } from './chat.controller.js';
import { chatAttachmentUpload } from './chat.upload.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';

const router = Router();

// Internal employee guard: Strictly prohibit client portal users
function requireInternalUser(req, res, next) {
  if (req.user?.role === 'client' || req.user?.client_id) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Access denied: Client portal accounts cannot access internal team communications.',
        code: 'CLIENT_CHAT_FORBIDDEN'
      }
    });
  }
  next();
}

router.use(authenticate);
router.use('/chat', requireInternalUser);

// Search internal colleagues for 1:1 chat
router.get(
  '/chat/colleagues',
  requirePermission('chat.view'),
  ChatController.searchColleagues
);

// Total unread count badge
router.get(
  '/chat/unread-count',
  requirePermission('chat.view'),
  ChatController.getTotalUnread
);

// List conversations
router.get(
  '/chat/conversations',
  requirePermission('chat.view'),
  ChatController.listConversations
);

// Create or get 1:1 direct conversation
router.post(
  '/chat/conversations/direct',
  requirePermission('chat.create_direct'),
  ChatController.getOrCreateDirect
);

// Create custom group conversation
router.post(
  '/chat/conversations/group',
  requirePermission('chat.create_group'),
  ChatController.createGroup
);

// Get or initialize department conversation
router.get(
  '/chat/conversations/department/:departmentId',
  requirePermission('chat.view'),
  ChatController.getOrCreateDepartment
);

// Get or initialize project conversation
router.get(
  '/chat/conversations/project/:projectId',
  requirePermission('chat.view'),
  ChatController.getOrCreateProject
);

// Get conversation details & members
router.get(
  '/chat/conversations/:conversationId',
  requirePermission('chat.view'),
  ChatController.getConversationDetails
);

// Add members to group
router.post(
  '/chat/conversations/:conversationId/members',
  requirePermission('chat.manage_members'),
  ChatController.addMembers
);

// Remove member from group
router.delete(
  '/chat/conversations/:conversationId/members/:userId',
  requirePermission('chat.manage_members'),
  ChatController.removeMember
);

// List paginated messages
router.get(
  '/chat/conversations/:conversationId/messages',
  requirePermission('chat.view'),
  ChatController.listMessages
);

// Send message (text, attachment, or reply)
router.post(
  '/chat/conversations/:conversationId/messages',
  requirePermission('chat.send'),
  chatAttachmentUpload.single('file'),
  ChatController.sendMessage
);

// Mark conversation as read
router.post(
  '/chat/conversations/:conversationId/read',
  requirePermission('chat.send'),
  ChatController.markConversationAsRead
);

// Mark messages as delivered
router.post(
  '/chat/conversations/:conversationId/delivered',
  requirePermission('chat.view'),
  ChatController.markDelivered
);

// Get WhatsApp-style Message Info (seen/read timestamps, delivered timestamps, recipient breakdown)
router.get(
  '/chat/messages/:messageId/info',
  requirePermission('chat.view'),
  ChatController.getMessageInfo
);

// Edit message
router.patch(
  '/chat/messages/:messageId',
  requirePermission('chat.send'),
  ChatController.editMessage
);

// Delete message
router.delete(
  '/chat/messages/:messageId',
  requirePermission('chat.send'),
  ChatController.deleteMessage
);

// Download / preview attachment
router.get(
  '/chat/attachments/:messageId/download',
  requirePermission('chat.view'),
  ChatController.downloadAttachment
);

export default router;
