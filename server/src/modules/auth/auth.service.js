import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { pool } from '../../config/db.js';
import { env } from '../../config/env.js';
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken
} from '../../utils/tokens.js';

export class AuthService {
  /**
   * Authenticates user with email and password
   * @param {string} email 
   * @param {string} password 
   * @param {boolean} [rememberMe=false]
   */
  static async login(email, password, rememberMe = false) {
    const [users] = await pool.query(
      'SELECT id, name, email, password_hash, role, status, must_change_password, client_id FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      // Generic error message for security
      const error = new Error('Invalid email or password');
      error.status = 401;
      error.code = 'INVALID_CREDENTIALS';
      throw error;
    }

    const user = users[0];

    // Status checks
    if (user.status === 'suspended') {
      const error = new Error('Your account has been suspended. Please contact administrator.');
      error.status = 403;
      error.code = 'ACCOUNT_SUSPENDED';
      throw error;
    }

    if (user.status === 'inactive') {
      const error = new Error('Your account is inactive. Please contact administrator.');
      error.status = 403;
      error.code = 'ACCOUNT_INACTIVE';
      throw error;
    }

    // Verify password with bcrypt
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      const error = new Error('Invalid email or password');
      error.status = 401;
      error.code = 'INVALID_CREDENTIALS';
      throw error;
    }

    // Update last_login_at
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

    // Issue JWT access token
    const accessToken = generateAccessToken(user);

    // Issue opaque refresh token with new family UUID
    const rawRefreshToken = generateRefreshToken();
    const tokenHash = hashToken(rawRefreshToken);
    const family = crypto.randomUUID();

    const days = rememberMe ? 30 : env.JWT_REFRESH_EXPIRES_DAYS;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, family, expires_at)
       VALUES (?, ?, ?, ?)`,
      [user.id, tokenHash, family, expiresAt]
    );

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        clientId: user.client_id ? Number(user.client_id) : null,
        status: user.status,
        mustChangePassword: Boolean(user.must_change_password)
      },
      accessToken,
      refreshToken: rawRefreshToken
    };
  }

  /**
   * Rotates a refresh token with reuse detection in a transaction
   * @param {string} rawRefreshToken 
   */
  static async rotateRefreshToken(rawRefreshToken) {
    if (!rawRefreshToken) {
      const error = new Error('Refresh token is required');
      error.status = 401;
      error.code = 'MISSING_REFRESH_TOKEN';
      throw error;
    }

    const currentHash = hashToken(rawRefreshToken);
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Look up token in database
      const [tokens] = await connection.query(
        `SELECT id, user_id, token_hash, family, expires_at, revoked_at
         FROM refresh_tokens
         WHERE token_hash = ?
         FOR UPDATE`,
        [currentHash]
      );

      if (tokens.length === 0) {
        await connection.rollback();
        const error = new Error('Invalid refresh token');
        error.status = 401;
        error.code = 'INVALID_REFRESH_TOKEN';
        throw error;
      }

      const existingToken = tokens[0];

      // Reuse detection: If the token was ALREADY revoked, revoke the entire family
      if (existingToken.revoked_at !== null) {
        await connection.query(
          'UPDATE refresh_tokens SET revoked_at = NOW() WHERE family = ? AND revoked_at IS NULL',
          [existingToken.family]
        );
        await connection.commit();

        const error = new Error('Token reuse detected. All sessions in this chain have been terminated for security.');
        error.status = 401;
        error.code = 'TOKEN_REUSE_DETECTED';
        throw error;
      }

      // Check expiration
      if (new Date(existingToken.expires_at) < new Date()) {
        await connection.rollback();
        const error = new Error('Refresh token has expired. Please sign in again.');
        error.status = 401;
        error.code = 'REFRESH_TOKEN_EXPIRED';
        throw error;
      }

      // Check user status
      const [users] = await connection.query(
        'SELECT id, name, email, role, status, must_change_password, client_id FROM users WHERE id = ?',
        [existingToken.user_id]
      );

      if (users.length === 0 || users[0].status !== 'active') {
        await connection.rollback();
        const error = new Error('User account is no longer active.');
        error.status = 403;
        error.code = 'ACCOUNT_NOT_ACTIVE';
        throw error;
      }

      const user = users[0];

      // Mark the current refresh token as revoked
      await connection.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?',
        [existingToken.id]
      );

      // Generate new opaque refresh token for the same family
      const newRawRefreshToken = generateRefreshToken();
      const newHash = hashToken(newRawRefreshToken);
      const newExpiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

      await connection.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, family, expires_at)
         VALUES (?, ?, ?, ?)`,
        [user.id, newHash, existingToken.family, newExpiresAt]
      );

      // Generate new JWT access token
      const newAccessToken = generateAccessToken(user);

      await connection.commit();

      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          clientId: user.client_id ? Number(user.client_id) : null,
          status: user.status,
          mustChangePassword: Boolean(user.must_change_password)
        },
        accessToken: newAccessToken,
        refreshToken: newRawRefreshToken
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Revokes a refresh token on logout
   * @param {string} rawRefreshToken 
   */
  static async logout(rawRefreshToken) {
    if (!rawRefreshToken) {
      return;
    }
    const currentHash = hashToken(rawRefreshToken);
    await pool.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL',
      [currentHash]
    );
  }
}
