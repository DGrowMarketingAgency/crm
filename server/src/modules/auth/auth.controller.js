import { AuthService } from './auth.service.js';
import {
  setAuthCookies,
  clearAuthCookies,
  REFRESH_COOKIE_NAME
} from '../../utils/cookies.js';
import { ensureCsrfToken } from '../../utils/csrf.js';

export class AuthController {
  /**
   * Handle user login
   */
  static async login(req, res, next) {
    try {
      const { email, password, rememberMe } = req.body;
      const result = await AuthService.login(email, password, rememberMe);

      setAuthCookies(res, result.accessToken, result.refreshToken, rememberMe);

      return res.status(200).json({
        success: true,
        user: result.user
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Handle refresh token rotation
   */
  static async refresh(req, res, next) {
    try {
      const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
      const result = await AuthService.rotateRefreshToken(refreshToken);

      setAuthCookies(res, result.accessToken, result.refreshToken);

      return res.status(200).json({
        success: true,
        user: result.user
      });
    } catch (error) {
      // Clear cookies if refresh failed due to token invalidation or reuse
      clearAuthCookies(res);
      next(error);
    }
  }

  /**
   * Handle user logout and session revocation
   */
  static async logout(req, res, next) {
    try {
      const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
      if (refreshToken) {
        await AuthService.logout(refreshToken);
      }

      clearAuthCookies(res);

      return res.status(200).json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      clearAuthCookies(res);
      next(error);
    }
  }

  /**
   * Return current authenticated user profile
   */
  static async me(req, res) {
    let designations = [];
    if (req.user.designations) {
      try {
        designations = typeof req.user.designations === 'string'
          ? JSON.parse(req.user.designations)
          : (Array.isArray(req.user.designations) ? req.user.designations : []);
      } catch {
        designations = [String(req.user.designations)];
      }
    }

    return res.status(200).json({
      success: true,
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        department: req.user.department,
        phone: req.user.phone,
        designations,
        status: req.user.status,
        mustChangePassword: Boolean(req.user.must_change_password),
        lastLoginAt: req.user.last_login_at
      }
    });
  }

  /**
   * Provide CSRF token to client
   */
  static async csrfToken(req, res) {
    const csrfToken = ensureCsrfToken(req, res);
    return res.status(200).json({
      success: true,
      csrfToken
    });
  }
}
