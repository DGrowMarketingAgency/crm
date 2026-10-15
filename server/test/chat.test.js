import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import path from 'path';
import fs from 'fs';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';
import { seedRbac } from '../src/modules/rbac/rbac.seed.js';
import { ChatService } from '../src/modules/chat/chat.service.js';
import { socketService } from '../src/modules/notifications/socket.service.js';

describe('Phase 7: Internal Team Chat & Real-Time Communication Suite', () => {
  let csrfToken = '';
  let csrfCookie = '';

  let ownerCookie = '';
  let ownerId;

  let emp1Cookie = '';
  let emp1Id;

  let emp2Cookie = '';
  let emp2Id;

  let outsiderCookie = '';
  let outsiderId;

  let clientCookie = '';
  let clientUserId;

  let testDeptId;
  let testProjectId;

  let directConvId;
  let groupConvId;
  let deptConvId;
  let projConvId;

  let sentMessageId;

  beforeAll(async () => {
    // 1. Seed RBAC to ensure Phase 7 chat permissions exist
    await seedRbac();

    // 2. Fetch CSRF token
    const csrfRes = await request(app).get('/api/auth/csrf-token');
    csrfToken = csrfRes.body.csrfToken;
    const cookies = csrfRes.headers['set-cookie'] || [];
    csrfCookie = cookies.find((c) => c.startsWith('xsrf_token='));

    const testPassword = 'Password123!';
    const passwordHash = await bcrypt.hash(testPassword, 10);

    // Setup Helper for test users
    const setupUser = async (email, name, roleSlug, deptName = null, clientId = null) => {
      await pool.query(
        `INSERT INTO users (name, email, password_hash, status, department, role, client_id)
         VALUES (?, ?, ?, 'active', ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = 'active', department = ?, role = ?, client_id = ?`,
        [name, email, passwordHash, deptName, roleSlug, clientId, deptName, roleSlug, clientId]
      );
      const [uRows] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
      const uid = uRows[0].id;

      await pool.query('DELETE FROM user_roles WHERE user_id = ?', [uid]);
      const [rRows] = await pool.query('SELECT id FROM roles WHERE slug = ?', [roleSlug]);
      if (rRows.length > 0) {
        await pool.query(
          `INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`,
          [uid, rRows[0].id]
        );
      }

      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('Cookie', csrfCookie)
        .set('x-csrf-token', csrfToken)
        .send({ email, password: testPassword });

      const setCookies = loginRes.headers['set-cookie'] || [];
      const accessCookie = setCookies.find((c) => c.startsWith('access_token='));
      return { id: uid, cookie: `${csrfCookie}; ${accessCookie}` };
    };

    // 3. Create Department
    await pool.query(
      `INSERT INTO departments (name, code, status)
       VALUES ('Engineering Chat Dept', 'ENG-CHAT', 'active')
       ON DUPLICATE KEY UPDATE status = 'active'`
    );
    const [deptRows] = await pool.query("SELECT id FROM departments WHERE code = 'ENG-CHAT'");
    testDeptId = deptRows[0].id;

    // 4. Create Users
    const ownerRes = await setupUser('chat_owner@test.com', 'Chat Owner', 'owner');
    ownerId = ownerRes.id;
    ownerCookie = ownerRes.cookie;

    const emp1Res = await setupUser('chat_emp1@test.com', 'Dev Alice', 'employee', 'Dev');
    emp1Id = emp1Res.id;
    emp1Cookie = emp1Res.cookie;

    const emp2Res = await setupUser('chat_emp2@test.com', 'Dev Bob', 'employee', 'Dev');
    emp2Id = emp2Res.id;
    emp2Cookie = emp2Res.cookie;

    const outRes = await setupUser('chat_outsider@test.com', 'Marketing Carol', 'employee', 'Content');
    outsiderId = outRes.id;
    outsiderCookie = outRes.cookie;

    // Enroll Dev Alice and Dev Bob into department_members for testDeptId
    await pool.query(
      `INSERT INTO department_members (department_id, user_id, is_primary)
       VALUES (?, ?, TRUE), (?, ?, TRUE)
       ON DUPLICATE KEY UPDATE is_primary = TRUE`,
      [testDeptId, emp1Id, testDeptId, emp2Id]
    );

    // Setup test client
    await pool.query(
      `INSERT INTO clients (name, email, client_code, status, lifecycle_stage, entity)
       VALUES ('Chat Client Corp', 'client_chat@test.com', 'CLT-CHAT', 'active', 'L2', 'D-Grow')
       ON DUPLICATE KEY UPDATE status = 'active'`
    );
    const [cRows] = await pool.query("SELECT id FROM clients WHERE client_code = 'CLT-CHAT'");
    const testClientId = cRows[0].id;

    const cliRes = await setupUser('client_chat_user@test.com', 'Client User', 'client', null, testClientId);
    clientUserId = cliRes.id;
    clientCookie = cliRes.cookie;

    // 5. Setup Project
    await pool.query(
      `INSERT INTO projects (name, project_code, client_id, status, project_manager_id, created_by)
       VALUES ('Chat Internal Project', 'PRJ-CHAT', ?, 'active', ?, ?)
       ON DUPLICATE KEY UPDATE status = 'active'`,
      [testClientId, ownerId, ownerId]
    );
    const [pRows] = await pool.query("SELECT id FROM projects WHERE project_code = 'PRJ-CHAT'");
    testProjectId = pRows[0].id;

    // Enroll Dev Alice into project_members
    await pool.query(
      `INSERT IGNORE INTO project_members (project_id, user_id, project_role)
       VALUES (?, ?, 'Developer')`,
      [testProjectId, emp1Id]
    );
  });

  afterAll(async () => {
    // Cleanup created test data if desired, or preserve
  });

  // =========================================================================
  // 1. COLLEAGUE SEARCH & CLIENT ISOLATION
  // =========================================================================
  it('1. should search eligible internal colleagues and exclude clients and credentials', async () => {
    const res = await request(app)
      .get('/api/chat/colleagues?search=Dev')
      .set('Cookie', emp1Cookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    const names = res.body.data.map((c) => c.name);
    expect(names).toContain('Dev Bob');
    // Requesting user Dev Alice should be excluded
    expect(names).not.toContain('Dev Alice');
    // Client users should NEVER appear in colleagues
    expect(names).not.toContain('Client User');

    // Sensitive fields must not leak
    for (const c of res.body.data) {
      expect(c.password_hash).toBeUndefined();
      expect(c.password).toBeUndefined();
    }
  });

  it('2. should strictly deny client portal users from accessing internal chat endpoints', async () => {
    const res = await request(app)
      .get('/api/chat/conversations')
      .set('Cookie', clientCookie);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('CLIENT_CHAT_FORBIDDEN');
  });

  // =========================================================================
  // 2. DIRECT CONVERSATIONS & DUPLICATE PREVENTION
  // =========================================================================
  it('3. should create a direct conversation between two internal employees', async () => {
    const res = await request(app)
      .post('/api/chat/conversations/direct')
      .set('Cookie', emp1Cookie)
      .set('x-csrf-token', csrfToken)
      .send({ targetUserId: emp2Id });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.type).toBe('direct');
    expect(res.body.data.id).toBeDefined();

    directConvId = res.body.data.id;
  });

  it('4. should prevent duplicate direct conversations and return existing conversation', async () => {
    // Request from the other party (Bob to Alice)
    const res = await request(app)
      .post('/api/chat/conversations/direct')
      .set('Cookie', emp2Cookie)
      .set('x-csrf-token', csrfToken)
      .send({ targetUserId: emp1Id });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(directConvId);
  });

  it('5. should disallow starting a direct chat with oneself or with a client', async () => {
    // With self
    const selfRes = await request(app)
      .post('/api/chat/conversations/direct')
      .set('Cookie', emp1Cookie)
      .set('x-csrf-token', csrfToken)
      .send({ targetUserId: emp1Id });
    expect(selfRes.status).toBe(400);

    // With client
    const clientRes = await request(app)
      .post('/api/chat/conversations/direct')
      .set('Cookie', emp1Cookie)
      .set('x-csrf-token', csrfToken)
      .send({ targetUserId: clientUserId });
    expect(clientRes.status).toBe(403);
    expect(clientRes.body.error.code).toBe('CLIENT_CHAT_FORBIDDEN');
  });

  // =========================================================================
  // 3. GROUP CONVERSATIONS & MEMBERSHIP MANAGEMENT
  // =========================================================================
  it('6. should create a custom group conversation with creator as admin', async () => {
    const res = await request(app)
      .post('/api/chat/conversations/group')
      .set('Cookie', emp1Cookie)
      .set('x-csrf-token', csrfToken)
      .send({
        title: 'Alpha Feature Team',
        description: 'Coordination for Alpha Feature sprint',
        memberIds: [emp2Id]
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.type).toBe('group');
    expect(res.body.data.title).toBe('Alpha Feature Team');
    expect(res.body.data.members.length).toBe(2);

    groupConvId = res.body.data.id;
  });

  it('7. should allow group admin to add new members and generate system message', async () => {
    const res = await request(app)
      .post(`/api/chat/conversations/${groupConvId}/members`)
      .set('Cookie', emp1Cookie)
      .set('x-csrf-token', csrfToken)
      .send({ memberIds: [outsiderId] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.members.some((m) => m.userId === outsiderId)).toBe(true);

    // Verify system message created
    const msgsRes = await request(app)
      .get(`/api/chat/conversations/${groupConvId}/messages`)
      .set('Cookie', emp1Cookie);
    expect(msgsRes.status).toBe(200);
    const sysMsg = msgsRes.body.data.find((m) => m.messageType === 'system');
    expect(sysMsg).toBeDefined();
  });

  it('8. should prevent non-admin member from adding members to a group', async () => {
    const res = await request(app)
      .post(`/api/chat/conversations/${groupConvId}/members`)
      .set('Cookie', outsiderCookie)
      .set('x-csrf-token', csrfToken)
      .send({ memberIds: [ownerId] });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_GROUP_ADMIN');
  });

  it('9. should allow removing member and revoke their conversation access', async () => {
    const res = await request(app)
      .delete(`/api/chat/conversations/${groupConvId}/members/${outsiderId}`)
      .set('Cookie', emp1Cookie)
      .set('x-csrf-token', csrfToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Removed outsider can no longer view messages
    const viewRes = await request(app)
      .get(`/api/chat/conversations/${groupConvId}/messages`)
      .set('Cookie', outsiderCookie);
    expect(viewRes.status).toBe(403);
    expect(viewRes.body.error.code).toBe('CONVERSATION_ACCESS_DENIED');
  });

  // =========================================================================
  // 4. DEPARTMENT CONVERSATION AUTHORIZATION
  // =========================================================================
  it('10. should allow department member to access department channel', async () => {
    const res = await request(app)
      .get(`/api/chat/conversations/department/${testDeptId}`)
      .set('Cookie', emp1Cookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.type).toBe('department');

    deptConvId = res.body.data.id;
  });

  it('11. should deny access to department channel for employees in a different department', async () => {
    const res = await request(app)
      .get(`/api/chat/conversations/department/${testDeptId}`)
      .set('Cookie', outsiderCookie);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('DEPARTMENT_ACCESS_DENIED');
  });

  // =========================================================================
  // 5. PROJECT CONVERSATION ACCESS CONTROL
  // =========================================================================
  it('12. should allow assigned project member to access project chat', async () => {
    const res = await request(app)
      .get(`/api/chat/conversations/project/${testProjectId}`)
      .set('Cookie', emp1Cookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.type).toBe('project');

    projConvId = res.body.data.id;
  });

  it('13. should deny access to project chat for non-members of the project', async () => {
    const res = await request(app)
      .get(`/api/chat/conversations/project/${testProjectId}`)
      .set('Cookie', outsiderCookie);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PROJECT_ACCESS_DENIED');
  });

  // =========================================================================
  // 6. MESSAGING: SEND, RECEIVE, PAGINATION, VALIDATION
  // =========================================================================
  it('14. should send and retrieve messages with timestamps and sender details', async () => {
    const sendRes = await request(app)
      .post(`/api/chat/conversations/${directConvId}/messages`)
      .set('Cookie', emp1Cookie)
      .set('x-csrf-token', csrfToken)
      .send({ content: 'Hello Bob! How is the API integration going?' });

    expect(sendRes.status).toBe(201);
    expect(sendRes.body.success).toBe(true);
    expect(sendRes.body.data.content).toBe('Hello Bob! How is the API integration going?');
    expect(sendRes.body.data.senderId).toBe(emp1Id);

    sentMessageId = sendRes.body.data.id;

    // Recipient fetches message history
    const listRes = await request(app)
      .get(`/api/chat/conversations/${directConvId}/messages`)
      .set('Cookie', emp2Cookie);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((m) => m.id === sentMessageId)).toBe(true);
  });

  it('15. should reject empty messages or messages exceeding length limits', async () => {
    // Empty
    const emptyRes = await request(app)
      .post(`/api/chat/conversations/${directConvId}/messages`)
      .set('Cookie', emp1Cookie)
      .set('x-csrf-token', csrfToken)
      .send({ content: '   ' });
    expect(emptyRes.status).toBe(400);
    expect(emptyRes.body.error.code).toBe('EMPTY_MESSAGE');

    // Over length (5001 chars)
    const longContent = 'A'.repeat(5001);
    const longRes = await request(app)
      .post(`/api/chat/conversations/${directConvId}/messages`)
      .set('Cookie', emp1Cookie)
      .set('x-csrf-token', csrfToken)
      .send({ content: longContent });
    expect(longRes.status).toBe(400);
    expect(longRes.body.error.code).toBe('MESSAGE_TOO_LONG');
  });

  it('16. should support replying to a previous message', async () => {
    const replyRes = await request(app)
      .post(`/api/chat/conversations/${directConvId}/messages`)
      .set('Cookie', emp2Cookie)
      .set('x-csrf-token', csrfToken)
      .send({
        content: 'Integration is going great! Ready for review.',
        replyToId: sentMessageId
      });

    expect(replyRes.status).toBe(201);
    expect(replyRes.body.data.replyTo).toBeDefined();
    expect(replyRes.body.data.replyTo.id).toBe(sentMessageId);
  });

  // =========================================================================
  // 7. MESSAGE EDITING & DELETION POLICIES
  // =========================================================================
  it('17. should allow author to edit own message and show edited status', async () => {
    const editRes = await request(app)
      .patch(`/api/chat/messages/${sentMessageId}`)
      .set('Cookie', emp1Cookie)
      .set('x-csrf-token', csrfToken)
      .send({ content: 'Hello Bob! How is the API integration going? (Updated)' });

    expect(editRes.status).toBe(200);
    expect(editRes.body.data.isEdited).toBe(true);

    // Fetch message to confirm edited content
    const listRes = await request(app)
      .get(`/api/chat/conversations/${directConvId}/messages`)
      .set('Cookie', emp1Cookie);
    const edited = listRes.body.data.find((m) => m.id === sentMessageId);
    expect(edited.content).toBe('Hello Bob! How is the API integration going? (Updated)');
    expect(edited.isEdited).toBe(true);
  });

  it('18. should forbid other users from editing messages they did not author', async () => {
    const editRes = await request(app)
      .patch(`/api/chat/messages/${sentMessageId}`)
      .set('Cookie', emp2Cookie)
      .set('x-csrf-token', csrfToken)
      .send({ content: 'Hacked content' });

    expect(editRes.status).toBe(403);
    expect(editRes.body.error.code).toBe('EDIT_FORBIDDEN');
  });

  it('19. should allow author or admin to delete message with content masked', async () => {
    // Send new message to delete
    const newMsgRes = await request(app)
      .post(`/api/chat/conversations/${directConvId}/messages`)
      .set('Cookie', emp1Cookie)
      .set('x-csrf-token', csrfToken)
      .send({ content: 'Message to be deleted' });

    const msgIdToDelete = newMsgRes.body.data.id;

    const delRes = await request(app)
      .delete(`/api/chat/messages/${msgIdToDelete}`)
      .set('Cookie', emp1Cookie)
      .set('x-csrf-token', csrfToken);

    expect(delRes.status).toBe(200);
    expect(delRes.body.data.isDeleted).toBe(true);

    // Verify content is masked
    const listRes = await request(app)
      .get(`/api/chat/conversations/${directConvId}/messages`)
      .set('Cookie', emp2Cookie);
    const deletedMsg = listRes.body.data.find((m) => m.id === msgIdToDelete);
    expect(deletedMsg.content).toBe('[This message was deleted]');
    expect(deletedMsg.isDeleted).toBe(true);
  });

  // =========================================================================
  // 8. READ RECEIPTS & UNREAD COUNTS
  // =========================================================================
  it('20. should calculate accurate unread counts and update read receipts when conversation is read', async () => {
    // Send message from Bob to Alice
    const msgRes = await request(app)
      .post(`/api/chat/conversations/${directConvId}/messages`)
      .set('Cookie', emp2Cookie)
      .set('x-csrf-token', csrfToken)
      .send({ content: 'Hey Alice, checking unread counters!' });

    const newMsgId = msgRes.body.data.id;

    // Check Alice's conversation list before reading
    const listResBefore = await request(app)
      .get('/api/chat/conversations')
      .set('Cookie', emp1Cookie);

    const targetConvBefore = listResBefore.body.data.find((c) => c.id === directConvId);
    expect(targetConvBefore.unreadCount).toBeGreaterThan(0);

    // Alice marks conversation as read
    const readRes = await request(app)
      .post(`/api/chat/conversations/${directConvId}/read`)
      .set('Cookie', emp1Cookie)
      .set('x-csrf-token', csrfToken)
      .send({ upToMessageId: newMsgId });

    expect(readRes.status).toBe(200);
    expect(readRes.body.success).toBe(true);

    // Check Alice's conversation list after reading
    const listResAfter = await request(app)
      .get('/api/chat/conversations')
      .set('Cookie', emp1Cookie);

    const targetConvAfter = listResAfter.body.data.find((c) => c.id === directConvId);
    expect(targetConvAfter.unreadCount).toBe(0);
  });

  // =========================================================================
  // 9. FILE ATTACHMENTS & SECURE AUTHENTICATED ACCESS
  // =========================================================================
  it('21. should upload attachment and permit authenticated download by conversation members', async () => {
    const tempFilePath = path.resolve('uploads', 'chat', 'test_sample.txt');
    if (!fs.existsSync(path.dirname(tempFilePath))) {
      fs.mkdirSync(path.dirname(tempFilePath), { recursive: true });
    }
    fs.writeFileSync(tempFilePath, 'This is a test secure chat attachment.');

    const uploadRes = await request(app)
      .post(`/api/chat/conversations/${directConvId}/messages`)
      .set('Cookie', emp1Cookie)
      .set('x-csrf-token', csrfToken)
      .field('content', 'Here is the project specification document')
      .attach('file', tempFilePath);

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.data.attachments.length).toBe(1);
    const attachmentMsgId = uploadRes.body.data.id;

    // Authorized conversation member downloads attachment
    const downloadRes = await request(app)
      .get(`/api/chat/attachments/${attachmentMsgId}/download`)
      .set('Cookie', emp2Cookie);

    expect(downloadRes.status).toBe(200);
    expect(downloadRes.text).toContain('This is a test secure chat attachment.');

    // Unauthorized non-member is blocked from downloading attachment
    const unauthDownloadRes = await request(app)
      .get(`/api/chat/attachments/${attachmentMsgId}/download`)
      .set('Cookie', outsiderCookie);

    expect(unauthDownloadRes.status).toBe(403);
    expect(unauthDownloadRes.body.error.code).toBe('ATTACHMENT_ACCESS_DENIED');

    // Clean up temporary file
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  });

  it('22. should strictly block executable files from being uploaded', async () => {
    const tempExePath = path.resolve('uploads', 'chat', 'danger.exe');
    fs.writeFileSync(tempExePath, 'MZ fake executable file header');

    const uploadRes = await request(app)
      .post(`/api/chat/conversations/${directConvId}/messages`)
      .set('Cookie', emp1Cookie)
      .set('x-csrf-token', csrfToken)
      .field('content', 'Trying to upload an executable')
      .attach('file', tempExePath);

    expect(uploadRes.status).toBe(400);

    if (fs.existsSync(tempExePath)) {
      fs.unlinkSync(tempExePath);
    }
  });
});
