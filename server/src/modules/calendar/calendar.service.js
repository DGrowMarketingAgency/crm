import { pool } from '../../config/db.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { TasksService } from '../tasks/tasks.service.js';
import { ClientsService } from '../clients/clients.service.js';
import { EVENT_TYPES, EVENT_CATEGORIES } from './calendar.validation.js';

export class CalendarService {
  /**
   * Helper to determine category from event type if missing
   */
  static deriveCategory(eventType, category = null) {
    if (category && EVENT_CATEGORIES.includes(category)) {
      return category;
    }
    for (const [cat, types] of Object.entries(EVENT_TYPES)) {
      if (types.some((t) => t.toLowerCase() === (eventType || '').toLowerCase())) {
        return cat;
      }
    }
    return 'agency_operations';
  }

  /**
   * Verifies client access for current user
   */
  static async verifyClientAccess(clientId, actorUser) {
    if (!clientId) {
      const err = new Error('Client ID is required');
      err.status = 400;
      throw err;
    }

    const [rows] = await pool.query(
      'SELECT id, name, company_name, account_manager_id, status FROM clients WHERE id = ?',
      [clientId]
    );

    if (rows.length === 0) {
      const err = new Error('Client not found');
      err.status = 404;
      throw err;
    }

    const client = rows[0];

    if (!ClientsService.isGlobalViewer(actorUser)) {
      const userSlugs = actorUser.roles?.map((r) => r.slug) || [];
      const isClientRole = userSlugs.includes('client') || actorUser.client_id;
      const isAM = userSlugs.includes('account-manager') || actorUser.role === 'account_manager';

      if (isClientRole) {
        if (Number(actorUser.client_id) !== Number(clientId)) {
          const err = new Error('Access denied: You do not have access to this client calendar');
          err.status = 403;
          throw err;
        }
      } else if (isAM) {
        if (Number(client.account_manager_id) !== Number(actorUser.id)) {
          const err = new Error('Access denied: You are not the assigned Account Manager for this client');
          err.status = 403;
          throw err;
        }
      }
    }

    return client;
  }

  /**
   * Check if user is a client-facing portal user
   */
  static isClientPortalUser(actorUser) {
    if (!actorUser) return true;
    const slugs = actorUser.roles?.map((r) => r.slug) || [];
    return slugs.includes('client') || Boolean(actorUser.client_id);
  }

  /**
   * Retrieves calendar events for date range or month
   */
  static async getEvents(query, actorUser) {
    let {
      clientId,
      startDate,
      endDate,
      month,
      eventType,
      eventCategory,
      status,
      priority,
      assignedTo,
      department,
      projectId,
      serviceId,
      platform,
      isClientVisible,
      search,
      includeTasks = 'false'
    } = query;

    // Handle month parameter (e.g., '2026-10')
    if (month && (!startDate || !endDate)) {
      const [year, m] = month.split('-').map(Number);
      const firstDay = new Date(Date.UTC(year, m - 1, 1));
      const lastDay = new Date(Date.UTC(year, m, 0));
      startDate = firstDay.toISOString().slice(0, 10);
      endDate = lastDay.toISOString().slice(0, 10);
    }

    // Default to current month if no range given
    if (!startDate || !endDate) {
      const now = new Date();
      const firstDay = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
      const lastDay = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0));
      startDate = startDate || firstDay.toISOString().slice(0, 10);
      endDate = endDate || lastDay.toISOString().slice(0, 10);
    }

    const isClientUser = this.isClientPortalUser(actorUser);

    // If client user, force clientId and client visibility
    if (isClientUser) {
      clientId = actorUser.client_id;
    }

    const whereClauses = ['ce.event_date >= ? AND ce.event_date <= ?'];
    const params = [startDate, endDate];

    // Client filter & access control
    if (clientId) {
      await this.verifyClientAccess(clientId, actorUser);
      whereClauses.push('ce.client_id = ?');
      params.push(clientId);
    } else {
      // Scoped across accessible clients
      if (!ClientsService.isGlobalViewer(actorUser)) {
        const userSlugs = actorUser.roles?.map((r) => r.slug) || [];
        const isAM = userSlugs.includes('account-manager') || actorUser.role === 'account_manager';
        if (isAM) {
          whereClauses.push('c.account_manager_id = ?');
          params.push(actorUser.id);
        }
      }
    }

    // Client portal visibility enforcement
    if (isClientUser) {
      whereClauses.push('ce.is_client_visible = 1');
    } else if (isClientVisible !== undefined && isClientVisible !== '') {
      whereClauses.push('ce.is_client_visible = ?');
      params.push(isClientVisible === 'true' || isClientVisible === '1' ? 1 : 0);
    }

    if (eventType) {
      whereClauses.push('ce.event_type = ?');
      params.push(eventType);
    }
    if (eventCategory) {
      whereClauses.push('ce.event_category = ?');
      params.push(eventCategory);
    }
    if (status) {
      whereClauses.push('ce.status = ?');
      params.push(status);
    }
    if (priority) {
      whereClauses.push('ce.priority = ?');
      params.push(priority);
    }
    if (assignedTo) {
      whereClauses.push('ce.assigned_to = ?');
      params.push(assignedTo);
    }
    if (department) {
      whereClauses.push('ce.department = ?');
      params.push(department);
    }
    if (projectId) {
      whereClauses.push('ce.project_id = ?');
      params.push(projectId);
    }
    if (serviceId) {
      whereClauses.push('ce.service_id = ?');
      params.push(serviceId);
    }
    if (platform) {
      whereClauses.push('ce.platform = ?');
      params.push(platform);
    }
    if (search) {
      whereClauses.push('(ce.title LIKE ? OR ce.description LIKE ? OR ce.content_summary LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [eventRows] = await pool.query(
      `SELECT
         ce.id,
         ce.client_id,
         c.name AS client_name,
         c.company_name AS client_company_name,
         ce.title,
         ce.description,
         ce.event_type,
         ce.event_category,
         DATE_FORMAT(ce.event_date, '%Y-%m-%d') AS event_date,
         ce.start_time,
         ce.end_time,
         ce.is_all_day,
         ce.assigned_to,
         u_assigned.name AS assignee_name,
         u_assigned.email AS assignee_email,
         ce.department,
         ce.project_id,
         p.name AS project_name,
         ce.task_id,
         t.task_code AS linked_task_code,
         t.title AS linked_task_title,
         t.status AS linked_task_status,
         ce.service_id,
         COALESCE(si.label, si.service_type) AS service_name,
         ce.platform,
         ce.content_format,
         ce.content_summary,
         ce.status,
         ce.priority,
         ${isClientUser ? 'NULL' : 'ce.internal_notes'} AS internal_notes,
         ce.client_notes,
         ce.is_client_visible,
         ce.recurrence_id,
         ce.recurrence_exception,
         ce.published_url,
         ce.published_at,
         ce.created_by,
         u_created.name AS creator_name,
         ce.created_at,
         ce.updated_at
       FROM calendar_events ce
       JOIN clients c ON ce.client_id = c.id
       LEFT JOIN users u_assigned ON ce.assigned_to = u_assigned.id
       LEFT JOIN users u_created ON ce.created_by = u_created.id
       LEFT JOIN projects p ON ce.project_id = p.id
       LEFT JOIN tasks t ON ce.task_id = t.id
       LEFT JOIN service_instances si ON ce.service_id = si.id
       ${whereSql}
       ORDER BY ce.event_date ASC, ce.start_time ASC, ce.id ASC`,
      params
    );

    let events = eventRows.map((r) => ({
      ...r,
      is_all_day: Boolean(r.is_all_day),
      is_client_visible: Boolean(r.is_client_visible),
      recurrence_exception: Boolean(r.recurrence_exception),
      is_task_event: false
    }));

    // Optionally include tasks with due dates in this range that aren't already linked to calendar events
    if (includeTasks === 'true' && !isClientUser) {
      const linkedTaskIds = events.filter((e) => e.task_id).map((e) => e.task_id);
      const taskParams = [startDate, endDate];
      let taskWhere = 't.due_date >= ? AND t.due_date <= ? AND t.is_archived = 0';

      if (clientId) {
        taskWhere += ' AND (t.client_id = ? OR p.client_id = ?)';
        taskParams.push(clientId, clientId);
      } else if (!ClientsService.isGlobalViewer(actorUser)) {
        const userSlugs = actorUser.roles?.map((r) => r.slug) || [];
        const isAM = userSlugs.includes('account-manager') || actorUser.role === 'account_manager';
        if (isAM) {
          taskWhere += ' AND c.account_manager_id = ?';
          taskParams.push(actorUser.id);
        }
      }

      if (assignedTo) {
        taskWhere += ' AND t.assignee_id = ?';
        taskParams.push(assignedTo);
      }
      if (projectId) {
        taskWhere += ' AND t.project_id = ?';
        taskParams.push(projectId);
      }
      if (department) {
        taskWhere += ' AND (dept.name = ? OR u_assigned.department = ?)';
        taskParams.push(department, department);
      }

      if (linkedTaskIds.length > 0) {
        taskWhere += ` AND t.id NOT IN (${linkedTaskIds.map(() => '?').join(',')})`;
        taskParams.push(...linkedTaskIds);
      }

      const [taskRows] = await pool.query(
        `SELECT
           t.id AS task_id,
           COALESCE(t.client_id, p.client_id) AS client_id,
           c.name AS client_name,
           c.company_name AS client_company_name,
           t.title,
           t.description,
           'General Task' AS event_type,
           'agency_operations' AS event_category,
           DATE_FORMAT(t.due_date, '%Y-%m-%d') AS event_date,
           NULL AS start_time,
           NULL AS end_time,
           1 AS is_all_day,
           t.assignee_id AS assigned_to,
           u_assigned.name AS assignee_name,
           u_assigned.email AS assignee_email,
           COALESCE(dept.name, u_assigned.department) AS department,
           t.project_id,
           p.name AS project_name,
           t.id AS linked_task_id,
           t.task_code AS linked_task_code,
           t.title AS linked_task_title,
           t.status AS linked_task_status,
           t.service_instance_id AS service_id,
           NULL AS platform,
           NULL AS content_format,
           NULL AS content_summary,
           CASE
             WHEN t.status = 'completed' THEN 'completed'
             WHEN t.status = 'in_progress' THEN 'in_progress'
             WHEN t.status = 'in_review' THEN 'pending_internal_review'
             ELSE 'planned'
           END AS status,
           t.priority,
           NULL AS internal_notes,
           NULL AS client_notes,
           0 AS is_client_visible,
           NULL AS recurrence_id,
           0 AS recurrence_exception,
           NULL AS published_url,
           NULL AS published_at,
           t.creator_id AS created_by,
           NULL AS creator_name,
           t.created_at,
           t.updated_at
         FROM tasks t
         LEFT JOIN projects p ON t.project_id = p.id
         LEFT JOIN clients c ON COALESCE(t.client_id, p.client_id) = c.id
         LEFT JOIN users u_assigned ON t.assignee_id = u_assigned.id
         LEFT JOIN departments dept ON t.department_id = dept.id
         WHERE ${taskWhere}
         ORDER BY t.due_date ASC`,
        taskParams
      );

      const taskEvents = taskRows.map((tr) => ({
        ...tr,
        id: `task-${tr.task_id}`,
        is_all_day: true,
        is_client_visible: false,
        recurrence_exception: false,
        is_task_event: true
      }));

      events = [...events, ...taskEvents];
      // Sort unified events by date
      events.sort((a, b) => (a.event_date > b.event_date ? 1 : -1));
    }

    return events;
  }

  /**
   * Retrieves a single event by ID with access control
   */
  static async getEventById(eventId, actorUser) {
    const isClientUser = this.isClientPortalUser(actorUser);

    const [rows] = await pool.query(
      `SELECT
         ce.*,
         DATE_FORMAT(ce.event_date, '%Y-%m-%d') AS event_date,
         c.name AS client_name,
         c.company_name AS client_company_name,
         c.account_manager_id,
         u_assigned.name AS assignee_name,
         u_assigned.email AS assignee_email,
         u_created.name AS creator_name,
         p.name AS project_name,
         t.task_code AS linked_task_code,
         t.title AS linked_task_title,
         t.status AS linked_task_status,
         COALESCE(si.label, si.service_type) AS service_name
       FROM calendar_events ce
       JOIN clients c ON ce.client_id = c.id
       LEFT JOIN users u_assigned ON ce.assigned_to = u_assigned.id
       LEFT JOIN users u_created ON ce.created_by = u_created.id
       LEFT JOIN projects p ON ce.project_id = p.id
       LEFT JOIN tasks t ON ce.task_id = t.id
       LEFT JOIN service_instances si ON ce.service_id = si.id
       WHERE ce.id = ?`,
      [eventId]
    );

    if (rows.length === 0) {
      const err = new Error('Calendar event not found');
      err.status = 404;
      throw err;
    }

    const event = rows[0];

    // Access control
    if (isClientUser) {
      if (Number(actorUser.client_id) !== Number(event.client_id) || !event.is_client_visible) {
        const err = new Error('Calendar event not found or access denied');
        err.status = 404;
        throw err;
      }
      event.internal_notes = null; // Redact internal notes
    } else if (!ClientsService.isGlobalViewer(actorUser)) {
      const userSlugs = actorUser.roles?.map((r) => r.slug) || [];
      const isAM = userSlugs.includes('account-manager') || actorUser.role === 'account_manager';
      if (isAM && Number(event.account_manager_id) !== Number(actorUser.id)) {
        const err = new Error('Access denied: Event belongs to another Account Manager client');
        err.status = 403;
        throw err;
      }
    }

    return {
      ...event,
      is_all_day: Boolean(event.is_all_day),
      is_client_visible: Boolean(event.is_client_visible),
      recurrence_exception: Boolean(event.recurrence_exception)
    };
  }

  /**
   * Creates a calendar event (and handles recurrence expansion + task generation)
   */
  static async createEvent(data, actorUser, req = null) {
    const client = await this.verifyClientAccess(data.clientId, actorUser);

    const category = this.deriveCategory(data.eventType, data.eventCategory);
    let linkedTaskId = data.taskId || null;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // If user requested to create a linked task directly
      if (data.createLinkedTask && !linkedTaskId) {
        try {
          const newTask = await TasksService.createTask(
            {
              title: data.title,
              description: data.description || data.contentSummary || '',
              clientId: data.clientId,
              projectId: data.projectId || null,
              serviceInstanceId: data.serviceId || null,
              dueDate: data.eventDate,
              priority: data.priority || 'medium',
              assigneeId: data.assignedTo || null,
              isClientDeliverable: Boolean(data.isClientVisible)
            },
            actorUser,
            req
          );
          linkedTaskId = newTask.id;
        } catch (taskErr) {
          console.warn('Could not auto-create linked task for calendar event:', taskErr.message);
        }
      }

      // Check for recurrence settings
      let recurrenceId = null;
      let occurrenceDates = [data.eventDate];

      if (data.recurrence && data.recurrence.pattern) {
        const rec = data.recurrence;
        const [ruleRes] = await connection.query(
          `INSERT INTO calendar_recurrence_rules (
             client_id, title, event_type, event_category, recurrence_pattern,
             interval_count, days_of_week, start_date, end_date, max_occurrences,
             template_event_payload, created_by
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            data.clientId,
            data.title,
            data.eventType,
            category,
            rec.pattern,
            rec.intervalCount || 1,
            rec.daysOfWeek ? JSON.stringify(rec.daysOfWeek) : null,
            data.eventDate,
            rec.endDate || null,
            rec.maxOccurrences || null,
            JSON.stringify({
              description: data.description,
              startTime: data.startTime,
              endTime: data.endTime,
              isAllDay: data.isAllDay,
              assignedTo: data.assignedTo,
              department: data.department,
              projectId: data.projectId,
              serviceId: data.serviceId,
              platform: data.platform,
              contentFormat: data.contentFormat,
              isClientVisible: data.isClientVisible
            }),
            actorUser.id
          ]
        );
        recurrenceId = ruleRes.insertId;

        // Generate recurrence dates
        occurrenceDates = this.generateRecurrenceDates({
          startDate: data.eventDate,
          pattern: rec.pattern,
          intervalCount: rec.intervalCount || 1,
          daysOfWeek: rec.daysOfWeek,
          endDate: rec.endDate,
          maxOccurrences: rec.maxOccurrences || 30
        });
      }

      const createdEventIds = [];

      for (let i = 0; i < occurrenceDates.length; i++) {
        const eventDate = occurrenceDates[i];
        // Only link task to the first occurrence
        const currentTaskId = i === 0 ? linkedTaskId : null;

        const [insertRes] = await connection.query(
          `INSERT INTO calendar_events (
             client_id, title, description, event_type, event_category,
             event_date, start_time, end_time, is_all_day, assigned_to,
             department, project_id, task_id, service_id, platform,
             content_format, content_summary, status, priority,
             internal_notes, client_notes, is_client_visible,
             recurrence_id, recurrence_exception, created_by
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            data.clientId,
            data.title,
            data.description || null,
            data.eventType,
            category,
            eventDate,
            data.isAllDay ? null : data.startTime || null,
            data.isAllDay ? null : data.endTime || null,
            data.isAllDay !== false ? 1 : 0,
            data.assignedTo || null,
            data.department || null,
            data.projectId || null,
            currentTaskId,
            data.serviceId || null,
            data.platform || null,
            data.contentFormat || null,
            data.contentSummary || null,
            data.status || 'planned',
            data.priority || 'medium',
            data.internalNotes || null,
            data.clientNotes || null,
            data.isClientVisible ? 1 : 0,
            recurrenceId,
            0,
            actorUser.id
          ]
        );

        createdEventIds.push(insertRes.insertId);
      }

      await connection.commit();

      const primaryEventId = createdEventIds[0];

      // Audit log
      await AuditService.log({
        actor_user_id: actorUser.id,
        entity_type: 'calendar_event',
        entity_id: primaryEventId,
        action: 'create',
        details: {
          clientId: data.clientId,
          title: data.title,
          eventType: data.eventType,
          eventDate: data.eventDate,
          occurrencesCount: createdEventIds.length
        }
      });

      // Notification to assignee
      if (data.assignedTo && Number(data.assignedTo) !== Number(actorUser.id)) {
        try {
          await NotificationsService.createNotification({
            recipientUserId: data.assignedTo,
            actorUserId: actorUser.id,
            type: 'task_assigned',
            title: `Assigned to Event: ${data.title}`,
            message: `You have been assigned to "${data.title}" scheduled for ${data.eventDate}.`,
            entityType: 'calendar_event',
            entityId: primaryEventId,
            actionUrl: `/calendar?clientId=${data.clientId}&date=${data.eventDate}`
          });
        } catch (notifErr) {
          console.warn('Calendar notification dispatch failed:', notifErr.message);
        }
      }

      return await this.getEventById(primaryEventId, actorUser);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Helper to compute recurrence dates safely
   */
  static generateRecurrenceDates({
    startDate,
    pattern,
    intervalCount = 1,
    daysOfWeek = null,
    endDate = null,
    maxOccurrences = 30
  }) {
    const dates = [];
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    let current = new Date(Date.UTC(startYear, startMonth - 1, startDay));

    const endBoundary = endDate
      ? new Date(Date.UTC(...endDate.split('-').map((v, i) => (i === 1 ? Number(v) - 1 : Number(v)))))
      : null;

    // Safety caps
    const maxCount = Math.min(Math.max(1, maxOccurrences || 30), 100);
    const hardStopDays = 365; // Max 1 year projection
    let safetyCounter = 0;

    while (dates.length < maxCount && safetyCounter < hardStopDays) {
      safetyCounter++;

      if (endBoundary && current > endBoundary) {
        break;
      }

      const isoDate = current.toISOString().slice(0, 10);

      if (pattern === 'daily') {
        dates.push(isoDate);
        current.setUTCDate(current.getUTCDate() + intervalCount);
      } else if (pattern === 'weekly') {
        dates.push(isoDate);
        current.setUTCDate(current.getUTCDate() + 7 * intervalCount);
      } else if (pattern === 'custom_weekdays') {
        const dayOfWeek = current.getUTCDay(); // 0 is Sun, 6 is Sat
        if (daysOfWeek && daysOfWeek.includes(dayOfWeek)) {
          dates.push(isoDate);
        }
        current.setUTCDate(current.getUTCDate() + 1);
      } else if (pattern === 'monthly') {
        dates.push(isoDate);
        // Advance month and preserve day
        const targetMonth = current.getUTCMonth() + intervalCount;
        current = new Date(Date.UTC(current.getUTCFullYear(), targetMonth, startDay));
      } else {
        dates.push(isoDate);
        break;
      }
    }

    if (dates.length === 0) {
      dates.push(startDate);
    }

    return dates;
  }

  /**
   * Updates an existing calendar event
   */
  static async updateEvent(eventId, data, actorUser) {
    const currentEvent = await this.getEventById(eventId, actorUser);

    const updateScope = data.updateScope || 'single';
    const fieldsToUpdate = {};

    if (data.title !== undefined) fieldsToUpdate.title = data.title;
    if (data.description !== undefined) fieldsToUpdate.description = data.description;
    if (data.eventType !== undefined) {
      fieldsToUpdate.event_type = data.eventType;
      fieldsToUpdate.event_category = this.deriveCategory(data.eventType, data.eventCategory);
    } else if (data.eventCategory !== undefined) {
      fieldsToUpdate.event_category = data.eventCategory;
    }
    if (data.eventDate !== undefined) fieldsToUpdate.event_date = data.eventDate;
    if (data.startTime !== undefined) fieldsToUpdate.start_time = data.isAllDay ? null : data.startTime;
    if (data.endTime !== undefined) fieldsToUpdate.end_time = data.isAllDay ? null : data.endTime;
    if (data.isAllDay !== undefined) fieldsToUpdate.is_all_day = data.isAllDay ? 1 : 0;
    if (data.assignedTo !== undefined) fieldsToUpdate.assigned_to = data.assignedTo || null;
    if (data.department !== undefined) fieldsToUpdate.department = data.department || null;
    if (data.projectId !== undefined) fieldsToUpdate.project_id = data.projectId || null;
    if (data.taskId !== undefined) fieldsToUpdate.task_id = data.taskId || null;
    if (data.serviceId !== undefined) fieldsToUpdate.service_id = data.serviceId || null;
    if (data.platform !== undefined) fieldsToUpdate.platform = data.platform || null;
    if (data.contentFormat !== undefined) fieldsToUpdate.content_format = data.contentFormat || null;
    if (data.contentSummary !== undefined) fieldsToUpdate.content_summary = data.contentSummary || null;
    if (data.status !== undefined) fieldsToUpdate.status = data.status;
    if (data.priority !== undefined) fieldsToUpdate.priority = data.priority;
    if (data.internalNotes !== undefined) fieldsToUpdate.internal_notes = data.internalNotes || null;
    if (data.clientNotes !== undefined) fieldsToUpdate.client_notes = data.clientNotes || null;
    if (data.isClientVisible !== undefined) fieldsToUpdate.is_client_visible = data.isClientVisible ? 1 : 0;
    if (data.publishedUrl !== undefined) fieldsToUpdate.published_url = data.publishedUrl || null;

    if (Object.keys(fieldsToUpdate).length === 0) {
      return currentEvent;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      if (updateScope === 'series' && currentEvent.recurrence_id) {
        // Update all future events in the series
        const setClauses = [];
        const params = [];

        // Exclude event_date from bulk series update so each preserves its scheduled date
        for (const [key, val] of Object.entries(fieldsToUpdate)) {
          if (key !== 'event_date') {
            setClauses.push(`${key} = ?`);
            params.push(val);
          }
        }

        if (setClauses.length > 0) {
          params.push(currentEvent.recurrence_id, currentEvent.event_date);
          await connection.query(
            `UPDATE calendar_events
             SET ${setClauses.join(', ')}
             WHERE recurrence_id = ? AND event_date >= ?`,
            params
          );
        }
      } else {
        // Single event update
        if (currentEvent.recurrence_id) {
          fieldsToUpdate.recurrence_exception = 1;
        }

        const setClauses = Object.keys(fieldsToUpdate).map((k) => `${k} = ?`);
        const params = [...Object.values(fieldsToUpdate), eventId];

        await connection.query(
          `UPDATE calendar_events SET ${setClauses.join(', ')} WHERE id = ?`,
          params
        );
      }

      await connection.commit();

      // Audit log
      await AuditService.log({
        actor_user_id: actorUser.id,
        entity_type: 'calendar_event',
        entity_id: eventId,
        action: 'update',
        details: { updateScope, changedFields: Object.keys(fieldsToUpdate) }
      });

      // Notify newly assigned user
      if (
        data.assignedTo &&
        Number(data.assignedTo) !== Number(currentEvent.assigned_to) &&
        Number(data.assignedTo) !== Number(actorUser.id)
      ) {
        try {
          await NotificationsService.createNotification({
            recipientUserId: data.assignedTo,
            actorUserId: actorUser.id,
            type: 'task_assigned',
            title: `Reassigned Event: ${currentEvent.title}`,
            message: `You have been assigned to event "${currentEvent.title}" on ${data.eventDate || currentEvent.event_date}.`,
            entityType: 'calendar_event',
            entityId: eventId,
            actionUrl: `/calendar?clientId=${currentEvent.client_id}&date=${data.eventDate || currentEvent.event_date}`
          });
        } catch (notifErr) {
          console.warn('Calendar notification dispatch failed:', notifErr.message);
        }
      }

      return await this.getEventById(eventId, actorUser);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Deletes / cancels an event
   */
  static async deleteEvent(eventId, { deleteScope = 'single' }, actorUser) {
    const currentEvent = await this.getEventById(eventId, actorUser);

    if (deleteScope === 'series' && currentEvent.recurrence_id) {
      await pool.query(
        'DELETE FROM calendar_events WHERE recurrence_id = ? AND event_date >= ?',
        [currentEvent.recurrence_id, currentEvent.event_date]
      );
    } else {
      await pool.query('DELETE FROM calendar_events WHERE id = ?', [eventId]);
    }

    await AuditService.log({
      actor_user_id: actorUser.id,
      entity_type: 'calendar_event',
      entity_id: eventId,
      action: 'delete',
      details: { deleteScope, title: currentEvent.title, clientId: currentEvent.client_id }
    });

    return { success: true, message: 'Event successfully removed' };
  }

  /**
   * Records verified publication
   */
  static async recordPublication(eventId, { publishedUrl, notes }, actorUser) {
    const currentEvent = await this.getEventById(eventId, actorUser);

    await pool.query(
      `UPDATE calendar_events
       SET status = 'published',
           published_url = ?,
           published_at = NOW(),
           client_notes = COALESCE(?, client_notes)
       WHERE id = ?`,
      [publishedUrl || null, notes || null, eventId]
    );

    await AuditService.log({
      actor_user_id: actorUser.id,
      entity_type: 'calendar_event',
      entity_id: eventId,
      action: 'publish',
      details: { publishedUrl, publishedAt: new Date().toISOString() }
    });

    return await this.getEventById(eventId, actorUser);
  }

  /**
   * Retrieves filter options (categories, types, platforms, clients, departments)
   */
  static async getFilterOptions(actorUser) {
    const isClientUser = this.isClientPortalUser(actorUser);

    let clientQuery = 'SELECT id, name, company_name FROM clients ORDER BY name ASC';
    let clientParams = [];

    if (isClientUser) {
      clientQuery = 'SELECT id, name, company_name FROM clients WHERE id = ?';
      clientParams = [actorUser.client_id];
    } else if (!ClientsService.isGlobalViewer(actorUser)) {
      const userSlugs = actorUser.roles?.map((r) => r.slug) || [];
      const isAM = userSlugs.includes('account-manager') || actorUser.role === 'account_manager';
      if (isAM) {
        clientQuery = 'SELECT id, name, company_name FROM clients WHERE account_manager_id = ? ORDER BY name ASC';
        clientParams = [actorUser.id];
      }
    }

    const [clients] = await pool.query(clientQuery, clientParams);

    // Active departments from users
    const [deptRows] = await pool.query(
      'SELECT DISTINCT department FROM users WHERE department IS NOT NULL AND department != "" ORDER BY department ASC'
    );
    const departments = deptRows.map((r) => r.department);

    // Employees list for assignment
    const [empRows] = await pool.query(
      'SELECT id, name, email, role, department FROM users WHERE status = "active" ORDER BY name ASC'
    );

    return {
      eventCategories: EVENT_CATEGORIES,
      eventTypes: EVENT_TYPES,
      clients: clients.map((c) => ({ id: c.id, name: c.company_name || c.name })),
      departments,
      employees: isClientUser ? [] : empRows
    };
  }
}
