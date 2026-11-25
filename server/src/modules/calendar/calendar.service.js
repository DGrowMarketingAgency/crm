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

    if (!this.isCalendarGlobal(actorUser)) {
      const userSlugs = actorUser.roles?.map((r) => r.slug) || [];
      const isClientRole = userSlugs.includes('client') || actorUser.client_id;

      if (isClientRole) {
        if (Number(actorUser.client_id) !== Number(clientId)) {
          const err = new Error('Access denied: You do not have access to this client calendar');
          err.status = 403;
          throw err;
        }
      } else if (Number(client.account_manager_id) !== Number(actorUser.id)) {
        // Staff see the calendars of clients they actually work on (Master Plan §3.2 — assigned work only).
        const mine = await this.staffClientIds(actorUser);
        if (!mine.includes(Number(clientId))) {
          const err = new Error('Access denied: You do not work on this client');
          err.status = 403;
          throw err;
        }
      }
    }

    return client;
  }

  /** Owner / admin / leadership / project managers see every client's calendar. */
  static isCalendarGlobal(user) {
    return ClientsService.isGlobalViewer(user) || (user?.roles || []).some((r) => r.slug === 'project-manager');
  }

  /** Clients a staff member works on: projects they lead, manage, are a member of, or have steps/tasks in — or calendar items assigned to them. */
  static async staffClientIds(user) {
    const u = Number(user.id);
    const [rows] = await pool.query(
      `SELECT DISTINCT p.client_id AS id FROM projects p
       WHERE p.is_archived = 0 AND p.client_id IS NOT NULL AND (
         p.project_manager_id = ? OR p.team_leader_id = ?
         OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ?)
         OR EXISTS (SELECT 1 FROM project_steps ps JOIN project_step_assignees psa ON psa.project_step_id = ps.id WHERE ps.project_id = p.id AND psa.user_id = ?)
         OR EXISTS (SELECT 1 FROM tasks t WHERE t.project_id = p.id AND t.is_archived = 0 AND t.assignee_id = ?))
       UNION SELECT DISTINCT ce.client_id FROM calendar_events ce WHERE ce.assigned_to = ?
       UNION SELECT c.id FROM clients c WHERE c.account_manager_id = ?`,
      [u, u, u, u, u, u, u]
    );
    return rows.map((r) => Number(r.id));
  }

  /** True for admins / PMs / leadership, or the client's account manager. */
  static async isCalendarManager(clientId, user) {
    if (this.isCalendarGlobal(user)) return true;
    const [[c]] = await pool.query('SELECT account_manager_id FROM clients WHERE id = ?', [clientId]);
    return Boolean(c) && Number(c.account_manager_id) === Number(user.id);
  }

  /**
   * Staff who don't manage the client may only move their own items forward (status, publish link, notes);
   * changing dates, titles, people or deleting is for managers. Client-portal rules are unchanged.
   */
  static async assertCanEditEvent(event, data, user, { deleting = false } = {}) {
    if (this.isClientPortalUser(user)) return;
    if (await this.isCalendarManager(event.client_id, user)) return;
    const mineToWork = Number(event.assigned_to) === Number(user.id);
    const allowed = new Set(['status', 'publishedUrl', 'internalNotes', 'clientNotes', 'updateScope']);
    const touchesOther = Object.keys(data || {}).some((k) => data[k] !== undefined && !allowed.has(k));
    if (deleting || !mineToWork || touchesOther) {
      const err = new Error(
        mineToWork && !deleting
          ? 'You can update the status, publish link and notes of your items; ask the account manager to change anything else'
          : "Only admins, project managers or this client's account manager can change this calendar item"
      );
      err.status = 403;
      throw err;
    }
  }

  /** Building / changing a client's content calendar: admins, project managers, or the client's account manager. */
  static async assertCanManageCalendar(clientId, user) {
    const client = await this.verifyClientAccess(clientId, user);
    if (this.isClientPortalUser(user)) {
      const err = new Error('Clients cannot change the content calendar');
      err.status = 403;
      throw err;
    }
    if (!this.isCalendarGlobal(user) && Number(client.account_manager_id) !== Number(user.id)) {
      const err = new Error("Only admins, project managers or this client's account manager can build its content calendar");
      err.status = 403;
      throw err;
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
      // Scoped across accessible clients: everyone except global viewers sees only the clients they work on
      // (or account-manage) plus items assigned to them.
      if (!this.isCalendarGlobal(actorUser)) {
        const mine = await this.staffClientIds(actorUser);
        whereClauses.push('(ce.client_id IN (?) OR ce.assigned_to = ?)');
        params.push(mine.length ? mine : [0], actorUser.id);
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
    // Staff need to manage the client to add calendar items (client-portal rules unchanged).
    if (!this.isClientPortalUser(actorUser) && !(await this.isCalendarManager(data.clientId, actorUser))) {
      const err = new Error("Only admins, project managers or this client's account manager can add to its content calendar");
      err.status = 403;
      throw err;
    }

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
    await this.assertCanEditEvent(currentEvent, data, actorUser);

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
    await this.assertCanEditEvent(currentEvent, {}, actorUser, { deleting: true });

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
    await this.assertCanEditEvent(currentEvent, { status: 'published', publishedUrl }, actorUser);

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
  // ───────────────────────── Content calendar builder (Master Plan §8 Social Media Management) ─────────────────────────

  static #days(csv, fallback) {
    const list = String(csv ?? '')
      .split(',')
      .filter((d) => d.trim() !== '')
      .map((d) => Number(d))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    return list.length ? [...new Set(list)] : fallback;
  }

  /** A client's saved content settings, or the document's default pattern (Reels Sat/Sun/Wed, Posts Mon/Tue/Thu). */
  static async getContentPlan(clientId, actorUser) {
    const client = await this.verifyClientAccess(clientId, actorUser);
    const [[row]] = await pool.query('SELECT * FROM client_content_plans WHERE client_id = ?', [clientId]);
    const pillars = row?.pillars ? (typeof row.pillars === 'string' ? JSON.parse(row.pillars) : row.pillars) : [];
    return {
      client_id: Number(clientId),
      client_name: client.company_name || client.name,
      reels_per_month: Number(row?.reels_per_month || 0),
      posts_per_month: Number(row?.posts_per_month || 0),
      reel_days: this.#days(row?.reel_days, [6, 0, 3]),
      post_days: this.#days(row?.post_days, [1, 2, 4]),
      platform: row?.platform || 'Instagram',
      pillars: Array.isArray(pillars) ? pillars : [],
      default_assignee_id: row?.default_assignee_id || null,
      client_visible: row ? Boolean(row.client_visible) : true,
      saved: Boolean(row),
      can_manage: await this.isCalendarManager(clientId, actorUser)
    };
  }

  /**
   * Spreads `count` items evenly over the month's dates that fall on `weekdays` (0 = Sunday … 6 = Saturday),
   * from today onward for the current month. More items than dates → some dates get two.
   */
  static #spread(month, weekdays, count, fromYmd) {
    if (!count) return [];
    const [y, m] = month.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const dates = [];
    for (let d = 1; d <= last; d += 1) {
      const ymd = `${month}-${String(d).padStart(2, '0')}`;
      if (ymd < fromYmd) continue;
      if (weekdays.includes(new Date(Date.UTC(y, m - 1, d)).getUTCDay())) dates.push(ymd);
    }
    if (!dates.length) return [];
    const out = [];
    for (let i = 0; i < count; i += 1) out.push(dates[Math.floor((i * dates.length) / count) % dates.length]);
    return out.sort();
  }

  /**
   * Builds a client's month: N Reels on the Reel days + M Posts on the Post days, titled by rotating content pillars.
   * dryRun returns the plan without saving. Saving also remembers these settings for next month.
   */
  static async buildMonthCalendar(data, actorUser, req = null) {
    const client = await this.assertCanManageCalendar(data.clientId, actorUser);
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (data.month < today.slice(0, 7)) {
      const err = new Error('That month is already over — pick this month or a later one');
      err.status = 400;
      throw err;
    }
    const from = data.month === today.slice(0, 7) ? today : `${data.month}-01`;
    const reelDays = this.#days(data.reelDays?.join(','), []);
    const postDays = this.#days(data.postDays?.join(','), []);
    if (data.reels && !reelDays.length) {
      const err = new Error('Pick at least one day for Reels');
      err.status = 400;
      throw err;
    }
    if (data.posts && !postDays.length) {
      const err = new Error('Pick at least one day for Posts');
      err.status = 400;
      throw err;
    }
    const pillars = (data.pillars || []).map((p) => String(p).trim()).filter(Boolean).slice(0, 20);

    // Continue numbering after what this month already has.
    const [[existing]] = await pool.query(
      `SELECT SUM(event_type = 'Reel') AS reels, SUM(event_type = 'Static Post') AS posts FROM calendar_events
       WHERE client_id = ? AND event_date BETWEEN ? AND LAST_DAY(?) AND status <> 'cancelled'`,
      [data.clientId, `${data.month}-01`, `${data.month}-01`]
    );
    const haveReels = Number(existing?.reels || 0);
    const havePosts = Number(existing?.posts || 0);
    let pillarIdx = 0;
    const nextPillar = () => (pillars.length ? pillars[pillarIdx++ % pillars.length] : null);
    const items = [
      ...this.#spread(data.month, reelDays, data.reels || 0, from).map((date, i) => ({ kind: 'reel', date, n: haveReels + i + 1 })),
      ...this.#spread(data.month, postDays, data.posts || 0, from).map((date, i) => ({ kind: 'post', date, n: havePosts + i + 1 }))
    ]
      .sort((a, b) => (a.date === b.date ? (a.kind < b.kind ? 1 : -1) : a.date < b.date ? -1 : 1))
      .map((it) => {
        const pillar = nextPillar();
        return {
          ...it,
          pillar,
          title: `${it.kind === 'reel' ? 'Reel' : 'Post'} ${it.n}${pillar ? ` — ${pillar}` : ''}`,
          event_type: it.kind === 'reel' ? 'Reel' : 'Static Post',
          content_format: it.kind === 'reel' ? 'Reel / Short Video' : 'Single Image'
        };
      });
    const short = (data.reels || 0) + (data.posts || 0) - items.length;

    if (data.dryRun) {
      return { items, existing: { reels: haveReels, posts: havePosts }, not_placed: short };
    }
    if (!items.length) {
      const err = new Error('Nothing to add — set how many Reels or Posts, and the days');
      err.status = 400;
      throw err;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const it of items) {
        await conn.query(
          `INSERT INTO calendar_events (client_id, title, event_type, event_category, event_date, is_all_day, assigned_to,
             platform, content_format, content_summary, status, priority, is_client_visible, created_by)
           VALUES (?, ?, ?, 'content_publishing', ?, 1, ?, ?, ?, ?, 'planned', 'medium', ?, ?)`,
          [
            data.clientId,
            it.title,
            it.event_type,
            it.date,
            data.assignedTo || null,
            data.platform || null,
            it.content_format,
            it.pillar ? `Pillar: ${it.pillar}` : null,
            data.clientVisible === false ? 0 : 1,
            actorUser.id
          ]
        );
      }
      // Remember this pattern for next month (adjustable per client's shoot days).
      await conn.query(
        `INSERT INTO client_content_plans (client_id, reels_per_month, posts_per_month, reel_days, post_days, platform, pillars,
           default_assignee_id, client_visible, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE reels_per_month = VALUES(reels_per_month), posts_per_month = VALUES(posts_per_month),
           reel_days = VALUES(reel_days), post_days = VALUES(post_days), platform = VALUES(platform), pillars = VALUES(pillars),
           default_assignee_id = VALUES(default_assignee_id), client_visible = VALUES(client_visible), updated_by = VALUES(updated_by)`,
        [
          data.clientId,
          data.reels || 0,
          data.posts || 0,
          reelDays.join(','),
          postDays.join(','),
          data.platform || null,
          JSON.stringify(pillars),
          data.assignedTo || null,
          data.clientVisible === false ? 0 : 1,
          actorUser.id
        ]
      );
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    await AuditService.log({
      actorId: actorUser.id,
      action: 'calendar.month_built',
      entityType: 'client',
      entityId: Number(data.clientId),
      details: { month: data.month, reels: data.reels, posts: data.posts, created: items.length },
      req
    });
    await ClientsService.logActivity(
      Number(data.clientId),
      actorUser.id,
      'calendar_built',
      `Content calendar built for ${data.month}`,
      `${items.filter((i) => i.kind === 'reel').length} Reels and ${items.filter((i) => i.kind === 'post').length} Posts planned for ${client.company_name || client.name}.`
    );
    return { created: items.length, items, not_placed: short };
  }

  static async getFilterOptions(actorUser) {
    const isClientUser = this.isClientPortalUser(actorUser);

    let clientQuery = 'SELECT id, name, company_name FROM clients ORDER BY name ASC';
    let clientParams = [];

    if (isClientUser) {
      clientQuery = 'SELECT id, name, company_name FROM clients WHERE id = ?';
      clientParams = [actorUser.client_id];
    } else if (!this.isCalendarGlobal(actorUser)) {
      const mine = await this.staffClientIds(actorUser);
      clientQuery = 'SELECT id, name, company_name FROM clients WHERE id IN (?) ORDER BY name ASC';
      clientParams = [mine.length ? mine : [0]];
    }

    const [clients] = await pool.query(clientQuery, clientParams);

    // Active departments from users
    const [deptRows] = await pool.query(
      'SELECT DISTINCT department FROM users WHERE department IS NOT NULL AND department != "" ORDER BY department ASC'
    );
    const departments = deptRows.map((r) => r.department);

    // Employees list for assignment
    const [empRows] = await pool.query(
      // Staff only: client-portal accounts must not appear as assignable staff.
      `SELECT u.id, u.name, u.email, u.role, u.department FROM users u
       WHERE u.status = 'active' AND u.role <> 'client' AND u.client_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.slug IN ('client', 'freelance-videographer'))
       ORDER BY u.name ASC`
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
