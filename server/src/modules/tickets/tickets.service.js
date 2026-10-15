import { pool } from '../../config/db.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

export class TicketsService {
  /**
   * Helper to generate a unique ticket number
   */
  static async generateTicketNumber(connection) {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const random = Math.floor(1000 + Math.random() * 9000);
    const candidate = `TICK-${yearMonth}-${random}`;

    const [existing] = await connection.query(
      'SELECT id FROM support_tickets WHERE ticket_number = ?',
      [candidate]
    );

    if (existing.length > 0) {
      return this.generateTicketNumber(connection);
    }
    return candidate;
  }

  /**
   * Create a new support ticket
   */
  static async createTicket(actorUser, data) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      let clientId = data.clientId;
      // If actor is a client, enforce their client_id
      if (actorUser.client_id) {
        clientId = actorUser.client_id;
      }

      if (!clientId) {
        throw { status: 400, message: 'Valid client identification is required' };
      }

      // Verify client exists
      const [clients] = await connection.query(
        'SELECT id, name, company_name, account_manager_id FROM clients WHERE id = ?',
        [clientId]
      );
      if (clients.length === 0) {
        throw { status: 404, message: 'Client record not found' };
      }
      const client = clients[0];

      if (!data.subject || !data.subject.trim()) {
        throw { status: 400, message: 'Ticket subject is required' };
      }
      if (!data.description || !data.description.trim()) {
        throw { status: 400, message: 'Ticket description is required' };
      }

      const ticketNumber = await this.generateTicketNumber(connection);
      const category = data.category || 'General Support';
      const priority = ['low', 'medium', 'high', 'urgent'].includes(data.priority)
        ? data.priority
        : 'medium';

      // Auto-assign to Client Account Manager if assigned
      let assignedTo = data.assignedTo || client.account_manager_id || null;
      let status = assignedTo ? 'assigned' : 'open';

      const [ticketResult] = await connection.query(
        `INSERT INTO support_tickets 
          (ticket_number, client_id, project_id, service_id, created_by, assigned_to, subject, category, priority, status, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ticketNumber,
          clientId,
          data.projectId || null,
          data.serviceId || null,
          actorUser.id,
          assignedTo,
          data.subject.trim(),
          category,
          priority,
          status,
          data.description.trim()
        ]
      );

      const ticketId = ticketResult.insertId;

      // Add initial conversation message
      await connection.query(
        `INSERT INTO ticket_messages (ticket_id, sender_id, message_type, message)
         VALUES (?, ?, 'reply', ?)`,
        [ticketId, actorUser.id, data.description.trim()]
      );

      await connection.commit();

      // Audit Log
      await AuditService.log({
        userId: actorUser.id,
        action: 'TICKET_CREATED',
        entity: 'support_tickets',
        entityId: ticketId,
        details: { ticketNumber, clientId, subject: data.subject, priority, assignedTo }
      });

      // Notification
      if (assignedTo && assignedTo !== actorUser.id) {
        await NotificationsService.createNotification({
          userId: assignedTo,
          title: 'New Support Ticket Assigned',
          message: `Ticket ${ticketNumber}: "${data.subject}" has been assigned to you.`,
          type: 'ticket',
          entityType: 'ticket',
          entityId: ticketId
        });
      }

      return this.getTicketDetails(actorUser, ticketId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * List tickets with filtering, search, and client isolation
   */
  static async listTickets(actorUser, filters = {}) {
    const conditions = ['1=1'];
    const params = [];

    // Client isolation: Client users see ONLY their client's tickets
    if (actorUser.client_id) {
      conditions.push('t.client_id = ?');
      params.push(actorUser.client_id);
    } else if (filters.clientId) {
      conditions.push('t.client_id = ?');
      params.push(filters.clientId);
    }

    if (filters.status && filters.status !== 'all') {
      conditions.push('t.status = ?');
      params.push(filters.status);
    }

    if (filters.priority && filters.priority !== 'all') {
      conditions.push('t.priority = ?');
      params.push(filters.priority);
    }

    if (filters.category && filters.category !== 'all') {
      conditions.push('t.category = ?');
      params.push(filters.category);
    }

    if (filters.assignedTo) {
      conditions.push('t.assigned_to = ?');
      params.push(filters.assignedTo);
    }

    if (filters.search) {
      conditions.push('(t.ticket_number LIKE ? OR t.subject LIKE ? OR c.name LIKE ? OR c.company_name LIKE ?)');
      const term = `%${filters.search}%`;
      params.push(term, term, term, term);
    }

    const query = `
      SELECT 
        t.*,
        c.name AS client_name,
        c.company_name AS client_company_name,
        u_creator.name AS creator_name,
        u_creator.email AS creator_email,
        u_assignee.name AS assignee_name,
        u_assignee.email AS assignee_email,
        p.name AS project_name,
        s.label AS service_name,
        (SELECT COUNT(*) FROM ticket_messages tm WHERE tm.ticket_id = t.id) AS message_count
      FROM support_tickets t
      JOIN clients c ON t.client_id = c.id
      JOIN users u_creator ON t.created_by = u_creator.id
      LEFT JOIN users u_assignee ON t.assigned_to = u_assignee.id
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN service_instances s ON t.service_id = s.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY t.created_at DESC
    `;

    const [rows] = await pool.query(query, params);
    return rows;
  }

  /**
   * Get single ticket details and conversation thread
   * Enforces strict client isolation and filters out internal notes for client users!
   */
  static async getTicketDetails(actorUser, ticketId) {
    const [tickets] = await pool.query(
      `SELECT 
        t.*,
        c.name AS client_name,
        c.company_name AS client_company_name,
        u_creator.name AS creator_name,
        u_creator.email AS creator_email,
        u_assignee.name AS assignee_name,
        u_assignee.email AS assignee_email,
        p.name AS project_name,
        s.label AS service_name
      FROM support_tickets t
      JOIN clients c ON t.client_id = c.id
      JOIN users u_creator ON t.created_by = u_creator.id
      LEFT JOIN users u_assignee ON t.assigned_to = u_assignee.id
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN service_instances s ON t.service_id = s.id
      WHERE t.id = ?`,
      [ticketId]
    );

    if (tickets.length === 0) {
      throw { status: 404, message: 'Ticket not found' };
    }

    const ticket = tickets[0];

    // Client isolation check
    if (actorUser.client_id && Number(ticket.client_id) !== Number(actorUser.client_id)) {
      throw { status: 403, message: 'Access denied: You do not have permission to view this ticket' };
    }

    // Messages query: Clients must NEVER see internal_notes!
    const isClient = Boolean(actorUser.client_id);
    let messageConditions = 'tm.ticket_id = ?';
    const messageParams = [ticketId];

    if (isClient) {
      messageConditions += " AND tm.message_type != 'internal_note'";
    }

    const [messages] = await pool.query(
      `SELECT 
        tm.*,
        u.name AS sender_name,
        u.email AS sender_email,
        CASE WHEN u.client_id IS NOT NULL THEN 1 ELSE 0 END AS is_client_sender
      FROM ticket_messages tm
      JOIN users u ON tm.sender_id = u.id
      WHERE ${messageConditions}
      ORDER BY tm.created_at ASC`,
      messageParams
    );

    // Attachments query
    const [attachments] = await pool.query(
      `SELECT ta.*, u.name AS uploader_name
       FROM ticket_attachments ta
       JOIN users u ON ta.uploaded_by = u.id
       WHERE ta.ticket_id = ?
       ORDER BY ta.created_at ASC`,
      [ticketId]
    );

    return {
      ticket,
      messages,
      attachments
    };
  }

  /**
   * Add a message or internal note to a ticket
   */
  static async addMessage(actorUser, ticketId, { message, messageType = 'reply' }) {
    if (!message || !message.trim()) {
      throw { status: 400, message: 'Message content cannot be empty' };
    }

    const { ticket } = await this.getTicketDetails(actorUser, ticketId);
    const isClient = Boolean(actorUser.client_id);

    // Enforce message type: Clients can NEVER send internal notes
    let type = messageType;
    if (isClient) {
      type = 'reply';
    } else if (!['reply', 'internal_note', 'status_change'].includes(type)) {
      type = 'reply';
    }

    const [result] = await pool.query(
      `INSERT INTO ticket_messages (ticket_id, sender_id, message_type, message)
       VALUES (?, ?, ?, ?)`,
      [ticketId, actorUser.id, type, message.trim()]
    );

    // Update ticket status based on reply context
    if (isClient) {
      // If client responds and ticket was waiting_client or resolved, reactivate it
      if (['waiting_client', 'resolved'].includes(ticket.status)) {
        const nextStatus = ticket.status === 'resolved' ? 'reopened' : 'in_progress';
        await pool.query(
          'UPDATE support_tickets SET status = ?, updated_at = NOW() WHERE id = ?',
          [nextStatus, ticketId]
        );
      }
    } else if (type === 'reply') {
      // Staff replied to client, optionally change status to waiting_client if in_progress
      if (ticket.status === 'in_progress' || ticket.status === 'assigned') {
        await pool.query(
          "UPDATE support_tickets SET status = 'waiting_client', updated_at = NOW() WHERE id = ?",
          [ticketId]
        );
      }
    }

    // Send notification
    if (type !== 'internal_note') {
      if (isClient && ticket.assigned_to) {
        await NotificationsService.createNotification({
          userId: ticket.assigned_to,
          title: `Reply on Ticket ${ticket.ticket_number}`,
          message: `${actorUser.name || 'Client'} replied on ticket "${ticket.subject}"`,
          type: 'ticket',
          entityType: 'ticket',
          entityId: ticketId
        });
      } else if (!isClient && ticket.created_by !== actorUser.id) {
        await NotificationsService.createNotification({
          userId: ticket.created_by,
          title: `Agency Reply on Ticket ${ticket.ticket_number}`,
          message: `New update received on ticket "${ticket.subject}"`,
          type: 'ticket',
          entityType: 'ticket',
          entityId: ticketId
        });
      }
    }

    return this.getTicketDetails(actorUser, ticketId);
  }

  /**
   * Update ticket status, priority, or assignment
   */
  static async updateTicket(actorUser, ticketId, updates = {}) {
    const { ticket } = await this.getTicketDetails(actorUser, ticketId);
    const isClient = Boolean(actorUser.client_id);

    const validStatuses = ['open', 'assigned', 'in_progress', 'waiting_client', 'waiting_internal', 'resolved', 'closed', 'reopened'];
    const validPriorities = ['low', 'medium', 'high', 'urgent'];

    const fields = [];
    const values = [];

    // Client restrictions:
    // Clients can only reopen resolved/closed tickets, or close their resolved ticket.
    if (isClient) {
      if (updates.status) {
        if (updates.status === 'reopened' && ['resolved', 'closed'].includes(ticket.status)) {
          fields.push('status = ?');
          values.push('reopened');
        } else if (updates.status === 'closed' && ticket.status === 'resolved') {
          fields.push('status = ?', 'closed_at = NOW()');
          values.push('closed');
        } else {
          throw { status: 403, message: 'Clients may only reopen or confirm closing a resolved ticket' };
        }
      }
    } else {
      // Staff updates
      if (updates.status && validStatuses.includes(updates.status)) {
        fields.push('status = ?');
        values.push(updates.status);

        if (updates.status === 'resolved') {
          fields.push('resolved_at = NOW()');
        } else if (updates.status === 'closed') {
          fields.push('closed_at = NOW()');
        }
      }

      if (updates.priority && validPriorities.includes(updates.priority)) {
        fields.push('priority = ?');
        values.push(updates.priority);
      }

      if (updates.category) {
        fields.push('category = ?');
        values.push(updates.category.trim());
      }

      if (updates.assignedTo !== undefined) {
        fields.push('assigned_to = ?');
        values.push(updates.assignedTo || null);
        if (updates.assignedTo && ticket.status === 'open') {
          fields.push("status = 'assigned'");
        }
      }
    }

    if (fields.length === 0) {
      return this.getTicketDetails(actorUser, ticketId);
    }

    values.push(ticketId);
    await pool.query(
      `UPDATE support_tickets SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`,
      values
    );

    // Record status change message if status changed
    if (updates.status && updates.status !== ticket.status) {
      await pool.query(
        `INSERT INTO ticket_messages (ticket_id, sender_id, message_type, message)
         VALUES (?, ?, 'status_change', ?)`,
        [ticketId, actorUser.id, `Status updated from ${ticket.status} to ${updates.status}`]
      );
    }

    await AuditService.log({
      userId: actorUser.id,
      action: 'TICKET_UPDATED',
      entity: 'support_tickets',
      entityId: ticketId,
      details: updates
    });

    return this.getTicketDetails(actorUser, ticketId);
  }

  /**
   * Get ticket dashboard statistics based on real DB records
   */
  static async getTicketStats(actorUser) {
    const conditions = ['1=1'];
    const params = [];

    if (actorUser.client_id) {
      conditions.push('client_id = ?');
      params.push(actorUser.client_id);
    }

    const whereClause = conditions.join(' AND ');

    const [rows] = await pool.query(
      `SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_count,
        SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END) AS assigned_count,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_count,
        SUM(CASE WHEN status IN ('waiting_client', 'waiting_internal') THEN 1 ELSE 0 END) AS waiting_count,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved_count,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed_count
       FROM support_tickets
       WHERE ${whereClause}`,
      params
    );

    const stats = rows[0] || {};
    return {
      total: Number(stats.total) || 0,
      open: Number(stats.open_count) || 0,
      assigned: Number(stats.assigned_count) || 0,
      inProgress: Number(stats.in_progress_count) || 0,
      waiting: Number(stats.waiting_count) || 0,
      resolved: Number(stats.resolved_count) || 0,
      closed: Number(stats.closed_count) || 0
    };
  }
}
