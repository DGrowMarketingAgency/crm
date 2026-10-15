import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';
import {
  encryptSecret,
  decryptSecret,
  rotateSecret,
  maskSecret,
  maskUsername
} from '../src/utils/credential-crypto.js';

describe('D-Grow OS: Secure Client Password Manager & Credential Access Control Suite', () => {
  let csrfToken = '';
  let csrfCookie = '';

  let adminCookie = '';
  let clientCookieA = '';
  let clientCookieB = '';
  let employeeCookie = '';
  let seoExecCookie = '';

  let adminUserId;
  let clientUserAId;
  let clientUserBId;
  let employeeUserId;
  let seoExecUserId;

  let testClientAId;
  let testClientBId;

  let createdCredentialId;
  let grantedGrantId;

  beforeAll(async () => {
    // 1. Get CSRF token
    const csrfRes = await request(app).get('/api/auth/csrf-token');
    csrfToken = csrfRes.body.csrfToken;
    const cookies = csrfRes.headers['set-cookie'];
    csrfCookie = cookies.find((c) => c.startsWith('xsrf_token='));

    const testPassword = 'Password123!';
    const passwordHash = await bcrypt.hash(testPassword, 10);

    // 2. Setup Clients A & B
    const [cARes] = await pool.query(
      `INSERT INTO clients (name, client_code, email, company_name, status)
       VALUES ('Apex Healthcare', 'CLI-APEX-01', 'apex@client.com', 'Apex Corp', 'active')
       ON DUPLICATE KEY UPDATE name = 'Apex Healthcare'`
    );
    const [cARows] = await pool.query("SELECT id FROM clients WHERE client_code = 'CLI-APEX-01'");
    testClientAId = cARows[0].id;

    const [cBRes] = await pool.query(
      `INSERT INTO clients (name, client_code, email, company_name, status)
       VALUES ('Beacon Media', 'CLI-BEACON-02', 'beacon@client.com', 'Beacon Media', 'active')
       ON DUPLICATE KEY UPDATE name = 'Beacon Media'`
    );
    const [cBRows] = await pool.query("SELECT id FROM clients WHERE client_code = 'CLI-BEACON-02'");
    testClientBId = cBRows[0].id;

    // 3. Setup Users
    // Admin User
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ('Admin Creds', 'admin_creds@dgrow.com', ?, 'admin', 'active')
       ON DUPLICATE KEY UPDATE password_hash = ?`,
      [passwordHash, passwordHash]
    );
    const [adminRows] = await pool.query("SELECT id FROM users WHERE email = 'admin_creds@dgrow.com'");
    adminUserId = adminRows[0].id;
    const [adminRole] = await pool.query("SELECT id FROM roles WHERE slug = 'admin'");
    await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [adminUserId, adminRole[0].id]);

    // Client User A (for Apex Healthcare)
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, client_id, status)
       VALUES ('Client User A', 'client_a@apex.com', ?, 'client', ?, 'active')
       ON DUPLICATE KEY UPDATE password_hash = ?, client_id = ?`,
      [passwordHash, testClientAId, passwordHash, testClientAId]
    );
    const [clientARows] = await pool.query("SELECT id FROM users WHERE email = 'client_a@apex.com'");
    clientUserAId = clientARows[0].id;
    const [clientRole] = await pool.query("SELECT id FROM roles WHERE slug = 'client'");
    await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [clientUserAId, clientRole[0].id]);

    // Client User B (for Beacon Media)
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, client_id, status)
       VALUES ('Client User B', 'client_b@beacon.com', ?, 'client', ?, 'active')
       ON DUPLICATE KEY UPDATE password_hash = ?, client_id = ?`,
      [passwordHash, testClientBId, passwordHash, testClientBId]
    );
    const [clientBRows] = await pool.query("SELECT id FROM users WHERE email = 'client_b@beacon.com'");
    clientUserBId = clientBRows[0].id;
    await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [clientUserBId, clientRole[0].id]);

    // Employee 1: SEO Specialist
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, department, status)
       VALUES ('SEO Specialist Test', 'seo_spec@dgrow.com', ?, 'employee', 'SEO', 'active')
       ON DUPLICATE KEY UPDATE password_hash = ?`,
      [passwordHash, passwordHash]
    );
    const [seoRows] = await pool.query("SELECT id FROM users WHERE email = 'seo_spec@dgrow.com'");
    seoExecUserId = seoRows[0].id;
    const [seoRole] = await pool.query("SELECT id FROM roles WHERE slug = 'seo-exec'");
    await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [seoExecUserId, seoRole[0]?.id || 5]);

    // Employee 2: Standard Employee without initial grant
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, department, status)
       VALUES ('General Employee Test', 'gen_emp@dgrow.com', ?, 'employee', 'Content', 'active')
       ON DUPLICATE KEY UPDATE password_hash = ?`,
      [passwordHash, passwordHash]
    );
    const [empRows] = await pool.query("SELECT id FROM users WHERE email = 'gen_emp@dgrow.com'");
    employeeUserId = empRows[0].id;
    const [empRole] = await pool.query("SELECT id FROM roles WHERE slug = 'employee'");
    await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [employeeUserId, empRole[0].id]);

    // Logins
    const loginAdmin = await request(app)
      .post('/api/auth/login')
      .set('Cookie', [csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ email: 'admin_creds@dgrow.com', password: testPassword });
    adminCookie = loginAdmin.headers['set-cookie'].find((c) => c.startsWith('access_token='));

    const loginClientA = await request(app)
      .post('/api/auth/login')
      .set('Cookie', [csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ email: 'client_a@apex.com', password: testPassword });
    clientCookieA = loginClientA.headers['set-cookie'].find((c) => c.startsWith('access_token='));

    const loginClientB = await request(app)
      .post('/api/auth/login')
      .set('Cookie', [csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ email: 'client_b@beacon.com', password: testPassword });
    clientCookieB = loginClientB.headers['set-cookie'].find((c) => c.startsWith('access_token='));

    const loginSeo = await request(app)
      .post('/api/auth/login')
      .set('Cookie', [csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ email: 'seo_spec@dgrow.com', password: testPassword });
    seoExecCookie = loginSeo.headers['set-cookie'].find((c) => c.startsWith('access_token='));

    const loginEmp = await request(app)
      .post('/api/auth/login')
      .set('Cookie', [csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ email: 'gen_emp@dgrow.com', password: testPassword });
    employeeCookie = loginEmp.headers['set-cookie'].find((c) => c.startsWith('access_token='));
  });

  afterAll(async () => {
    // Cleanup created test records
    if (createdCredentialId) {
      await pool.query('DELETE FROM client_credentials WHERE id = ?', [createdCredentialId]);
    }
  });

  describe('1. Cryptographic Engine & Secret Storage', () => {
    it('encrypts passwords with AES-256-GCM authenticated format', () => {
      const secret = 'SecretVaultP@ss99!';
      const encrypted = encryptSecret(secret);

      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toContain(secret);
      const parts = encrypted.split(':');
      expect(parts.length).toBe(4); // version:iv:tag:ciphertext
      expect(parts[0]).toBe('v1');
      expect(parts[1].length).toBe(24); // 12-byte IV in hex = 24 chars
      expect(parts[2].length).toBe(32); // 16-byte Auth Tag in hex = 32 chars
    });

    it('generates a unique IV for each encryption operation of identical plaintext', () => {
      const secret = 'IdenticalSecret123';
      const enc1 = encryptSecret(secret);
      const enc2 = encryptSecret(secret);

      expect(enc1).not.toBe(enc2);
      const iv1 = enc1.split(':')[1];
      const iv2 = enc2.split(':')[1];
      expect(iv1).not.toBe(iv2);
    });

    it('successfully decrypts an encrypted secret back to exact plaintext', () => {
      const original = 'ProductionApiSecretKey_2026!';
      const cipher = encryptSecret(original);
      const decrypted = decryptSecret(cipher);
      expect(decrypted).toBe(original);
    });

    it('fails closed and rejects tampered ciphertext or altered auth tags', () => {
      const original = 'ImportantFinancialAccountPass';
      const cipher = encryptSecret(original);
      const parts = cipher.split(':');

      // Tamper ciphertext
      const tamperedParts = [...parts];
      tamperedParts[3] = 'ff' + tamperedParts[3].slice(2);
      const tamperedCipher = tamperedParts.join(':');

      expect(() => decryptSecret(tamperedCipher)).toThrow(/tampered|failed/i);
    });

    it('correctly rotates ciphertext to another key version without data corruption', () => {
      // Simulate adding a v2 key to environment key ring
      const newKeyHex = crypto.randomBytes(32).toString('hex');
      process.env.CREDENTIAL_KEY_RING = JSON.stringify({
        v1: process.env.CREDENTIAL_ENCRYPTION_KEY || '6737db207df19638815bd250c20cf3967e6852b051b5e787a6f7e2cb10123db8',
        v2: newKeyHex
      });

      const original = 'RotateMeSafely_2026';
      const cipherV1 = encryptSecret(original, 'v1');
      expect(cipherV1.startsWith('v1:')).toBe(true);

      const rotated = rotateSecret(cipherV1, 'v2');
      expect(rotated.newVersion).toBe('v2');
      expect(rotated.newPayload.startsWith('v2:')).toBe(true);

      const decryptedV2 = decryptSecret(rotated.newPayload);
      expect(decryptedV2).toBe(original);
    });
  });

  describe('2. Client Credential Submission & Isolation', () => {
    it('Client A can register a new platform credential for their own organization', async () => {
      const res = await request(app)
        .post('/api/credentials')
        .set('Cookie', [csrfCookie, clientCookieA])
        .set('X-CSRF-Token', csrfToken)
        .send({
          platform_name: 'Google Analytics 4',
          category: 'Analytics',
          login_url: 'https://analytics.google.com',
          username: 'analytics@apexhealthcare.com',
          password: 'ApexGA4Password!2026',
          recovery_email: 'recovery@apexhealthcare.com',
          notes: 'Client GA4 property for hospital campaign tracking'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.credential).toBeTruthy();
      expect(res.body.credential.client_id).toBe(testClientAId);
      expect(res.body.credential.password_masked).toBe('••••••••••••');
      expect(res.body.credential.password).toBeUndefined(); // NEVER return plaintext in creation response!

      createdCredentialId = res.body.credential.id;

      // Verify at database level: password MUST be encrypted at rest, never plaintext!
      const [rows] = await pool.query('SELECT encrypted_password FROM client_credentials WHERE id = ?', [createdCredentialId]);
      expect(rows[0].encrypted_password).not.toContain('ApexGA4Password!2026');
      expect(rows[0].encrypted_password.startsWith('v1:')).toBe(true);
    });

    it('Client A cannot register credentials for Client B (forces own client_id)', async () => {
      const res = await request(app)
        .post('/api/credentials')
        .set('Cookie', [csrfCookie, clientCookieA])
        .set('X-CSRF-Token', csrfToken)
        .send({
          client_id: testClientBId, // Attempt spoofing to client B
          platform_name: 'Spoofed Platform',
          username: 'spoof@beacon.com',
          password: 'MaliciousPassword123'
        });

      // Endpoint must either succeed assigned to Client A or reject; verify it sets client A
      if (res.status === 201) {
        expect(res.body.credential.client_id).toBe(testClientAId);
        // Clean up spoof attempt
        await pool.query('DELETE FROM client_credentials WHERE id = ?', [res.body.credential.id]);
      } else {
        expect([400, 403]).toContain(res.status);
      }
    });

    it('Client B cannot view or list Client A credentials', async () => {
      const res = await request(app)
        .get('/api/credentials')
        .set('Cookie', [csrfCookie, clientCookieB])
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const foundA = res.body.credentials.find((c) => c.id === createdCredentialId);
      expect(foundA).toBeUndefined();
    });

    it('Client B cannot reveal Client A credential secret directly (returns 403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/credentials/${createdCredentialId}/reveal`)
        .set('Cookie', [csrfCookie, clientCookieB])
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.revealed).toBeUndefined();
    });

    it('Client A can replace their own password safely and audit log is recorded without plaintext', async () => {
      const newSecret = 'NewApexGA4Password#2027';
      const res = await request(app)
        .put(`/api/credentials/${createdCredentialId}`)
        .set('Cookie', [csrfCookie, clientCookieA])
        .set('X-CSRF-Token', csrfToken)
        .send({
          password: newSecret
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.isPasswordReplaced).toBe(true);

      // Verify audit trail contains NO plaintext
      const [logs] = await pool.query(
        `SELECT action, access_reason FROM credential_access_logs WHERE credential_id = ? AND action = 'password_replaced'`,
        [createdCredentialId]
      );
      expect(logs.length).toBeGreaterThan(0);
      expect(JSON.stringify(logs)).not.toContain(newSecret);
      expect(JSON.stringify(logs)).not.toContain('ApexGA4Password!2026');
    });
  });

  describe('3. Strict Admin-Only Default Access & Access Denials for Employees', () => {
    it('Employee has NO credential access by default and sees 0 credentials in list', async () => {
      const res = await request(app)
        .get('/api/credentials')
        .set('Cookie', [csrfCookie, employeeCookie])
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.credentials.length).toBe(0);
    });

    it('SEO Specialist has NO credential access by default despite departmental membership', async () => {
      const res = await request(app)
        .get('/api/credentials')
        .set('Cookie', [csrfCookie, seoExecCookie])
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const found = res.body.credentials.find((c) => c.id === createdCredentialId);
      expect(found).toBeUndefined();
    });

    it('Unauthorized employee attempting to reveal credential receives 403 Forbidden', async () => {
      const res = await request(app)
        .post(`/api/credentials/${createdCredentialId}/reveal`)
        .set('Cookie', [csrfCookie, seoExecCookie])
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toMatch(/NO_ACTIVE|FORBIDDEN/i);
    });

    it('Audit log records unauthorized employee reveal attempt', async () => {
      const [attemptLogs] = await pool.query(
        `SELECT outcome, failure_reason FROM credential_access_logs
         WHERE credential_id = ? AND actor_id = ? AND action = 'unauthorized_attempt'`,
        [createdCredentialId, seoExecUserId]
      );
      expect(attemptLogs.length).toBeGreaterThan(0);
      expect(attemptLogs[0].outcome).toBe('denied');
    });
  });

  describe('4. Admin Employee Access Control & Granular Permissions', () => {
    it('Admin can grant metadata_only access to SEO Specialist', async () => {
      const res = await request(app)
        .post(`/api/credentials/${createdCredentialId}/grants`)
        .set('Cookie', [csrfCookie, adminCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          employee_id: seoExecUserId,
          access_level: 'metadata_only',
          access_reason: 'Audit SEO analytics tags configuration'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.grant.access_level).toBe('metadata_only');
      grantedGrantId = res.body.grant.grant_id;
    });

    it('Employee with metadata_only CANNOT reveal credentials (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/credentials/${createdCredentialId}/reveal`)
        .set('Cookie', [csrfCookie, seoExecCookie])
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_METADATA_ONLY');
    });

    it('Admin upgrades SEO Specialist grant to view_credentials', async () => {
      const res = await request(app)
        .patch(`/api/credentials/${createdCredentialId}/grants/${grantedGrantId}`)
        .set('Cookie', [csrfCookie, adminCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          access_level: 'view_credentials',
          access_reason: 'Need direct platform login for tag deployment'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('Authorized employee with view_credentials can now reveal the secret', async () => {
      const res = await request(app)
        .post(`/api/credentials/${createdCredentialId}/reveal`)
        .set('Cookie', [csrfCookie, seoExecCookie])
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.revealed.password).toBe('NewApexGA4Password#2027');
      expect(res.body.revealed.username).toBe('analytics@apexhealthcare.com');

      // Verify Cache-Control header is set to prevent browser/intermediate caching
      expect(res.headers['cache-control']).toContain('no-store');
    });

    it('Employee with view_credentials cannot update or edit credential (403 Forbidden)', async () => {
      const res = await request(app)
        .put(`/api/credentials/${createdCredentialId}`)
        .set('Cookie', [csrfCookie, seoExecCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          notes: 'Attempted edit without edit_credentials permission'
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_EDIT_ACCESS_REQUIRED');
    });

    it('Employee cannot grant access to another employee', async () => {
      const res = await request(app)
        .post(`/api/credentials/${createdCredentialId}/grants`)
        .set('Cookie', [csrfCookie, seoExecCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          employee_id: employeeUserId,
          access_level: 'view_credentials'
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_MANAGE_ACCESS_REQUIRED');
    });

    it('Revoking employee access immediately stops future reveals', async () => {
      // Admin revokes grant
      const revokeRes = await request(app)
        .delete(`/api/credentials/${createdCredentialId}/grants/${grantedGrantId}`)
        .set('Cookie', [csrfCookie, adminCookie])
        .set('X-CSRF-Token', csrfToken);

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.success).toBe(true);

      // Immediately verify employee is blocked
      const revealRes = await request(app)
        .post(`/api/credentials/${createdCredentialId}/reveal`)
        .set('Cookie', [csrfCookie, seoExecCookie])
        .set('X-CSRF-Token', csrfToken);

      expect(revealRes.status).toBe(403);
      expect(revealRes.body.error.code).toBe('FORBIDDEN_NO_ACTIVE_GRANT');
    });

    it('Client can view list of authorized employees without exposing internal admin notes', async () => {
      // Give a grant first
      await request(app)
        .post(`/api/credentials/${createdCredentialId}/grants`)
        .set('Cookie', [csrfCookie, adminCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          employee_id: seoExecUserId,
          access_level: 'view_credentials',
          access_reason: 'PRIVATE_ADMIN_CONFIDENTIAL_REASON_99'
        });

      const detailsRes = await request(app)
        .get(`/api/credentials/${createdCredentialId}`)
        .set('Cookie', [csrfCookie, clientCookieA])
        .set('X-CSRF-Token', csrfToken);

      expect(detailsRes.status).toBe(200);
      expect(detailsRes.body.authorizedEmployees.length).toBeGreaterThan(0);
      // Private admin note must NOT be in the client response
      const jsonStr = JSON.stringify(detailsRes.body);
      expect(jsonStr).not.toContain('PRIVATE_ADMIN_CONFIDENTIAL_REASON_99');
    });
  });

  describe('5. Credential Audit Trail & Security Sanitization', () => {
    it('Audit history returns timeline of credential actions without secret values', async () => {
      const res = await request(app)
        .get(`/api/credentials/${createdCredentialId}/audit-history`)
        .set('Cookie', [csrfCookie, adminCookie])
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.logs)).toBe(true);
      expect(res.body.logs.length).toBeGreaterThan(0);

      // Verify actions like created, password_replaced, revealed, access_granted exist
      const actions = res.body.logs.map((l) => l.action);
      expect(actions).toContain('created');
      expect(actions).toContain('password_replaced');
      expect(actions).toContain('revealed');

      // Verify no secrets appear anywhere in audit logs
      const fullLogStr = JSON.stringify(res.body.logs);
      expect(fullLogStr).not.toContain('NewApexGA4Password#2027');
      expect(fullLogStr).not.toContain('ApexGA4Password!2026');
    });
  });
});
