import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';
import { seedRbac } from '../src/modules/rbac/rbac.seed.js';

describe('D-Grow OS: Client Content & Work Calendar Operations Test Suite', () => {
  let csrfToken = '';
  let csrfCookie = '';

  let adminCookie = '';
  let adminUserId;

  let amCookie = '';
  let amUserId;

  let otherAmCookie = '';
  let otherAmUserId;

  let clientUserCookie = '';
  let clientUserId;

  let testClient1Id;
  let testClient2Id;
  let testProjectId;

  let testEventId;
  let recurringEventId;
  let recurringRuleId;

  beforeAll(async () => {
    // 1. Ensure RBAC and permissions are seeded
    await seedRbac();

    // 2. Fetch CSRF token
    const csrfRes = await request(app).get('/api/auth/csrf-token');
    csrfToken = csrfRes.body.csrfToken;
    const cookies = csrfRes.headers['set-cookie'] || [];
    csrfCookie = cookies.find((c) => c.startsWith('xsrf_token='));

    const testPassword = 'Password123!';
    const passwordHash = await bcrypt.hash(testPassword, 10);

    const setupUser = async (email, name, roleSlug, dept = 'Leadership', clientId = null) => {
      await pool.query(
        `INSERT INTO users (name, email, password_hash, status, department, role, client_id)
         VALUES (?, ?, ?, 'active', ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = 'active', department = ?, role = ?, client_id = ?`,
        [name, email, passwordHash, dept, roleSlug, clientId, dept, roleSlug, clientId]
      );

      const [users] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
      const userId = users[0].id;

      const [roles] = await pool.query('SELECT id FROM roles WHERE slug = ?', [roleSlug]);
      if (roles.length > 0) {
        await pool.query(
          `INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE role_id = VALUES(role_id)`,
          [userId, roles[0].id]
        );
      }

      // Login to get session cookie
      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('Cookie', csrfCookie)
        .set('x-csrf-token', csrfToken)
        .send({ email, password: testPassword });

      const setCookies = loginRes.headers['set-cookie'] || [];
      const sessionCookie = setCookies.find((c) => c.startsWith('access_token='));

      return { userId, cookie: sessionCookie };
    };

    // 3. Setup Admin user
    const admin = await setupUser('cal.admin.test@dgrow.agency', 'Calendar Admin', 'admin', 'Leadership');
    adminUserId = admin.userId;
    adminCookie = admin.cookie;

    // 4. Setup AM users
    const am = await setupUser('cal.am1.test@dgrow.agency', 'Account Manager 1', 'account-manager', 'Content');
    amUserId = am.userId;
    amCookie = am.cookie;

    const otherAm = await setupUser('cal.am2.test@dgrow.agency', 'Account Manager 2', 'account-manager', 'Content');
    otherAmUserId = otherAm.userId;
    otherAmCookie = otherAm.cookie;

    // 5. Setup Test Clients
    const [c1Res] = await pool.query(
      `INSERT INTO clients (name, company_name, email, account_manager_id, status)
       VALUES ('Apex Retail Ltd', 'Apex Retail Ltd', 'contact@apexretail.test', ?, 'active')`,
      [amUserId]
    );
    testClient1Id = c1Res.insertId;

    const [c2Res] = await pool.query(
      `INSERT INTO clients (name, company_name, email, account_manager_id, status)
       VALUES ('Starlight Labs', 'Starlight Labs', 'contact@starlight.test', ?, 'active')`,
      [otherAmUserId]
    );
    testClient2Id = c2Res.insertId;

    // 6. Setup Client User for Client 1
    const clientUser = await setupUser(
      'apex.client.test@apexretail.test',
      'Apex Client Representative',
      'client',
      'Content',
      testClient1Id
    );
    clientUserId = clientUser.userId;
    clientUserCookie = clientUser.cookie;

    // 7. Setup a test project under Client 1
    const [projRes] = await pool.query(
      `INSERT INTO projects (name, project_code, client_id, status, project_manager_id)
       VALUES ('Apex Q4 Campaign', 'APX-Q4', ?, 'active', ?)`,
      [testClient1Id, adminUserId]
    );
    testProjectId = projRes.insertId;
  });

  afterAll(async () => {
    // Clean up test data
    if (testClient1Id) {
      await pool.query('DELETE FROM tasks WHERE client_id = ?', [testClient1Id]);
      await pool.query('DELETE FROM calendar_events WHERE client_id = ?', [testClient1Id]);
      await pool.query('DELETE FROM calendar_recurrence_rules WHERE client_id = ?', [testClient1Id]);
      await pool.query('DELETE FROM projects WHERE id = ?', [testProjectId]);
      await pool.query('DELETE FROM clients WHERE id = ?', [testClient1Id]);
    }
    if (testClient2Id) {
      await pool.query('DELETE FROM tasks WHERE client_id = ?', [testClient2Id]);
      await pool.query('DELETE FROM calendar_events WHERE client_id = ?', [testClient2Id]);
      await pool.query('DELETE FROM clients WHERE id = ?', [testClient2Id]);
    }
    const testUserIds = [adminUserId, amUserId, otherAmUserId, clientUserId].filter(Boolean);
    if (testUserIds.length > 0) {
      await pool.query('DELETE FROM tasks WHERE creator_id IN (?)', [testUserIds]);
      await pool.query('DELETE FROM user_roles WHERE user_id IN (?)', [testUserIds]);
      await pool.query('DELETE FROM users WHERE id IN (?)', [testUserIds]);
    }
  });

  // =========================================================================
  // 1. FILTER OPTIONS & METADATA
  // =========================================================================
  describe('Calendar Options and Filter Metadata', () => {
    it('returns available categories, event types, clients, and departments', async () => {
      const res = await request(app)
        .get('/api/calendar/options')
        .set('Cookie', [csrfCookie, adminCookie])
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.eventCategories).toContain('content_publishing');
      expect(res.body.data.eventCategories).toContain('seo_activities');
      expect(res.body.data.eventTypes.content_publishing).toContain('Reel');
      expect(res.body.data.clients.length).toBeGreaterThan(0);
    });

    it('isolates client options for client portal users', async () => {
      const res = await request(app)
        .get('/api/calendar/options')
        .set('Cookie', [csrfCookie, clientUserCookie])
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.data.clients.length).toBe(1);
      expect(Number(res.body.data.clients[0].id)).toBe(Number(testClient1Id));
      expect(res.body.data.employees).toHaveLength(0); // internal staff hidden from client
    });
  });

  // =========================================================================
  // 2. EVENT CREATION & VALIDATION
  // =========================================================================
  describe('Event Creation and Validation', () => {
    it('creates a content publishing event with platform, format, and assignee', async () => {
      const payload = {
        clientId: testClient1Id,
        title: 'October Festive Reel Launch',
        description: 'Key promotional reel for festive discount collection.',
        eventType: 'Reel',
        eventCategory: 'content_publishing',
        eventDate: '2026-10-20',
        startTime: '11:00',
        endTime: '12:30',
        isAllDay: false,
        assignedTo: amUserId,
        department: 'Production',
        projectId: testProjectId,
        platform: 'Instagram',
        contentFormat: 'Reel / Short Video',
        contentSummary: 'Hook: Stop scrolling! Revealing the festive line...',
        priority: 'high',
        status: 'planned',
        internalNotes: 'Draft reel footage stored in shared S3 drive.',
        clientNotes: 'Review requested by Wednesday morning.',
        isClientVisible: true
      };

      const res = await request(app)
        .post('/api/calendar')
        .set('Cookie', [csrfCookie, adminCookie])
        .set('x-csrf-token', csrfToken)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe(payload.title);
      expect(res.body.data.platform).toBe('Instagram');
      expect(res.body.data.is_client_visible).toBe(true);

      testEventId = res.body.data.id;
    });

    it('rejects event creation with end time preceding start time', async () => {
      const invalidPayload = {
        clientId: testClient1Id,
        title: 'Time Warp Meeting',
        eventType: 'Client Meeting',
        eventDate: '2026-10-22',
        startTime: '15:00',
        endTime: '14:00', // Invalid: end time before start time
        isAllDay: false
      };

      const res = await request(app)
        .post('/api/calendar')
        .set('Cookie', [csrfCookie, adminCookie])
        .set('x-csrf-token', csrfToken)
        .send(invalidPayload);

      expect(res.status).toBe(400);
    });

    it('rejects event creation for an invalid client ID', async () => {
      const res = await request(app)
        .post('/api/calendar')
        .set('Cookie', [csrfCookie, adminCookie])
        .set('x-csrf-token', csrfToken)
        .send({
          clientId: 9999999,
          title: 'Orphan Event',
          eventType: 'General Task',
          eventDate: '2026-10-25'
        });

      expect(res.status).toBe(404);
    });

    it('creates an event with automatic linked task creation', async () => {
      const res = await request(app)
        .post('/api/calendar')
        .set('Cookie', [csrfCookie, adminCookie])
        .set('x-csrf-token', csrfToken)
        .send({
          clientId: testClient1Id,
          title: 'SEO Technical Audit Sprint',
          eventType: 'Technical SEO Audit',
          eventDate: '2026-10-28',
          createLinkedTask: true,
          priority: 'urgent',
          assignedTo: amUserId
        });

      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe('SEO Technical Audit Sprint');
    });
  });

  // =========================================================================
  // 3. RECURRENCE GENERATION & RECURRING WORKFLOWS
  // =========================================================================
  describe('Recurrence Engine and Occurrences', () => {
    it('creates a weekly recurring event series up to occurrence limit', async () => {
      const res = await request(app)
        .post('/api/calendar')
        .set('Cookie', [csrfCookie, adminCookie])
        .set('x-csrf-token', csrfToken)
        .send({
          clientId: testClient1Id,
          title: 'Weekly Client Strategy Review',
          eventType: 'Client Meeting',
          eventDate: '2026-10-05',
          isAllDay: true,
          isClientVisible: true,
          recurrence: {
            pattern: 'weekly',
            intervalCount: 1,
            maxOccurrences: 4
          }
        });

      expect(res.status).toBe(201);
      expect(res.body.data.recurrence_id).not.toBeNull();

      recurringEventId = res.body.data.id;
      recurringRuleId = res.body.data.recurrence_id;

      // Verify that 4 weekly occurrences were persisted
      const [occurrences] = await pool.query(
        'SELECT id, event_date FROM calendar_events WHERE recurrence_id = ? ORDER BY event_date ASC',
        [recurringRuleId]
      );

      expect(occurrences.length).toBe(4);
      expect(occurrences[0].event_date.toISOString().slice(0, 10)).toBe('2026-10-05');
      expect(occurrences[1].event_date.toISOString().slice(0, 10)).toBe('2026-10-12');
      expect(occurrences[2].event_date.toISOString().slice(0, 10)).toBe('2026-10-19');
      expect(occurrences[3].event_date.toISOString().slice(0, 10)).toBe('2026-10-26');
    });

    it('allows updating a single occurrence and marks recurrence_exception', async () => {
      const res = await request(app)
        .put(`/api/calendar/${recurringEventId}`)
        .set('Cookie', [csrfCookie, adminCookie])
        .set('x-csrf-token', csrfToken)
        .send({
          title: 'Weekly Strategy Review (Rescheduled Time)',
          updateScope: 'single'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Weekly Strategy Review (Rescheduled Time)');
      expect(res.body.data.recurrence_exception).toBe(true);

      // Verify other occurrences were not modified
      const [otherOccurrences] = await pool.query(
        'SELECT title FROM calendar_events WHERE recurrence_id = ? AND id != ?',
        [recurringRuleId, recurringEventId]
      );
      expect(otherOccurrences[0].title).toBe('Weekly Client Strategy Review');
    });

    it('allows updating the entire remaining series', async () => {
      const res = await request(app)
        .put(`/api/calendar/${recurringEventId}`)
        .set('Cookie', [csrfCookie, adminCookie])
        .set('x-csrf-token', csrfToken)
        .send({
          priority: 'urgent',
          updateScope: 'series'
        });

      expect(res.status).toBe(200);

      // Verify future occurrences now have urgent priority
      const [seriesRows] = await pool.query(
        'SELECT priority FROM calendar_events WHERE recurrence_id = ?',
        [recurringRuleId]
      );
      seriesRows.forEach((row) => {
        expect(row.priority).toBe('urgent');
      });
    });
  });

  // =========================================================================
  // 4. RETRIEVAL, RANGE FILTERING & CLIENT ISOLATION
  // =========================================================================
  describe('Calendar Retrieval and Client Scoping', () => {
    it('retrieves calendar events for a selected month', async () => {
      const res = await request(app)
        .get('/api/calendar?month=2026-10')
        .set('Cookie', [csrfCookie, adminCookie])
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('retrieves events scoped strictly to a specific client', async () => {
      const res = await request(app)
        .get(`/api/calendar?clientId=${testClient1Id}&month=2026-10`)
        .set('Cookie', [csrfCookie, adminCookie])
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(200);
      res.body.data.forEach((evt) => {
        expect(Number(evt.client_id)).toBe(Number(testClient1Id));
      });
    });

    it('enforces Account Manager client boundary', async () => {
      // AM2 tries to fetch calendar for Client 1 (assigned to AM1)
      const res = await request(app)
        .get(`/api/calendar?clientId=${testClient1Id}`)
        .set('Cookie', [csrfCookie, otherAmCookie])
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(403);
    });

    it('enforces client portal isolation and strips confidential internal notes', async () => {
      // Client 1 user accesses their own calendar
      const res = await request(app)
        .get('/api/calendar?month=2026-10')
        .set('Cookie', [csrfCookie, clientUserCookie])
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(200);

      // Only client_visible events are returned
      res.body.data.forEach((evt) => {
        expect(Number(evt.client_id)).toBe(Number(testClient1Id));
        expect(evt.is_client_visible).toBe(true);
        // CRITICAL SECURITY RULE: internal notes MUST be redacted/null
        expect(evt.internal_notes).toBeNull();
      });
    });
  });

  // =========================================================================
  // 5. PUBLICATION RECORDING & SECURITY
  // =========================================================================
  describe('Verified Publication and Status Enforcement', () => {
    it('records verified publication with live URL and notes', async () => {
      const res = await request(app)
        .post(`/api/calendar/${testEventId}/publish`)
        .set('Cookie', [csrfCookie, adminCookie])
        .set('x-csrf-token', csrfToken)
        .send({
          publishedUrl: 'https://instagram.com/p/test12345',
          notes: 'Published on Instagram Reel with approved audio track.'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('published');
      expect(res.body.data.published_url).toBe('https://instagram.com/p/test12345');
      expect(res.body.data.published_at).not.toBeNull();
    });

    it('prevents client users from publishing or modifying events', async () => {
      const res = await request(app)
        .post(`/api/calendar/${testEventId}/publish`)
        .set('Cookie', [csrfCookie, clientUserCookie])
        .set('x-csrf-token', csrfToken)
        .send({
          publishedUrl: 'https://instagram.com/p/unauthorized'
        });

      expect(res.status).toBe(403);
    });

    it('allows deleting an event', async () => {
      const res = await request(app)
        .delete(`/api/calendar/${testEventId}`)
        .set('Cookie', [csrfCookie, adminCookie])
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify deletion
      const checkRes = await request(app)
        .get(`/api/calendar/${testEventId}`)
        .set('Cookie', [csrfCookie, adminCookie])
        .set('x-csrf-token', csrfToken);

      expect(checkRes.status).toBe(404);
    });
  });
});
