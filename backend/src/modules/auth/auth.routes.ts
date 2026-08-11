import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../../config/env';
import { authenticate } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import {
  loginController,
  logoutController,
  meController,
  registerController,
} from './auth.controller';
import { loginSchema, registerSchema } from './auth.schema';

const router = Router();

// Tighter budget on the credential endpoint than on the rest of the API.
const loginLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.isTest,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many sign-in attempts. Please try again later.',
    },
  },
});

router.post('/login', loginLimiter, validateBody(loginSchema), asyncHandler(loginController));
// Registration is public, so it shares the strict credential-endpoint budget.
router.post(
  '/register',
  loginLimiter,
  validateBody(registerSchema),
  asyncHandler(registerController),
);

router.get('/me', authenticate, asyncHandler(meController));
router.post('/logout', authenticate, asyncHandler(logoutController));

export default router;
