import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { loginSchema } from './auth.validation.js';
import { validate } from '../../middleware/validate.js';
import { authLimiter } from '../../middleware/rateLimiter.js';
import { authenticate } from '../../middleware/authenticate.js';
import { csrfProtection } from '../../utils/csrf.js';
import { UsersController } from '../users/users.controller.js';
import { acceptInvitationSchema } from '../users/users.validation.js';

const router = Router();

// CSRF Token endpoint
router.get('/csrf-token', AuthController.csrfToken);

// Login endpoint with rate limiting, csrf verification and request payload validation
router.post('/login', authLimiter, csrfProtection, validate(loginSchema), AuthController.login);

// Refresh endpoint with rate limiting (rotates refresh token & issues new access token)
router.post('/refresh', authLimiter, AuthController.refresh);

// Logout endpoint with session revocation and cookie clearance
router.post('/logout', csrfProtection, AuthController.logout);

// Current user profile endpoint (protected by JWT access token)
router.get('/me', authenticate, AuthController.me);

// Public invitation acceptance endpoint
router.post('/accept-invitation', validate(acceptInvitationSchema), UsersController.acceptInvitation);

export default router;
