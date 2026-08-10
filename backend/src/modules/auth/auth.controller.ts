import type { Request, Response } from 'express';
import { requireUser } from '../../middleware/auth.middleware';
import { sendOk } from '../../utils/http';
import { getProfile, login } from './auth.service';
import type { LoginInput } from './auth.schema';

/** POST /auth/login */
export async function loginController(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as LoginInput;
  const result = await login(email, password);
  sendOk(res, result);
}

/** GET /auth/me — used by the SPA to rehydrate its session on reload. */
export async function meController(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const profile = await getProfile(user.id);
  sendOk(res, { user: profile });
}

/**
 * POST /auth/logout
 * JWTs are stateless, so logout is a client-side token discard. The endpoint
 * exists so the frontend has a single, explicit place to hook the flow and so
 * the action is auditable in the access log.
 */
export async function logoutController(req: Request, res: Response): Promise<void> {
  requireUser(req);
  sendOk(res, { message: 'Signed out successfully.' });
}
