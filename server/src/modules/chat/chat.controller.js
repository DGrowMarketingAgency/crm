import { ChatService } from './chat.service.js';

export class ChatController {
  /**
   * Search internal colleagues for starting direct conversations
   */
  static async searchColleagues(req, res, next) {
    try {
      const { search, departmentId } = req.query;
      const colleagues = await ChatService.searchColleagues(req.user, {
        search,
        departmentId: departmentId ? Number(departmentId) : null
      });
      return res.status(200).json({
        success: true,
        data: colleagues
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * List all conversations for the authenticated user
   */
  static async listConversations(req, res, next) {
    try {
      const { type, search } = req.query;
      const conversations = await ChatService.listConversations(req.user, { type, search });
      return res.status(200).json({
        success: true,
        data: conversations
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Start or open a 1:1 direct conversation
   */
  static async getOrCreateDirect(req, res, next) {
    try {
      const { targetUserId } = req.body;
      const conversation = await ChatService.getOrCreateDirectConversation(req.user, targetUserId);
      return res.status(200).json({
        success: true,
        data: conversation
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Create a new group conversation
   */
  static async createGroup(req, res, next) {
    try {
      const { title, description, memberIds } = req.body;
      const group = await ChatService.createGroupConversation(req.user, {
        title,
        description,
        memberIds
      });
      return res.status(201).json({
        success: true,
        data: group
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get or create department conversation
   */
  static async getOrCreateDepartment(req, res, next) {
    try {
      const { departmentId } = req.params;
      const conversation = await ChatService.getOrCreateDepartmentConversation(req.user, departmentId);
      return res.status(200).json({
        success: true,
        data: conversation
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get or create project conversation
   */
  static async getOrCreateProject(req, res, next) {
    try {
      const { projectId } = req.params;
      const conversation = await ChatService.getOrCreateProjectConversation(req.user, projectId);
      return res.status(200).json({
        success: true,
        data: conversation
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get conversation details and members
   */
  static async getConversationDetails(req, res, next) {
    try {
      const { conversationId } = req.params;
      const conversation = await ChatService.getConversationDetails(req.user, conversationId);
      return res.status(200).json({
        success: true,
        data: conversation
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * List paginated messages for a conversation
   */
  static async listMessages(req, res, next) {
    try {
      const { conversationId } = req.params;
      const { limit, beforeId } = req.query;
      const messages = await ChatService.listMessages(req.user, conversationId, { limit, beforeId });
      return res.status(200).json({
        success: true,
        data: messages
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Send a message (text or file attachment)
   */
  static async sendMessage(req, res, next) {
    try {
      const { conversationId } = req.params;
      const { content, messageType, replyToId } = req.body;
      const file = req.file || null;

      const message = await ChatService.sendMessage(req.user, conversationId, {
        content,
        messageType,
        replyToId: replyToId ? Number(replyToId) : null,
        file
      });

      return res.status(201).json({
        success: true,
        data: message
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Edit a message
   */
  static async editMessage(req, res, next) {
    try {
      const { messageId } = req.params;
      const { content } = req.body;
      const updated = await ChatService.editMessage(req.user, messageId, content);
      return res.status(200).json({
        success: true,
        data: updated
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Delete or retract a message
   */
  static async deleteMessage(req, res, next) {
    try {
      const { messageId } = req.params;
      const result = await ChatService.deleteMessage(req.user, messageId);
      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Mark conversation as read
   */
  static async markConversationAsRead(req, res, next) {
    try {
      const { conversationId } = req.params;
      const { upToMessageId } = req.body;
      const result = await ChatService.markConversationAsRead(req.user, conversationId, { upToMessageId });
      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Add members to group
   */
  static async addMembers(req, res, next) {
    try {
      const { conversationId } = req.params;
      const { memberIds } = req.body;
      const result = await ChatService.addMembers(req.user, conversationId, memberIds);
      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Remove member from group
   */
  static async removeMember(req, res, next) {
    try {
      const { conversationId, userId } = req.params;
      const result = await ChatService.removeMember(req.user, conversationId, userId);
      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Authenticated attachment download / preview
   */
  static async downloadAttachment(req, res, next) {
    try {
      const { messageId } = req.params;
      const attachment = await ChatService.getAttachmentFile(req.user, messageId);

      res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.fileName)}"`);
      return res.sendFile(attachment.filePath);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get total unread count for badge indicators
   */
  static async getTotalUnread(req, res, next) {
    try {
      const unreadCount = await ChatService.getTotalUnreadCount(req.user);
      return res.status(200).json({
        success: true,
        data: { unreadCount }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get WhatsApp-style Message Info (seen / read time, delivered time, participant breakdown)
   */
  static async getMessageInfo(req, res, next) {
    try {
      const { messageId } = req.params;
      const info = await ChatService.getMessageInfo(req.user, messageId);
      return res.status(200).json({
        success: true,
        data: info
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Mark messages as delivered
   */
  static async markDelivered(req, res, next) {
    try {
      const { conversationId } = req.params;
      const { messageIds } = req.body;
      const result = await ChatService.markConversationAsDelivered(req.user, conversationId, messageIds);
      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }
}
