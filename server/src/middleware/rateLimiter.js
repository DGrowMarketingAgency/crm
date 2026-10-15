import rateLimit from 'express-rate-limit';

/**
 * Strict rate limiter for authentication endpoints to prevent brute-force attacks
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    success: false,
    error: {
      message: 'Too many authentication attempts. Please try again after 15 minutes.',
      code: 'RATE_LIMIT_EXCEEDED'
    }
  }
});

/**
 * Rate limiter for sensitive credential reveal operations
 */
export const credentialRevealLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // limit each IP to 20 reveal requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      message: 'Rate limit exceeded for credential reveal requests. Please wait a minute before trying again.',
      code: 'REVEAL_RATE_LIMIT_EXCEEDED'
    }
  }
});

/**
 * Rate limiter for credential mutations (create, update, grant, revoke)
 */
export const credentialMutationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 40, // limit each IP to 40 mutation requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      message: 'Too many credential operations. Please slow down.',
      code: 'MUTATION_RATE_LIMIT_EXCEEDED'
    }
  }
});

