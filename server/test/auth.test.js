import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../src/app.js';
import { pool, testConnection } from '../src/config/db.js';

describe('Phase 1: Database & Authentication Suite', () => {
  let csrfToken = '';
  let csrfCookie = '';
  let activeUser = {
    email: 'owner@agency.com',
    password: 'OwnerPassword123!'
  };

  beforeAll(async () => {
    // Ensure test user exists with known password
    const passwordHash = await bcrypt.hash('OwnerPassword123!', 10);
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ('Agency Owner', 'owner@agency.com', ?, 'owner', 'active')
       ON DUPLICATE KEY UPDATE password_hash = ?, status = 'active'`,
      [passwordHash, passwordHash]
    );

    // Create inactive user for testing
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ('Inactive User', 'inactive@agency.com', ?, 'member', 'inactive')
       ON DUPLICATE KEY UPDATE password_hash = ?, status = 'inactive'`,
      [passwordHash, passwordHash]
    );

    // Create suspended user for testing
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ('Suspended User', 'suspended@agency.com', ?, 'member', 'suspended')
       ON DUPLICATE KEY UPDATE password_hash = ?, status = 'suspended'`,
      [passwordHash, passwordHash]
    );

    // Fetch initial CSRF token
    const res = await request(app).get('/api/auth/csrf-token');
    csrfToken = res.body.csrfToken;
    const cookies = res.headers['set-cookie'];
    csrfCookie = cookies ? cookies.find((c) => c.startsWith('xsrf_token=')) : '';
  });

  afterAll(async () => {
    // Clean up created test accounts (keep owner or clean up temp)
    await pool.query("DELETE FROM users WHERE email IN ('inactive@agency.com', 'suspended@agency.com')");
  });

  // 1. Database Connection and Health
  describe('1. Health and Database Connectivity', () => {
    it('should report database connected and status ok', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.database).toBe('connected');
    });

    it('should verify testConnection helper returns true', async () => {
      const ok = await testConnection();
      expect(ok).toBe(true);
    });
  });

  // 2. CSRF Protection
  describe('2. CSRF Protection', () => {
    it('should reject state-changing requests when CSRF token is missing', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: activeUser.email, password: activeUser.password });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('EBADCSRFTOKEN');
    });

    it('should reject state-changing requests when CSRF token header does not match cookie', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Cookie', [csrfCookie])
        .set('X-CSRF-Token', 'mismatched-token-value')
        .send({ email: activeUser.email, password: activeUser.password });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('EBADCSRFTOKEN');
    });
  });

  // 3. Request Validation
  describe('3. Request Payload Validation (Zod)', () => {
    it('should reject login request with invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Cookie', [csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'invalid-email-format', password: 'Password123!' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject login request with missing password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Cookie', [csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'owner@agency.com', password: '' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // 4. Invalid Credentials & Security Messages
  describe('4. Authentication Failure Scenarios', () => {
    it('should return generic error message for non-existent account', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Cookie', [csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'nonexistent@agency.com', password: 'AnyPassword123!' });

      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('Invalid email or password');
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should return generic error message for incorrect password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Cookie', [csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ email: activeUser.email, password: 'WrongPassword999!' });

      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('Invalid email or password');
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should reject login for inactive account with 403', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Cookie', [csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'inactive@agency.com', password: 'OwnerPassword123!' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
    });

    it('should reject login for suspended account with 403', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Cookie', [csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'suspended@agency.com', password: 'OwnerPassword123!' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
    });
  });

  // 5. Successful Login & Cookie Transport
  describe('5. Successful Login & Session Transport', () => {
    let accessCookie = '';
    let refreshCookie = '';

    it('should login successfully, set HttpOnly cookies, and update last_login_at', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Cookie', [csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ email: activeUser.email, password: activeUser.password });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.email).toBe(activeUser.email);
      expect(res.body.user.role).toBe('owner');
      expect(res.body.user.password_hash).toBeUndefined();

      const setCookies = res.headers['set-cookie'];
      expect(setCookies).toBeDefined();

      accessCookie = setCookies.find((c) => c.startsWith('access_token='));
      refreshCookie = setCookies.find((c) => c.startsWith('refresh_token='));

      expect(accessCookie).toBeDefined();
      expect(accessCookie).toContain('HttpOnly');
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain('HttpOnly');

      // Verify last_login_at in database
      const [rows] = await pool.query('SELECT last_login_at FROM users WHERE email = ?', [activeUser.email]);
      expect(rows[0].last_login_at).not.toBeNull();
    });

    // 6. Current User Profile (/api/auth/me)
    describe('6. Current User Profile & Protected Routes', () => {
      it('should return authenticated user details with valid access token cookie', async () => {
        const res = await request(app)
          .get('/api/auth/me')
          .set('Cookie', [accessCookie]);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.user.email).toBe(activeUser.email);
        expect(res.body.user.role).toBe('owner');
      });

      it('should reject /api/auth/me with 401 when access token is missing', async () => {
        const res = await request(app).get('/api/auth/me');
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
      });

      it('should reject /api/auth/me with 401 when access token is invalid', async () => {
        const res = await request(app)
          .get('/api/auth/me')
          .set('Cookie', ['access_token=invalid.jwt.token; Path=/']);

        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('TOKEN_INVALID');
      });
    });

    // 7. Refresh Token Rotation & Reuse Detection
    describe('7. Refresh Token Rotation & Reuse Detection', () => {
      let rotatedRefreshCookie = '';

      it('should rotate refresh token and issue new access & refresh tokens', async () => {
        const res = await request(app)
          .post('/api/auth/refresh')
          .set('Cookie', [refreshCookie]);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const setCookies = res.headers['set-cookie'];
        rotatedRefreshCookie = setCookies.find((c) => c.startsWith('refresh_token='));
        expect(rotatedRefreshCookie).toBeDefined();
        expect(rotatedRefreshCookie).not.toEqual(refreshCookie);
      });

      it('should detect refresh token reuse, revoke token family, and return 401', async () => {
        // Attempt to replay the OLD refresh token that was already rotated
        const res = await request(app)
          .post('/api/auth/refresh')
          .set('Cookie', [refreshCookie]);

        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('TOKEN_REUSE_DETECTED');

        // Now the rotated token should also be revoked because the entire family was terminated
        const followUpRes = await request(app)
          .post('/api/auth/refresh')
          .set('Cookie', [rotatedRefreshCookie]);

        expect(followUpRes.status).toBe(401);
      });
    });

    // 8. Logout and Session Invalidation
    describe('8. Logout and Session Invalidation', () => {
      let freshRefreshCookie = '';

      beforeAll(async () => {
        // Sign in fresh to get valid cookies
        const res = await request(app)
          .post('/api/auth/login')
          .set('Cookie', [csrfCookie])
          .set('X-CSRF-Token', csrfToken)
          .send({ email: activeUser.email, password: activeUser.password });

        const setCookies = res.headers['set-cookie'];
        freshRefreshCookie = setCookies.find((c) => c.startsWith('refresh_token='));
      });

      it('should logout, revoke refresh token in database, and clear cookies', async () => {
        const res = await request(app)
          .post('/api/auth/logout')
          .set('Cookie', [csrfCookie, freshRefreshCookie])
          .set('X-CSRF-Token', csrfToken);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        // Check cookies cleared in response headers
        const setCookies = res.headers['set-cookie'];
        const clearedAccess = setCookies.find((c) => c.includes('access_token=;'));
        const clearedRefresh = setCookies.find((c) => c.includes('refresh_token=;'));
        expect(clearedAccess).toBeDefined();
        expect(clearedRefresh).toBeDefined();

        // Attempting to use the logged-out refresh token should now fail
        const refreshAttempt = await request(app)
          .post('/api/auth/refresh')
          .set('Cookie', [freshRefreshCookie]);

        expect(refreshAttempt.status).toBe(401);
      });
    });
  });
});
