import { env } from '../config/env.js';

const isProduction = env.NODE_ENV === 'production';

export const ACCESS_COOKIE_NAME = 'access_token';
export const REFRESH_COOKIE_NAME = 'refresh_token';
export const CSRF_COOKIE_NAME = 'xsrf_token';

/**
 * Sets access and refresh token cookies
 * @param {import('express').Response} res 
 * @param {string} accessToken 
 * @param {string} refreshToken 
 * @param {boolean} [remember=false]
 */
export function setAuthCookies(res, accessToken, refreshToken, remember = false) {
  // Access Token Cookie (15 minutes)
  res.cookie(ACCESS_COOKIE_NAME, accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: 15 * 60 * 1000 // 15 minutes
  });

  // Refresh Token Cookie (7 days or standard session)
  const refreshMaxAge = env.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000;
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/api/auth',
    maxAge: refreshMaxAge
  });
}

/**
 * Clears authentication cookies
 * @param {import('express').Response} res 
 */
export function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax'
  });

  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/api/auth'
  });
}
