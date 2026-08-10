import type { Role } from '../config/permissions';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Populated by `authenticate`; absent on public routes. */
      user?: AuthenticatedUser;
      /** Correlation id echoed back in the `X-Request-Id` response header. */
      requestId?: string;
    }
  }
}

export {};
