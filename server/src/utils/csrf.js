import crypto from 'crypto';
import { env } from '../config/env.js';
import { CSRF_COOKIE_NAME } from './cookies.js';

const isProduction = env.NODE_ENV === 'production';

/**
 * Generates and sets a new CSRF token cookie if one doesn't exist
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @returns {string} The CSRF token
 */
export function ensureCsrfToken(req, res) {
  let token = req.cookies[CSRF_COOKIE_NAME];
  if (!token) {
    token = crypto.randomBytes(32).toString('hex');
    const cookieDomain = isProduction ? '.dgrowmarketing.in' : undefined;
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false, // Must be readable by frontend JS/Axios
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      domain: cookieDomain,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
  }
  return token;
}

/**
 * Middleware that verifies CSRF token on state-changing requests (POST, PUT, PATCH, DELETE)
 * Exempts GET, HEAD, OPTIONS
 */
export function csrfProtection(req, res, next) {
  // Always ensure token is present on incoming requests
  ensureCsrfToken(req, res);

  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  const clientToken = req.headers['x-csrf-token'] || req.headers['x-xsrf-token'];
  const cookieToken = req.cookies[CSRF_COOKIE_NAME];

  if (!cookieToken || !clientToken || clientToken !== cookieToken) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'CSRF token validation failed. Please refresh and try again.',
        code: 'EBADCSRFTOKEN'
      }
    });
  }

  next();
}
