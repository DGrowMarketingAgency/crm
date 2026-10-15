import { ACCESS_COOKIE_NAME } from '../utils/cookies.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { pool } from '../config/db.js';

/**
 * Middleware to authenticate requests via JWT access token in cookie or Authorization header
 */
export async function authenticate(req, res, next) {
  try {
    let token = req.cookies?.[ACCESS_COOKIE_NAME];

    // Optional Bearer token header fallback
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Authentication required. No valid session found.',
          code: 'UNAUTHORIZED'
        }
      });
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Access token expired or invalid.',
          code: 'TOKEN_INVALID'
        }
      });
    }

    // Verify user exists and check account status in database
    const [rows] = await pool.query(
      'SELECT id, name, email, role, department, phone, client_id, designations, status, must_change_password, last_login_at FROM users WHERE id = ?',
      [decoded.id]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'User account not found.',
          code: 'USER_NOT_FOUND'
        }
      });
    }

    const user = rows[0];

    // Status checks: active, inactive, suspended
    if (user.status === 'suspended') {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Your account has been suspended. Please contact administrator.',
          code: 'ACCOUNT_SUSPENDED'
        }
      });
    }

    if (user.status === 'inactive') {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Your account is inactive. Please contact administrator.',
          code: 'ACCOUNT_INACTIVE'
        }
      });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}
