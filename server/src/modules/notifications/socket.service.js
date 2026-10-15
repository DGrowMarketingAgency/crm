import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { pool } from '../../config/db.js';

class SocketService {
  constructor() {
    this.io = null;
  }

  init(httpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: env.CLIENT_URL,
        credentials: true
      }
    });

    // Authenticate socket connections using JWT token
    this.io.use((socket, next) => {
      try {
        let token = socket.handshake.auth?.token;

        if (!token && socket.handshake.headers?.authorization) {
          const parts = socket.handshake.headers.authorization.split(' ');
          if (parts.length === 2 && parts[0] === 'Bearer') {
            token = parts[1];
          }
        }

        // Try cookies if not found in auth
        if (!token && socket.handshake.headers?.cookie) {
          const cookieStr = socket.handshake.headers.cookie;
          const match = cookieStr.match(/access_token=([^;]+)/);
          if (match) {
            token = match[1];
          }
        }

        if (!token) {
          return next(new Error('Authentication error: Missing token'));
        }

        const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
        socket.user = decoded;
        next();
      } catch (err) {
        return next(new Error('Authentication error: Invalid session'));
      }
    });

    this.io.on('connection', (socket) => {
      const userId = socket.user?.id || socket.user?.userId;
      if (userId) {
        // Join private user room
        const room = `user:${userId}`;
        socket.join(room);

        // Notify delivery handler if registered
        if (this.onUserConnectedHandler) {
          try {
            this.onUserConnectedHandler(userId, socket.user?.name);
          } catch (e) {
            console.error('Error in onUserConnectedHandler:', e);
          }
        }
      }

      // Explicit delivery acknowledgment from client
      socket.on('chat:delivered', async (payload) => {
        try {
          if (this.onMessagesDeliveredHandler && userId) {
            await this.onMessagesDeliveredHandler(userId, socket.user?.name, payload);
          }
        } catch (err) {
          console.error('Error handling chat:delivered:', err);
        }
      });

      // Authorize and join a conversation room
      socket.on('chat:join', async (payload, callback) => {
        try {
          const conversationId = typeof payload === 'object' ? payload?.conversationId : payload;
          if (!conversationId) {
            if (typeof callback === 'function') callback({ success: false, error: 'Missing conversationId' });
            return;
          }

          // Strict verification: user must be an active member of this conversation
          const [membership] = await pool.query(
            'SELECT 1 FROM chat_conversation_members WHERE conversation_id = ? AND user_id = ?',
            [conversationId, userId]
          );

          if (membership.length === 0) {
            if (typeof callback === 'function') {
              callback({ success: false, error: 'Unauthorized: Not a member of this conversation' });
            }
            return;
          }

          const convRoom = `conversation:${conversationId}`;
          socket.join(convRoom);
          if (typeof callback === 'function') {
            callback({ success: true, conversationId });
          }
        } catch (err) {
          if (typeof callback === 'function') callback({ success: false, error: err.message });
        }
      });

      // Leave a conversation room
      socket.on('chat:leave', (payload) => {
        const conversationId = typeof payload === 'object' ? payload?.conversationId : payload;
        if (conversationId) {
          socket.leave(`conversation:${conversationId}`);
        }
      });

      // Typing indicator
      socket.on('chat:typing', (payload) => {
        const conversationId = typeof payload === 'object' ? payload?.conversationId : payload;
        if (conversationId && socket.rooms.has(`conversation:${conversationId}`)) {
          socket.to(`conversation:${conversationId}`).emit('chat:user_typing', {
            conversationId,
            userId,
            userName: socket.user?.name || socket.user?.email || 'Someone'
          });
        }
      });

      // Stop typing indicator
      socket.on('chat:stop_typing', (payload) => {
        const conversationId = typeof payload === 'object' ? payload?.conversationId : payload;
        if (conversationId && socket.rooms.has(`conversation:${conversationId}`)) {
          socket.to(`conversation:${conversationId}`).emit('chat:user_stop_typing', {
            conversationId,
            userId
          });
        }
      });

      socket.on('disconnect', () => {
        // Disconnected
      });
    });

    return this.io;
  }

  /**
   * Register hook for when a user connects (to catch up pending deliveries)
   */
  setOnUserConnected(handler) {
    this.onUserConnectedHandler = handler;
  }

  /**
   * Register hook for when a user explicitly acknowledges delivery
   */
  setOnMessagesDelivered(handler) {
    this.onMessagesDeliveredHandler = handler;
  }

  /**
   * Check if user currently has an active socket connection
   */
  isUserOnline(userId) {
    if (!this.io || !userId) return false;
    const room = this.io.sockets?.adapter?.rooms?.get(`user:${userId}`);
    return Boolean(room && room.size > 0);
  }

  /**
   * Emits a real-time event to an authenticated user's private room
   */
  emitToUser(userId, event, data) {
    if (!this.io || !userId) return;
    const room = `user:${userId}`;
    this.io.to(room).emit(event, data);
  }

  /**
   * Emits a real-time event to all members currently in a conversation room
   */
  emitToConversation(conversationId, event, data) {
    if (!this.io || !conversationId) return;
    const room = `conversation:${conversationId}`;
    this.io.to(room).emit(event, data);
  }
}

export const socketService = new SocketService();

