import { pool } from '../../config/db.js';
import { socketService } from '../notifications/socket.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ProjectsPolicy } from '../projects/projects.policy.js';
import path from 'path';
import fs from 'fs';
import { uploadDir } from './chat.upload.js';

export class ChatService {
  /**
   * Search eligible internal colleagues for direct messaging.
   * Excludes clients and the requesting user.
   * Strips all sensitive HR/auth fields.
   */
  static async searchColleagues(actorUser, { search = '', departmentId = null }) {
    let sql = `
      SELECT u.id, u.name, u.email, u.role, u.department, u.phone, u.status
      FROM users u
      WHERE u.id != ?
        AND u.status = 'active'
        AND (u.role != 'client' OR u.role IS NULL)
        AND u.client_id IS NULL
    `;
    const params = [actorUser.id];

    if (search && search.trim()) {
      sql += ` AND (u.name LIKE ? OR u.email LIKE ? OR u.department LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    if (departmentId) {
      sql += ` AND (
        u.id IN (SELECT user_id FROM department_members WHERE department_id = ?)
        OR u.department = (SELECT name FROM departments WHERE id = ?)
      )`;
      params.push(departmentId, departmentId);
    }

    sql += ` ORDER BY u.name ASC LIMIT 50`;

    const [rows] = await pool.query(sql, params);
    return rows.map((u) => ({
      id: Number(u.id),
      name: u.name,
      email: u.email,
      role: u.role,
      department: u.department,
      phone: u.phone,
      status: u.status
    }));
  }

  /**
   * List all conversations for the current actor user with unread counts and recent message
   */
  static async listConversations(actorUser, { type = null, search = '' } = {}) {
    let sql = `
      SELECT 
        c.id, c.type, c.title, c.description, c.avatar_url,
        c.department_id, c.project_id, c.direct_user1_id, c.direct_user2_id,
        c.created_by, c.last_message_id, c.last_message_at, c.created_at,
        cm.role AS my_role, cm.last_read_at, cm.is_muted,
        d.name AS department_name,
        p.name AS project_name,
        lm.content AS last_message_content,
        lm.message_type AS last_message_type,
        lm.sender_id AS last_message_sender_id,
        lm.created_at AS last_message_created_at,
        lms.name AS last_message_sender_name,
        (
          SELECT COUNT(*)
          FROM chat_messages unread_msg
          WHERE unread_msg.conversation_id = c.id
            AND unread_msg.sender_id != ?
            AND unread_msg.is_deleted = 0
            AND NOT EXISTS (
              SELECT 1 FROM chat_message_reads r
              WHERE r.message_id = unread_msg.id AND r.user_id = ?
            )
        ) AS unread_count
      FROM chat_conversation_members cm
      JOIN chat_conversations c ON cm.conversation_id = c.id
      LEFT JOIN departments d ON c.department_id = d.id
      LEFT JOIN projects p ON c.project_id = p.id
      LEFT JOIN chat_messages lm ON c.last_message_id = lm.id
      LEFT JOIN users lms ON lm.sender_id = lms.id
      WHERE cm.user_id = ?
    `;
    const params = [actorUser.id, actorUser.id, actorUser.id];

    if (type) {
      sql += ` AND c.type = ?`;
      params.push(type);
    }

    if (search && search.trim()) {
      sql += ` AND (
        c.title LIKE ? 
        OR d.name LIKE ? 
        OR p.name LIKE ?
        OR EXISTS (
          SELECT 1 FROM chat_conversation_members scm
          JOIN users su ON scm.user_id = su.id
          WHERE scm.conversation_id = c.id AND scm.user_id != ? AND su.name LIKE ?
        )
      )`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, actorUser.id, term);
    }

    sql += ` ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`;

    const [rows] = await pool.query(sql, params);

    // Enrich direct conversations with the counterpart user details
    const conversations = await Promise.all(
      rows.map(async (row) => {
        let otherUser = null;
        let displayName = row.title;

        if (row.type === 'direct') {
          const otherUserId = Number(row.direct_user1_id) === Number(actorUser.id)
            ? Number(row.direct_user2_id)
            : Number(row.direct_user1_id);

          const [userRows] = await pool.query(
            'SELECT id, name, email, role, department, status FROM users WHERE id = ?',
            [otherUserId]
          );

          if (userRows.length > 0) {
            otherUser = {
              id: Number(userRows[0].id),
              name: userRows[0].name,
              email: userRows[0].email,
              role: userRows[0].role,
              department: userRows[0].department,
              status: userRows[0].status
            };
            displayName = otherUser.name;
          }
        } else if (row.type === 'department') {
          displayName = row.department_name ? `${row.department_name} Team` : (row.title || 'Department Chat');
        } else if (row.type === 'project') {
          displayName = row.project_name ? `${row.project_name}` : (row.title || 'Project Chat');
        }

        return {
          id: Number(row.id),
          type: row.type,
          title: displayName,
          rawTitle: row.title,
          description: row.description,
          avatarUrl: row.avatar_url,
          departmentId: row.department_id ? Number(row.department_id) : null,
          departmentName: row.department_name,
          projectId: row.project_id ? Number(row.project_id) : null,
          projectName: row.project_name,
          myRole: row.my_role,
          lastReadAt: row.last_read_at,
          isMuted: Boolean(row.is_muted),
          unreadCount: Number(row.unread_count || 0),
          otherUser,
          lastMessage: row.last_message_id ? {
            id: Number(row.last_message_id),
            content: row.last_message_content,
            messageType: row.last_message_type,
            senderId: Number(row.last_message_sender_id),
            senderName: row.last_message_sender_name,
            createdAt: row.last_message_created_at
          } : null,
          lastMessageAt: row.last_message_at,
          createdAt: row.created_at
        };
      })
    );

    return conversations;
  }

  /**
   * Get or create a 1:1 direct conversation between actor and target user.
   * Concurrently safe via unique constraint (direct_user1_id, direct_user2_id).
   */
  static async getOrCreateDirectConversation(actorUser, targetUserId) {
    const targetId = Number(targetUserId);
    if (!targetId || targetId === Number(actorUser.id)) {
      const err = new Error('Cannot start a direct conversation with yourself or invalid recipient.');
      err.status = 400;
      err.code = 'INVALID_RECIPIENT';
      throw err;
    }

    // Verify recipient is valid internal employee (NOT a client)
    const [targetRows] = await pool.query(
      'SELECT id, name, email, role, department, client_id, status FROM users WHERE id = ?',
      [targetId]
    );

    if (targetRows.length === 0) {
      const err = new Error('User not found.');
      err.status = 404;
      err.code = 'USER_NOT_FOUND';
      throw err;
    }

    const targetUser = targetRows[0];
    if (targetUser.role === 'client' || targetUser.client_id) {
      const err = new Error('Direct internal chat is not permitted with client users.');
      err.status = 403;
      err.code = 'CLIENT_CHAT_FORBIDDEN';
      throw err;
    }

    const u1 = Math.min(Number(actorUser.id), targetId);
    const u2 = Math.max(Number(actorUser.id), targetId);

    // Check existing conversation
    const [existing] = await pool.query(
      'SELECT id FROM chat_conversations WHERE direct_user1_id = ? AND direct_user2_id = ? AND type = "direct"',
      [u1, u2]
    );

    let conversationId;
    if (existing.length > 0) {
      conversationId = existing[0].id;
    } else {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const [insertRes] = await conn.query(
          `INSERT INTO chat_conversations (type, direct_user1_id, direct_user2_id, created_by)
           VALUES ('direct', ?, ?, ?)`,
          [u1, u2, actorUser.id]
        );
        conversationId = insertRes.insertId;

        // Add both members
        await conn.query(
          `INSERT INTO chat_conversation_members (conversation_id, user_id, role)
           VALUES (?, ?, 'member'), (?, ?, 'member')`,
          [conversationId, u1, conversationId, u2]
        );

        await conn.commit();
      } catch (err) {
        await conn.rollback();
        // If unique key hit due to concurrent request, fetch the winner
        if (err.code === 'ER_DUP_ENTRY') {
          const [winner] = await pool.query(
            'SELECT id FROM chat_conversations WHERE direct_user1_id = ? AND direct_user2_id = ? AND type = "direct"',
            [u1, u2]
          );
          if (winner.length > 0) {
            conversationId = winner[0].id;
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      } finally {
        conn.release();
      }
    }

    return this.getConversationDetails(actorUser, conversationId);
  }

  /**
   * Create a new group conversation
   */
  static async createGroupConversation(actorUser, { title, description = '', memberIds = [] }) {
    const trimmedTitle = (title || '').trim();
    if (!trimmedTitle || trimmedTitle.length < 2 || trimmedTitle.length > 100) {
      const err = new Error('Group title is required (between 2 and 100 characters).');
      err.status = 400;
      err.code = 'INVALID_GROUP_TITLE';
      throw err;
    }

    // Filter valid internal member IDs
    const uniqueUserIds = Array.from(new Set([
      Number(actorUser.id),
      ...(Array.isArray(memberIds) ? memberIds.map(Number).filter(Boolean) : [])
    ]));

    // Verify all members are internal non-client users
    const [validUsers] = await pool.query(
      `SELECT id, name FROM users 
       WHERE id IN (?) AND status = 'active' AND (role != 'client' OR role IS NULL) AND client_id IS NULL`,
      [uniqueUserIds]
    );

    if (validUsers.length === 0) {
      const err = new Error('No valid internal members selected for this group.');
      err.status = 400;
      err.code = 'NO_VALID_MEMBERS';
      throw err;
    }

    const conn = await pool.getConnection();
    let conversationId;
    try {
      await conn.beginTransaction();

      const [res] = await conn.query(
        `INSERT INTO chat_conversations (type, title, description, created_by)
         VALUES ('group', ?, ?, ?)`,
        [trimmedTitle, description ? description.trim() : null, actorUser.id]
      );
      conversationId = res.insertId;

      // Add members: creator is 'admin', others are 'member'
      for (const u of validUsers) {
        const role = Number(u.id) === Number(actorUser.id) ? 'admin' : 'member';
        await conn.query(
          `INSERT INTO chat_conversation_members (conversation_id, user_id, role)
           VALUES (?, ?, ?)`,
          [conversationId, u.id, role]
        );
      }

      // Create system message
      const [sysRes] = await conn.query(
        `INSERT INTO chat_messages (conversation_id, sender_id, message_type, content)
         VALUES (?, ?, 'system', ?)`,
        [conversationId, actorUser.id, `${actorUser.name || 'Admin'} created group "${trimmedTitle}"`]
      );

      await conn.query(
        `UPDATE chat_conversations SET last_message_id = ?, last_message_at = NOW() WHERE id = ?`,
        [sysRes.insertId, conversationId]
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    const conversation = await this.getConversationDetails(actorUser, conversationId);

    // Notify all members
    for (const u of validUsers) {
      if (Number(u.id) !== Number(actorUser.id)) {
        socketService.emitToUser(u.id, 'chat:conversation_created', conversation);
      }
    }

    return conversation;
  }

  /**
   * Get or create a department conversation scoped to eligible department members.
   */
  static async getOrCreateDepartmentConversation(actorUser, departmentId) {
    const deptId = Number(departmentId);
    if (!deptId) {
      const err = new Error('Invalid department ID.');
      err.status = 400;
      err.code = 'INVALID_DEPARTMENT_ID';
      throw err;
    }

    // Verify department exists
    const [deptRows] = await pool.query('SELECT id, name, description FROM departments WHERE id = ?', [deptId]);
    if (deptRows.length === 0) {
      const err = new Error('Department not found.');
      err.status = 404;
      err.code = 'DEPARTMENT_NOT_FOUND';
      throw err;
    }
    const dept = deptRows[0];

    // Verify actor access: admin/owner OR member of this department
    const isGlobal = ProjectsPolicy.isGlobalAdmin(actorUser);
    const [membership] = await pool.query(
      `SELECT 1 FROM users WHERE id = ? AND (department = ? OR id IN (SELECT user_id FROM department_members WHERE department_id = ?))`,
      [actorUser.id, dept.name, deptId]
    );

    if (!isGlobal && membership.length === 0) {
      const err = new Error('Access denied: You are not assigned to this department.');
      err.status = 403;
      err.code = 'DEPARTMENT_ACCESS_DENIED';
      throw err;
    }

    // Fetch existing department conversation or create
    const [existing] = await pool.query(
      'SELECT id FROM chat_conversations WHERE department_id = ? AND type = "department"',
      [deptId]
    );

    let conversationId;
    if (existing.length > 0) {
      conversationId = existing[0].id;
    } else {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const [insertRes] = await conn.query(
          `INSERT INTO chat_conversations (type, title, description, department_id, created_by)
           VALUES ('department', ?, ?, ?, ?)`,
          [`${dept.name} Channel`, dept.description, deptId, actorUser.id]
        );
        conversationId = insertRes.insertId;

        await conn.commit();
      } catch (err) {
        await conn.rollback();
        if (err.code === 'ER_DUP_ENTRY') {
          const [winner] = await pool.query(
            'SELECT id FROM chat_conversations WHERE department_id = ? AND type = "department"',
            [deptId]
          );
          conversationId = winner[0].id;
        } else {
          throw err;
        }
      } finally {
        conn.release();
      }
    }

    // Synchronize current department members into chat_conversation_members
    const [deptMembers] = await pool.query(
      `SELECT id FROM users 
       WHERE status = 'active' 
         AND (role != 'client' OR role IS NULL) 
         AND client_id IS NULL 
         AND (department = ? OR id IN (SELECT user_id FROM department_members WHERE department_id = ?))`,
      [dept.name, deptId]
    );

    for (const m of deptMembers) {
      await pool.query(
        `INSERT IGNORE INTO chat_conversation_members (conversation_id, user_id, role)
         VALUES (?, ?, 'member')`,
        [conversationId, m.id]
      );
    }

    return this.getConversationDetails(actorUser, conversationId);
  }

  /**
   * Get or create a project conversation strictly scoped to internal project members.
   */
  static async getOrCreateProjectConversation(actorUser, projectId) {
    const projId = Number(projectId);
    if (!projId) {
      const err = new Error('Invalid project ID.');
      err.status = 400;
      err.code = 'INVALID_PROJECT_ID';
      throw err;
    }

    // Disallow clients
    if (actorUser.role === 'client' || actorUser.client_id) {
      const err = new Error('Client users are not permitted to access internal project chat.');
      err.status = 403;
      err.code = 'PROJECT_CHAT_FORBIDDEN';
      throw err;
    }

    // Verify project exists
    const [projRows] = await pool.query(
      'SELECT id, name, description, project_manager_id FROM projects WHERE id = ?',
      [projId]
    );
    if (projRows.length === 0) {
      const err = new Error('Project not found.');
      err.status = 404;
      err.code = 'PROJECT_NOT_FOUND';
      throw err;
    }
    const project = projRows[0];

    // Check internal project access
    const isGlobal = ProjectsPolicy.isGlobalAdmin(actorUser);
    let hasAccess = isGlobal || Number(project.project_manager_id) === Number(actorUser.id);

    if (!hasAccess) {
      const [pm] = await pool.query(
        'SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?',
        [projId, actorUser.id]
      );
      if (pm.length > 0) hasAccess = true;
    }

    if (!hasAccess) {
      const [pt] = await pool.query(
        `SELECT 1 FROM project_teams pt 
         JOIN team_members tm ON pt.team_id = tm.team_id 
         WHERE pt.project_id = ? AND tm.user_id = ?`,
        [projId, actorUser.id]
      );
      if (pt.length > 0) hasAccess = true;
    }

    if (!hasAccess) {
      const err = new Error('Access denied: You are not an internal member of this project.');
      err.status = 403;
      err.code = 'PROJECT_ACCESS_DENIED';
      throw err;
    }

    // Fetch existing or create
    const [existing] = await pool.query(
      'SELECT id FROM chat_conversations WHERE project_id = ? AND type = "project"',
      [projId]
    );

    let conversationId;
    if (existing.length > 0) {
      conversationId = existing[0].id;
    } else {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const [insertRes] = await conn.query(
          `INSERT INTO chat_conversations (type, title, description, project_id, created_by)
           VALUES ('project', ?, ?, ?, ?)`,
          [`${project.name} Chat`, project.description, projId, actorUser.id]
        );
        conversationId = insertRes.insertId;

        await conn.commit();
      } catch (err) {
        await conn.rollback();
        if (err.code === 'ER_DUP_ENTRY') {
          const [winner] = await pool.query(
            'SELECT id FROM chat_conversations WHERE project_id = ? AND type = "project"',
            [projId]
          );
          conversationId = winner[0].id;
        } else {
          throw err;
        }
      } finally {
        conn.release();
      }
    }

    // Enroll actor
    await pool.query(
      `INSERT IGNORE INTO chat_conversation_members (conversation_id, user_id, role)
       VALUES (?, ?, 'member')`,
      [conversationId, actorUser.id]
    );

    // Enroll PM if present
    if (project.project_manager_id) {
      await pool.query(
        `INSERT IGNORE INTO chat_conversation_members (conversation_id, user_id, role)
         VALUES (?, ?, 'admin')`,
        [conversationId, project.project_manager_id]
      );
    }

    return this.getConversationDetails(actorUser, conversationId);
  }

  /**
   * Get conversation details, membership status, and member roster.
   */
  static async getConversationDetails(actorUser, conversationId) {
    const convId = Number(conversationId);
    if (!convId) {
      const err = new Error('Invalid conversation ID.');
      err.status = 400;
      err.code = 'INVALID_CONVERSATION_ID';
      throw err;
    }

    const [convRows] = await pool.query(
      `SELECT c.*, 
              d.name AS department_name, 
              p.name AS project_name
       FROM chat_conversations c
       LEFT JOIN departments d ON c.department_id = d.id
       LEFT JOIN projects p ON c.project_id = p.id
       WHERE c.id = ?`,
      [convId]
    );

    if (convRows.length === 0) {
      const err = new Error('Conversation not found.');
      err.status = 404;
      err.code = 'CONVERSATION_NOT_FOUND';
      throw err;
    }

    const conv = convRows[0];

    // Check membership authorization
    const [membership] = await pool.query(
      'SELECT role, last_read_at, is_muted FROM chat_conversation_members WHERE conversation_id = ? AND user_id = ?',
      [convId, actorUser.id]
    );

    if (membership.length === 0) {
      const err = new Error('Access denied: You are not a member of this conversation.');
      err.status = 403;
      err.code = 'CONVERSATION_ACCESS_DENIED';
      throw err;
    }

    // Fetch conversation members
    const [members] = await pool.query(
      `SELECT cm.user_id, cm.role, cm.joined_at, cm.last_read_at,
              u.name, u.email, u.role AS system_role, u.department, u.status
       FROM chat_conversation_members cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.conversation_id = ?
       ORDER BY (cm.role = 'admin') DESC, u.name ASC`,
      [convId]
    );

    let otherUser = null;
    let displayName = conv.title;

    if (conv.type === 'direct') {
      const otherUserId = Number(conv.direct_user1_id) === Number(actorUser.id)
        ? Number(conv.direct_user2_id)
        : Number(conv.direct_user1_id);

      const m = members.find((x) => Number(x.user_id) === otherUserId);
      if (m) {
        otherUser = {
          id: Number(m.user_id),
          name: m.name,
          email: m.email,
          role: m.system_role,
          department: m.department,
          status: m.status
        };
        displayName = m.name;
      }
    } else if (conv.type === 'department') {
      displayName = conv.department_name ? `${conv.department_name} Team` : (conv.title || 'Department Chat');
    } else if (conv.type === 'project') {
      displayName = conv.project_name ? `${conv.project_name}` : (conv.title || 'Project Chat');
    }

    return {
      id: Number(conv.id),
      type: conv.type,
      title: displayName,
      rawTitle: conv.title,
      description: conv.description,
      avatarUrl: conv.avatar_url,
      departmentId: conv.department_id ? Number(conv.department_id) : null,
      departmentName: conv.department_name,
      projectId: conv.project_id ? Number(conv.project_id) : null,
      projectName: conv.project_name,
      myRole: membership[0].role,
      lastReadAt: membership[0].last_read_at,
      isMuted: Boolean(membership[0].is_muted),
      otherUser,
      members: members.map((m) => ({
        userId: Number(m.user_id),
        name: m.name,
        email: m.email,
        systemRole: m.system_role,
        department: m.department,
        status: m.status,
        role: m.role,
        joinedAt: m.joined_at,
        lastReadAt: m.last_read_at
      })),
      createdAt: conv.created_at,
      updatedAt: conv.updated_at
    };
  }

  /**
   * Retrieve paginated message history for a conversation
   */
  static async listMessages(actorUser, conversationId, { limit = 50, beforeId = null } = {}) {
    const convId = Number(conversationId);
    const parsedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

    // Verify membership
    const [membership] = await pool.query(
      'SELECT 1 FROM chat_conversation_members WHERE conversation_id = ? AND user_id = ?',
      [convId, actorUser.id]
    );

    if (membership.length === 0) {
      const err = new Error('Access denied: You are not a member of this conversation.');
      err.status = 403;
      err.code = 'CONVERSATION_ACCESS_DENIED';
      throw err;
    }

    let sql = `
      SELECT 
        m.id, m.conversation_id, m.sender_id, m.message_type, m.content,
        m.reply_to_id, m.is_edited, m.edited_at, m.is_deleted, m.deleted_at, m.created_at,
        u.name AS sender_name, u.email AS sender_email, u.role AS sender_role, u.department AS sender_department,
        rm.content AS reply_content, rm.message_type AS reply_type, ru.name AS reply_sender_name
      FROM chat_messages m
      LEFT JOIN users u ON m.sender_id = u.id
      LEFT JOIN chat_messages rm ON m.reply_to_id = rm.id
      LEFT JOIN users ru ON rm.sender_id = ru.id
      WHERE m.conversation_id = ?
    `;
    const params = [convId];

    if (beforeId) {
      sql += ` AND m.id < ?`;
      params.push(Number(beforeId));
    }

    sql += ` ORDER BY m.id DESC LIMIT ?`;
    params.push(parsedLimit);

    const [rows] = await pool.query(sql, params);

    if (rows.length === 0) {
      return [];
    }

    const messageIds = rows.map((r) => r.id);

    // Fetch attachments for these messages
    const [attachments] = await pool.query(
      `SELECT id, message_id, conversation_id, file_name, file_url, file_size, mime_type, uploaded_by, created_at
       FROM chat_attachments
       WHERE message_id IN (?)`,
      [messageIds]
    );

    // Fetch read receipts for these messages
    const [reads] = await pool.query(
      `SELECT r.message_id, r.user_id, r.read_at, u.name AS user_name
       FROM chat_message_reads r
       JOIN users u ON r.user_id = u.id
       WHERE r.message_id IN (?)`,
      [messageIds]
    );

    // Fetch delivery receipts for these messages
    const [deliveries] = await pool.query(
      `SELECT d.message_id, d.user_id, d.delivered_at, u.name AS user_name
       FROM chat_message_deliveries d
       JOIN users u ON d.user_id = u.id
       WHERE d.message_id IN (?)`,
      [messageIds]
    );

    const attachmentsByMsg = new Map();
    for (const a of attachments) {
      const list = attachmentsByMsg.get(a.message_id) || [];
      list.push({
        id: Number(a.id),
        messageId: Number(a.message_id),
        fileName: a.file_name,
        fileUrl: a.file_url,
        fileSize: Number(a.file_size),
        mimeType: a.mime_type,
        uploadedBy: Number(a.uploaded_by),
        createdAt: a.created_at
      });
      attachmentsByMsg.set(a.message_id, list);
    }

    const readsByMsg = new Map();
    for (const r of reads) {
      const list = readsByMsg.get(r.message_id) || [];
      list.push({
        userId: Number(r.user_id),
        userName: r.user_name,
        readAt: r.read_at
      });
      readsByMsg.set(r.message_id, list);
    }

    const deliveriesByMsg = new Map();
    for (const d of deliveries) {
      const list = deliveriesByMsg.get(d.message_id) || [];
      list.push({
        userId: Number(d.user_id),
        userName: d.user_name,
        deliveredAt: d.delivered_at
      });
      deliveriesByMsg.set(d.message_id, list);
    }

    // Automatically record delivery for actorUser for any messages not sent by actorUser
    try {
      const [delivRes] = await pool.query(
        `INSERT IGNORE INTO chat_message_deliveries (conversation_id, message_id, user_id, delivered_at)
         SELECT m.conversation_id, m.id, ?, NOW()
         FROM chat_messages m
         WHERE m.id IN (?) AND m.sender_id != ?`,
        [actorUser.id, messageIds, actorUser.id]
      );
      if (delivRes.affectedRows > 0) {
        socketService.emitToConversation(convId, 'chat:messages_delivered', {
          conversationId: convId,
          userId: Number(actorUser.id),
          userName: actorUser.name,
          deliveredAt: new Date().toISOString()
        });
      }
    } catch (dErr) {
      // non-fatal delivery sync
    }

    // Format and return in chronological order (oldest to newest)
    const messages = rows.reverse().map((r) => ({
      id: Number(r.id),
      conversationId: Number(r.conversation_id),
      senderId: Number(r.sender_id),
      sender: {
        id: Number(r.sender_id),
        name: r.sender_name,
        email: r.sender_email,
        role: r.sender_role,
        department: r.sender_department
      },
      messageType: r.message_type,
      content: r.is_deleted ? '[This message was deleted]' : r.content,
      replyTo: r.reply_to_id ? {
        id: Number(r.reply_to_id),
        content: r.reply_content,
        messageType: r.reply_type,
        senderName: r.reply_sender_name
      } : null,
      attachments: r.is_deleted ? [] : (attachmentsByMsg.get(r.id) || []),
      readReceipts: readsByMsg.get(r.id) || [],
      deliveryReceipts: deliveriesByMsg.get(r.id) || [],
      isEdited: Boolean(r.is_edited),
      editedAt: r.edited_at,
      isDeleted: Boolean(r.is_deleted),
      deletedAt: r.deleted_at,
      createdAt: r.created_at
    }));

    return messages;
  }

  /**
   * Send a message (text, attachment, or reply)
   */
  static async sendMessage(actorUser, conversationId, { content = '', messageType = 'text', replyToId = null, file = null }) {
    const convId = Number(conversationId);

    // Verify actor is member of this conversation
    const [membership] = await pool.query(
      'SELECT role FROM chat_conversation_members WHERE conversation_id = ? AND user_id = ?',
      [convId, actorUser.id]
    );

    if (membership.length === 0) {
      const err = new Error('Access denied: You are not an active member of this conversation.');
      err.status = 403;
      err.code = 'CONVERSATION_ACCESS_DENIED';
      throw err;
    }

    let finalContent = (content || '').trim();
    let finalType = messageType || 'text';

    if (file) {
      const isImg = file.mimetype.startsWith('image/');
      finalType = isImg ? 'image' : 'file';
      if (!finalContent) {
        finalContent = file.originalname;
      }
    }

    if (!finalContent && !file) {
      const err = new Error('Message content or file attachment is required.');
      err.status = 400;
      err.code = 'EMPTY_MESSAGE';
      throw err;
    }

    if (finalContent.length > 5000) {
      const err = new Error('Message exceeds the maximum length of 5000 characters.');
      err.status = 400;
      err.code = 'MESSAGE_TOO_LONG';
      throw err;
    }

    let validReplyId = null;
    if (replyToId) {
      const [replyRows] = await pool.query(
        'SELECT id FROM chat_messages WHERE id = ? AND conversation_id = ?',
        [Number(replyToId), convId]
      );
      if (replyRows.length > 0) {
        validReplyId = replyRows[0].id;
      }
    }

    const conn = await pool.getConnection();
    let messageId;
    let attachmentRecord = null;

    try {
      await conn.beginTransaction();

      const [res] = await conn.query(
        `INSERT INTO chat_messages (conversation_id, sender_id, message_type, content, reply_to_id)
         VALUES (?, ?, ?, ?, ?)`,
        [convId, actorUser.id, finalType, finalContent, validReplyId]
      );
      messageId = res.insertId;

      if (file) {
        const fileUrl = `/uploads/chat/${file.filename}`;
        const [attRes] = await conn.query(
          `INSERT INTO chat_attachments (message_id, conversation_id, file_name, file_url, file_size, mime_type, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [messageId, convId, file.originalname, fileUrl, file.size, file.mimetype, actorUser.id]
        );

        attachmentRecord = {
          id: Number(attRes.insertId),
          messageId: Number(messageId),
          fileName: file.originalname,
          fileUrl,
          fileSize: file.size,
          mimeType: file.mimetype,
          uploadedBy: Number(actorUser.id),
          createdAt: new Date().toISOString()
        };
      }

      // Update conversation last message timestamp & id
      await conn.query(
        `UPDATE chat_conversations SET last_message_id = ?, last_message_at = NOW() WHERE id = ?`,
        [messageId, convId]
      );

      // Mark sender read receipt & delivery receipt
      await conn.query(
        `INSERT INTO chat_message_reads (message_id, conversation_id, user_id, read_at)
         VALUES (?, ?, ?, NOW())`,
        [messageId, convId, actorUser.id]
      );
      await conn.query(
        `INSERT INTO chat_message_deliveries (message_id, conversation_id, user_id, delivered_at)
         VALUES (?, ?, ?, NOW())`,
        [messageId, convId, actorUser.id]
      );

      // Update sender last_read_at in members
      await conn.query(
        `UPDATE chat_conversation_members SET last_read_at = NOW() WHERE conversation_id = ? AND user_id = ?`,
        [convId, actorUser.id]
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    // Build complete message object for broadcast
    let replySnippet = null;
    if (validReplyId) {
      const [rRows] = await pool.query(
        `SELECT m.content, m.message_type, u.name AS sender_name 
         FROM chat_messages m 
         JOIN users u ON m.sender_id = u.id 
         WHERE m.id = ?`,
        [validReplyId]
      );
      if (rRows.length > 0) {
        replySnippet = {
          id: Number(validReplyId),
          content: rRows[0].content,
          messageType: rRows[0].message_type,
          senderName: rRows[0].sender_name
        };
      }
    }

    // Fetch conversation members & identify online members for immediate delivery
    const [allMembers] = await pool.query(
      `SELECT cm.user_id, cm.is_muted, u.name 
       FROM chat_conversation_members cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.conversation_id = ?`,
      [convId]
    );

    const initialDeliveries = [
      { userId: Number(actorUser.id), userName: actorUser.name, deliveredAt: new Date().toISOString() }
    ];

    for (const member of allMembers) {
      const mUserId = Number(member.user_id);
      if (mUserId !== Number(actorUser.id) && socketService.isUserOnline(mUserId)) {
        try {
          await pool.query(
            `INSERT IGNORE INTO chat_message_deliveries (message_id, conversation_id, user_id, delivered_at)
             VALUES (?, ?, ?, NOW())`,
            [messageId, convId, mUserId]
          );
          initialDeliveries.push({
            userId: mUserId,
            userName: member.name || 'User',
            deliveredAt: new Date().toISOString()
          });
        } catch (e) {
          // ignore duplicate
        }
      }
    }

    const payload = {
      id: Number(messageId),
      conversationId: convId,
      senderId: Number(actorUser.id),
      sender: {
        id: Number(actorUser.id),
        name: actorUser.name,
        email: actorUser.email,
        role: actorUser.role,
        department: actorUser.department
      },
      messageType: finalType,
      content: finalContent,
      replyTo: replySnippet,
      attachments: attachmentRecord ? [attachmentRecord] : [],
      readReceipts: [{ userId: Number(actorUser.id), userName: actorUser.name, readAt: new Date().toISOString() }],
      deliveryReceipts: initialDeliveries,
      isEdited: false,
      editedAt: null,
      isDeleted: false,
      deletedAt: null,
      createdAt: new Date().toISOString()
    };

    // 1. Broadcast to conversation room
    socketService.emitToConversation(convId, 'chat:message', payload);

    // 2. Notify all members to update unread counts / push in-app notifications
    const [convInfo] = await pool.query('SELECT title, type FROM chat_conversations WHERE id = ?', [convId]);
    const convTitle = convInfo[0]?.title || 'Chat';

    for (const member of allMembers) {
      const mUserId = Number(member.user_id);
      if (mUserId !== Number(actorUser.id)) {
        // Emit unread bump event to user's private channel
        socketService.emitToUser(mUserId, 'chat:unread_bump', {
          conversationId: convId,
          lastMessage: payload
        });

        // If not muted, trigger in-app notification if direct chat
        if (!member.is_muted && convInfo[0]?.type === 'direct') {
          NotificationsService.createNotification({
            recipientUserId: mUserId,
            actorUserId: actorUser.id,
            type: 'chat_message',
            title: `New message from ${actorUser.name}`,
            message: finalContent.length > 80 ? finalContent.slice(0, 77) + '...' : finalContent,
            entityType: 'chat_conversation',
            entityId: convId,
            actionUrl: `/chat?c=${convId}`
          }).catch(() => {});
        }
      }
    }

    return payload;
  }

  /**
   * Edit one's own message within policy window (24h)
   */
  static async editMessage(actorUser, messageId, newContent) {
    const msgId = Number(messageId);
    const trimmed = (newContent || '').trim();

    if (!trimmed) {
      const err = new Error('Edited message content cannot be empty.');
      err.status = 400;
      err.code = 'EMPTY_CONTENT';
      throw err;
    }

    if (trimmed.length > 5000) {
      const err = new Error('Message exceeds the maximum limit of 5000 characters.');
      err.status = 400;
      err.code = 'MESSAGE_TOO_LONG';
      throw err;
    }

    const [msgRows] = await pool.query(
      'SELECT id, conversation_id, sender_id, message_type, is_deleted, created_at FROM chat_messages WHERE id = ?',
      [msgId]
    );

    if (msgRows.length === 0) {
      const err = new Error('Message not found.');
      err.status = 404;
      err.code = 'MESSAGE_NOT_FOUND';
      throw err;
    }

    const msg = msgRows[0];

    if (Number(msg.sender_id) !== Number(actorUser.id)) {
      const err = new Error('You can only edit your own messages.');
      err.status = 403;
      err.code = 'EDIT_FORBIDDEN';
      throw err;
    }

    if (msg.is_deleted) {
      const err = new Error('Cannot edit a deleted message.');
      err.status = 400;
      err.code = 'MESSAGE_DELETED';
      throw err;
    }

    if (msg.message_type === 'system') {
      const err = new Error('System messages cannot be edited.');
      err.status = 400;
      err.code = 'CANNOT_EDIT_SYSTEM_MESSAGE';
      throw err;
    }

    // 24 hour policy
    const createdAt = new Date(msg.created_at).getTime();
    if (Date.now() - createdAt > 24 * 60 * 60 * 1000) {
      const err = new Error('Messages older than 24 hours cannot be edited.');
      err.status = 400;
      err.code = 'EDIT_WINDOW_EXPIRED';
      throw err;
    }

    await pool.query(
      `UPDATE chat_messages SET content = ?, is_edited = 1, edited_at = NOW() WHERE id = ?`,
      [trimmed, msgId]
    );

    const updated = {
      messageId: msgId,
      conversationId: Number(msg.conversation_id),
      content: trimmed,
      isEdited: true,
      editedAt: new Date().toISOString()
    };

    socketService.emitToConversation(msg.conversation_id, 'chat:message_edited', updated);

    return updated;
  }

  /**
   * Delete or retract one's own message (or admin deletion)
   */
  static async deleteMessage(actorUser, messageId) {
    const msgId = Number(messageId);

    const [msgRows] = await pool.query(
      'SELECT id, conversation_id, sender_id, is_deleted FROM chat_messages WHERE id = ?',
      [msgId]
    );

    if (msgRows.length === 0) {
      const err = new Error('Message not found.');
      err.status = 404;
      err.code = 'MESSAGE_NOT_FOUND';
      throw err;
    }

    const msg = msgRows[0];
    const isGlobal = ProjectsPolicy.isGlobalAdmin(actorUser);

    if (Number(msg.sender_id) !== Number(actorUser.id) && !isGlobal) {
      const err = new Error('You do not have permission to delete this message.');
      err.status = 403;
      err.code = 'DELETE_FORBIDDEN';
      throw err;
    }

    if (msg.is_deleted) {
      return { success: true, messageId: msgId, conversationId: Number(msg.conversation_id) };
    }

    // Clean up any attachments for this message (both disk files and DB records)
    try {
      const [attRows] = await pool.query(
        'SELECT file_url FROM chat_attachments WHERE message_id = ?',
        [msgId]
      );
      for (const att of attRows) {
        if (att.file_url) {
          const diskFilename = path.basename(att.file_url);
          const absolutePath = path.join(uploadDir, diskFilename);
          if (fs.existsSync(absolutePath)) {
            try {
              fs.unlinkSync(absolutePath);
            } catch (unlinkErr) {
              console.error('Failed to unlink deleted message attachment:', unlinkErr);
            }
          }
        }
      }
      await pool.query('DELETE FROM chat_attachments WHERE message_id = ?', [msgId]);
    } catch (attErr) {
      console.error('Failed to clean up attachments on message delete:', attErr);
    }

    await pool.query(
      `UPDATE chat_messages 
       SET is_deleted = 1, deleted_at = NOW(), content = '[This message was deleted]'
       WHERE id = ?`,
      [msgId]
    );

    const deletedPayload = {
      messageId: msgId,
      conversationId: Number(msg.conversation_id),
      isDeleted: true,
      deletedAt: new Date().toISOString()
    };

    socketService.emitToConversation(msg.conversation_id, 'chat:message_deleted', deletedPayload);

    return deletedPayload;
  }

  /**
   * Mark a conversation as read up to the latest or specified message
   */
  static async markConversationAsRead(actorUser, conversationId, { upToMessageId = null } = {}) {
    const convId = Number(conversationId);

    // Verify membership
    const [membership] = await pool.query(
      'SELECT 1 FROM chat_conversation_members WHERE conversation_id = ? AND user_id = ?',
      [convId, actorUser.id]
    );

    if (membership.length === 0) {
      const err = new Error('Access denied: You are not a member of this conversation.');
      err.status = 403;
      err.code = 'CONVERSATION_ACCESS_DENIED';
      throw err;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Update membership last_read_at
      await conn.query(
        'UPDATE chat_conversation_members SET last_read_at = NOW() WHERE conversation_id = ? AND user_id = ?',
        [convId, actorUser.id]
      );

      // Ensure delivery is recorded for unread messages not sent by actorUser
      let delivSql = `
        INSERT IGNORE INTO chat_message_deliveries (message_id, conversation_id, user_id, delivered_at)
        SELECT id, conversation_id, ?, NOW()
        FROM chat_messages
        WHERE conversation_id = ? AND sender_id != ?
      `;
      const delivParams = [actorUser.id, convId, actorUser.id];
      if (upToMessageId) {
        delivSql += ` AND id <= ?`;
        delivParams.push(Number(upToMessageId));
      }
      await conn.query(delivSql, delivParams);

      // Insert read receipts for unread messages not sent by actorUser
      let readSql = `
        INSERT IGNORE INTO chat_message_reads (message_id, conversation_id, user_id, read_at)
        SELECT id, conversation_id, ?, NOW()
        FROM chat_messages
        WHERE conversation_id = ? AND sender_id != ?
      `;
      const readParams = [actorUser.id, convId, actorUser.id];

      if (upToMessageId) {
        readSql += ` AND id <= ?`;
        readParams.push(Number(upToMessageId));
      }

      await conn.query(readSql, readParams);

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    const nowIso = new Date().toISOString();
    const readPayload = {
      conversationId: convId,
      userId: Number(actorUser.id),
      userName: actorUser.name,
      readAt: nowIso
    };

    // Emit read receipt to conversation room
    socketService.emitToConversation(convId, 'chat:read_receipt', readPayload);

    // Also emit messages_delivered
    socketService.emitToConversation(convId, 'chat:messages_delivered', {
      conversationId: convId,
      userId: Number(actorUser.id),
      userName: actorUser.name,
      deliveredAt: nowIso
    });

    return { success: true, conversationId: convId, readAt: readPayload.readAt };
  }

  /**
   * Add members to a group conversation
   */
  static async addMembers(actorUser, conversationId, memberIds = []) {
    const convId = Number(conversationId);

    const [convRows] = await pool.query(
      'SELECT id, type, title FROM chat_conversations WHERE id = ?',
      [convId]
    );

    if (convRows.length === 0) {
      const err = new Error('Conversation not found.');
      err.status = 404;
      err.code = 'CONVERSATION_NOT_FOUND';
      throw err;
    }

    const conv = convRows[0];
    if (conv.type !== 'group') {
      const err = new Error('Members can only be directly added to group conversations.');
      err.status = 400;
      err.code = 'INVALID_CONVERSATION_TYPE';
      throw err;
    }

    // Check actor permission: must be group admin or system admin
    const isGlobal = ProjectsPolicy.isGlobalAdmin(actorUser);
    const [actorMember] = await pool.query(
      'SELECT role FROM chat_conversation_members WHERE conversation_id = ? AND user_id = ?',
      [convId, actorUser.id]
    );

    if (!isGlobal && (!actorMember.length || actorMember[0].role !== 'admin')) {
      const err = new Error('Only group administrators can add new members.');
      err.status = 403;
      err.code = 'NOT_GROUP_ADMIN';
      throw err;
    }

    const userIds = Array.isArray(memberIds) ? memberIds.map(Number).filter(Boolean) : [];
    if (userIds.length === 0) {
      const err = new Error('No valid user IDs provided.');
      err.status = 400;
      err.code = 'NO_USER_IDS';
      throw err;
    }

    // Verify users are active internal non-clients
    const [eligibleUsers] = await pool.query(
      `SELECT id, name FROM users 
       WHERE id IN (?) AND status = 'active' AND (role != 'client' OR role IS NULL) AND client_id IS NULL`,
      [userIds]
    );

    if (eligibleUsers.length === 0) {
      const err = new Error('None of the requested users are eligible internal employees.');
      err.status = 400;
      err.code = 'NO_ELIGIBLE_USERS';
      throw err;
    }

    const conn = await pool.getConnection();
    const addedNames = [];

    try {
      await conn.beginTransaction();

      for (const u of eligibleUsers) {
        const [res] = await conn.query(
          `INSERT IGNORE INTO chat_conversation_members (conversation_id, user_id, role)
           VALUES (?, ?, 'member')`,
          [convId, u.id]
        );
        if (res.affectedRows > 0) {
          addedNames.push(u.name);
        }
      }

      if (addedNames.length > 0) {
        const sysMsg = `${actorUser.name} added ${addedNames.join(', ')}`;
        const [sysRes] = await conn.query(
          `INSERT INTO chat_messages (conversation_id, sender_id, message_type, content)
           VALUES (?, ?, 'system', ?)`,
          [convId, actorUser.id, sysMsg]
        );

        await conn.query(
          'UPDATE chat_conversations SET last_message_id = ?, last_message_at = NOW() WHERE id = ?',
          [sysRes.insertId, convId]
        );
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    const updatedConv = await this.getConversationDetails(actorUser, convId);
    socketService.emitToConversation(convId, 'chat:members_updated', updatedConv);

    return updatedConv;
  }

  /**
   * Remove member from group conversation
   */
  static async removeMember(actorUser, conversationId, targetUserId) {
    const convId = Number(conversationId);
    const targetId = Number(targetUserId);

    const [convRows] = await pool.query(
      'SELECT id, type, title FROM chat_conversations WHERE id = ?',
      [convId]
    );

    if (convRows.length === 0) {
      const err = new Error('Conversation not found.');
      err.status = 404;
      err.code = 'CONVERSATION_NOT_FOUND';
      throw err;
    }

    const conv = convRows[0];
    if (conv.type !== 'group') {
      const err = new Error('Members can only be removed from group conversations.');
      err.status = 400;
      err.code = 'INVALID_CONVERSATION_TYPE';
      throw err;
    }

    const isGlobal = ProjectsPolicy.isGlobalAdmin(actorUser);
    const [actorMember] = await pool.query(
      'SELECT role FROM chat_conversation_members WHERE conversation_id = ? AND user_id = ?',
      [convId, actorUser.id]
    );

    const isSelfLeaving = Number(actorUser.id) === targetId;
    const isGroupAdmin = actorMember.length > 0 && actorMember[0].role === 'admin';

    if (!isSelfLeaving && !isGroupAdmin && !isGlobal) {
      const err = new Error('Only group administrators can remove other members.');
      err.status = 403;
      err.code = 'NOT_GROUP_ADMIN';
      throw err;
    }

    const [targetUserRows] = await pool.query('SELECT name FROM users WHERE id = ?', [targetId]);
    const targetName = targetUserRows[0]?.name || 'Member';

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(
        'DELETE FROM chat_conversation_members WHERE conversation_id = ? AND user_id = ?',
        [convId, targetId]
      );

      const actionText = isSelfLeaving
        ? `${targetName} left the group`
        : `${actorUser.name} removed ${targetName} from the group`;

      const [sysRes] = await conn.query(
        `INSERT INTO chat_messages (conversation_id, sender_id, message_type, content)
         VALUES (?, ?, 'system', ?)`,
        [convId, actorUser.id, actionText]
      );

      await conn.query(
        'UPDATE chat_conversations SET last_message_id = ?, last_message_at = NOW() WHERE id = ?',
        [sysRes.insertId, convId]
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    socketService.emitToConversation(convId, 'chat:member_removed', {
      conversationId: convId,
      removedUserId: targetId,
      removedUserName: targetName
    });

    return { success: true, conversationId: convId, removedUserId: targetId };
  }

  /**
   * Retrieve attachment metadata and file path for authenticated download
   */
  static async getAttachmentFile(actorUser, messageId) {
    const msgId = Number(messageId);

    const [attRows] = await pool.query(
      `SELECT a.*, m.conversation_id, m.is_deleted 
       FROM chat_attachments a
       JOIN chat_messages m ON a.message_id = m.id
       WHERE a.message_id = ?`,
      [msgId]
    );

    if (attRows.length === 0 || attRows[0].is_deleted) {
      const err = new Error('Attachment not found or has been deleted.');
      err.status = 404;
      err.code = 'ATTACHMENT_NOT_FOUND';
      throw err;
    }

    const att = attRows[0];

    // Verify actor is member of the conversation
    const [membership] = await pool.query(
      'SELECT 1 FROM chat_conversation_members WHERE conversation_id = ? AND user_id = ?',
      [att.conversation_id, actorUser.id]
    );

    if (membership.length === 0) {
      const err = new Error('Access denied: You are not authorized to access files from this conversation.');
      err.status = 403;
      err.code = 'ATTACHMENT_ACCESS_DENIED';
      throw err;
    }

    // Find actual file in storage
    const diskFilename = path.basename(att.file_url);
    const absolutePath = path.join(uploadDir, diskFilename);

    if (!fs.existsSync(absolutePath)) {
      const err = new Error('Attachment file not found on disk storage.');
      err.status = 404;
      err.code = 'FILE_NOT_FOUND_ON_DISK';
      throw err;
    }

    return {
      fileName: att.file_name,
      mimeType: att.mime_type,
      fileSize: att.file_size,
      filePath: absolutePath
    };
  }

  /**
   * Get total unread count across all conversations
   */
  static async getTotalUnreadCount(actorUser) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS total_unread
       FROM chat_messages m
       JOIN chat_conversation_members cm ON m.conversation_id = cm.conversation_id
       WHERE cm.user_id = ?
         AND m.sender_id != ?
         AND m.is_deleted = 0
         AND NOT EXISTS (
           SELECT 1 FROM chat_message_reads r
           WHERE r.message_id = m.id AND r.user_id = ?
         )`,
      [actorUser.id, actorUser.id, actorUser.id]
    );

    return Number(rows[0]?.total_unread || 0);
  }

  /**
   * Mark messages as delivered when a recipient user connects or becomes active
   */
  static async markDeliveredForConnectedUser(userId, userName) {
    const uId = Number(userId);
    if (!uId) return;

    // Find conversations where user is an active member
    const [convRows] = await pool.query(
      `SELECT DISTINCT conversation_id FROM chat_conversation_members WHERE user_id = ?`,
      [uId]
    );

    if (convRows.length === 0) return;
    const convIds = convRows.map((c) => c.conversation_id);

    // Batch insert deliveries for any messages in these conversations not sent by uId
    const [insertRes] = await pool.query(
      `INSERT IGNORE INTO chat_message_deliveries (conversation_id, message_id, user_id, delivered_at)
       SELECT m.conversation_id, m.id, ?, NOW()
       FROM chat_messages m
       WHERE m.conversation_id IN (?)
         AND m.sender_id != ?
         AND NOT EXISTS (
           SELECT 1 FROM chat_message_deliveries d WHERE d.message_id = m.id AND d.user_id = ?
         )`,
      [uId, convIds, uId, uId]
    );

    if (insertRes.affectedRows > 0) {
      const deliveredAt = new Date().toISOString();
      for (const cId of convIds) {
        socketService.emitToConversation(cId, 'chat:messages_delivered', {
          conversationId: cId,
          userId: uId,
          userName: userName || 'User',
          deliveredAt
        });
      }
    }
  }

  /**
   * Mark a specific conversation's messages as delivered for actorUser
   */
  static async markConversationAsDelivered(actorUser, conversationId, messageIds = null) {
    const convId = Number(conversationId);
    const uId = Number(actorUser.id);

    // Verify membership
    const [membership] = await pool.query(
      'SELECT 1 FROM chat_conversation_members WHERE conversation_id = ? AND user_id = ?',
      [convId, uId]
    );
    if (membership.length === 0) return { success: false };

    let sql = `
      INSERT IGNORE INTO chat_message_deliveries (conversation_id, message_id, user_id, delivered_at)
      SELECT conversation_id, id, ?, NOW()
      FROM chat_messages
      WHERE conversation_id = ? AND sender_id != ?
    `;
    const params = [uId, convId, uId];

    if (Array.isArray(messageIds) && messageIds.length > 0) {
      sql += ` AND id IN (?)`;
      params.push(messageIds.map(Number));
    }

    const [res] = await pool.query(sql, params);
    const deliveredAt = new Date().toISOString();

    if (res.affectedRows > 0) {
      socketService.emitToConversation(convId, 'chat:messages_delivered', {
        conversationId: convId,
        userId: uId,
        userName: actorUser.name,
        deliveredAt
      });
    }

    return { success: true, count: res.affectedRows, deliveredAt };
  }

  /**
   * Get detailed WhatsApp-style Message Info (Seen / Read time, Delivered time, recipient breakdown)
   */
  static async getMessageInfo(actorUser, messageId) {
    const msgId = Number(messageId);
    if (!msgId) {
      const err = new Error('Invalid message ID.');
      err.status = 400;
      err.code = 'INVALID_MESSAGE_ID';
      throw err;
    }

    // 1. Fetch message
    const [msgRows] = await pool.query(
      `SELECT m.*, u.name AS sender_name, u.email AS sender_email, u.role AS sender_role, u.department AS sender_department
       FROM chat_messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.id = ?`,
      [msgId]
    );

    if (msgRows.length === 0) {
      const err = new Error('Message not found.');
      err.status = 404;
      err.code = 'MESSAGE_NOT_FOUND';
      throw err;
    }

    const msg = msgRows[0];
    const convId = Number(msg.conversation_id);

    // 2. Verify actorUser is a member of this conversation
    const [membership] = await pool.query(
      'SELECT role FROM chat_conversation_members WHERE conversation_id = ? AND user_id = ?',
      [convId, actorUser.id]
    );

    if (membership.length === 0) {
      const err = new Error('Access denied: You are not a member of this conversation.');
      err.status = 403;
      err.code = 'CONVERSATION_ACCESS_DENIED';
      throw err;
    }

    // 3. Conversation info
    const [convRows] = await pool.query(
      `SELECT c.id, c.type, c.title, c.direct_user1_id, c.direct_user2_id,
              d.name AS department_name, p.name AS project_name
       FROM chat_conversations c
       LEFT JOIN departments d ON c.department_id = d.id
       LEFT JOIN projects p ON c.project_id = p.id
       WHERE c.id = ?`,
      [convId]
    );
    const conv = convRows[0];

    // 4. Conversation recipients (excluding the sender)
    const [recipients] = await pool.query(
      `SELECT cm.user_id, u.name, u.email, u.role, u.department, u.status
       FROM chat_conversation_members cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.conversation_id = ? AND cm.user_id != ?
       ORDER BY u.name ASC`,
      [convId, msg.sender_id]
    );

    // 5. Read records
    const [reads] = await pool.query(
      `SELECT r.user_id, r.read_at, u.name, u.email, u.role, u.department
       FROM chat_message_reads r
       JOIN users u ON r.user_id = u.id
       WHERE r.message_id = ? AND r.user_id != ?
       ORDER BY r.read_at DESC`,
      [msgId, msg.sender_id]
    );

    // 6. Delivery records
    const [deliveries] = await pool.query(
      `SELECT d.user_id, d.delivered_at, u.name, u.email, u.role, u.department
       FROM chat_message_deliveries d
       JOIN users u ON d.user_id = u.id
       WHERE d.message_id = ? AND d.user_id != ?
       ORDER BY d.delivered_at DESC`,
      [msgId, msg.sender_id]
    );

    // 7. Attachments if any
    const [attachments] = await pool.query(
      `SELECT id, file_name, file_url, file_size, mime_type FROM chat_attachments WHERE message_id = ?`,
      [msgId]
    );

    const readMap = new Map(reads.map((r) => [Number(r.user_id), r]));
    const delivMap = new Map(deliveries.map((d) => [Number(d.user_id), d]));

    const readBy = reads.map((r) => ({
      userId: Number(r.user_id),
      name: r.name,
      email: r.email,
      role: r.role,
      department: r.department,
      readAt: r.read_at
    }));

    const deliveredTo = deliveries.map((d) => ({
      userId: Number(d.user_id),
      name: d.name,
      email: d.email,
      role: d.role,
      department: d.department,
      deliveredAt: d.delivered_at
    }));

    // Remaining (members who haven't read yet)
    const remaining = recipients
      .filter((m) => !readMap.has(Number(m.user_id)))
      .map((m) => ({
        userId: Number(m.user_id),
        name: m.name,
        email: m.email,
        role: m.role,
        department: m.department,
        isDelivered: delivMap.has(Number(m.user_id)),
        deliveredAt: delivMap.get(Number(m.user_id))?.delivered_at || null
      }));

    const totalRecipients = recipients.length;
    const isDirect = conv.type === 'direct';

    let directStatus = null;
    if (isDirect && recipients.length > 0) {
      const recipientId = Number(recipients[0].user_id);
      const rRecord = readMap.get(recipientId);
      const dRecord = delivMap.get(recipientId);
      directStatus = {
        recipientId,
        recipientName: recipients[0].name,
        recipientRole: recipients[0].role,
        recipientDepartment: recipients[0].department,
        isDelivered: Boolean(dRecord || rRecord),
        deliveredAt: dRecord?.delivered_at || rRecord?.read_at || null,
        isRead: Boolean(rRecord),
        readAt: rRecord?.read_at || null
      };
    }

    return {
      message: {
        id: Number(msg.id),
        conversationId: convId,
        senderId: Number(msg.sender_id),
        senderName: msg.sender_name,
        senderRole: msg.sender_role,
        senderDepartment: msg.sender_department,
        content: msg.is_deleted ? '[This message was deleted]' : msg.content,
        messageType: msg.message_type,
        attachments: msg.is_deleted
          ? []
          : attachments.map((a) => ({
              id: Number(a.id),
              fileName: a.file_name,
              fileUrl: a.file_url,
              fileSize: Number(a.file_size),
              mimeType: a.mime_type
            })),
        isEdited: Boolean(msg.is_edited),
        editedAt: msg.edited_at,
        isDeleted: Boolean(msg.is_deleted),
        deletedAt: msg.deleted_at,
        createdAt: msg.created_at
      },
      conversation: {
        id: convId,
        type: conv.type,
        title: conv.title || conv.department_name || conv.project_name || 'Chat',
        totalRecipients
      },
      directStatus,
      readBy,
      deliveredTo,
      remaining,
      summary: {
        totalRecipients,
        readCount: readBy.length,
        deliveredCount: deliveredTo.length,
        isFullyRead: totalRecipients > 0 && readBy.length >= totalRecipients,
        isFullyDelivered: totalRecipients > 0 && deliveredTo.length >= totalRecipients
      }
    };
  }
}

// Register socket hooks for auto-delivery on connect and explicit socket acknowledgments
socketService.setOnUserConnected(async (userId, userName) => {
  try {
    await ChatService.markDeliveredForConnectedUser(userId, userName);
  } catch (err) {
    console.error('Failed to auto-deliver messages on user connect:', err);
  }
});

socketService.setOnMessagesDelivered(async (userId, userName, payload) => {
  try {
    const { conversationId, messageIds } = payload || {};
    if (conversationId) {
      await ChatService.markConversationAsDelivered({ id: userId, name: userName }, conversationId, messageIds);
    }
  } catch (err) {
    console.error('Failed to handle socket chat:delivered event:', err);
  }
});
