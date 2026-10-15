import { env } from '../config/env.js';

/**
 * Centralized Express Error Handling Middleware
 */
export function errorHandler(err, req, res, next) {
  // Handle Zod validation errors
  if (err.name === 'ZodError') {
    return res.status(400).json({
      success: false,
      error: {
        message: err.errors?.[0]?.message || 'Validation error',
        code: 'VALIDATION_ERROR',
        details: err.errors
      }
    });
  }

  // Do not log sensitive credentials
  const status = err.status || err.statusCode || 500;
  const isProd = env.NODE_ENV === 'production';

  if (status >= 500) {
    console.error(`[Internal Server Error] ${req.method} ${req.originalUrl}:`, err.message);
  }

  res.status(status).json({
    success: false,
    error: {
      message: status >= 500 && isProd
        ? 'An unexpected error occurred. Please try again later.'
        : err.message || 'Internal Server Error',
      code: err.code || (status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR')
    }
  });
}
