import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const JWT_ISSUER = 'agency-manager';
const JWT_AUDIENCE = 'agency-manager-client';

/**
 * Generates a signed, short-lived JWT access token
 * @param {Object} user 
 * @returns {string}
 */
export function generateAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      clientId: user.client_id || user.clientId || null
    },
    env.JWT_ACCESS_SECRET,
    {
      subject: String(user.id),
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: env.JWT_ACCESS_EXPIRES,
      algorithm: 'HS256'
    }
  );
}

/**
 * Verifies a JWT access token
 * @param {string} token 
 * @returns {Object} decoded payload
 */
export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    algorithms: ['HS256']
  });
}

/**
 * Generates a cryptographically secure random opaque refresh token
 * @returns {string}
 */
export function generateRefreshToken() {
  return crypto.randomBytes(40).toString('hex');
}

/**
 * Generates a SHA-256 hash of an opaque token for secure storage
 * @param {string} token 
 * @returns {string}
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
