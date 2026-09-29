import type { Role } from '@fixora/shared-types';

declare global {
  namespace Express {
    interface Request {
      /** Set by `authenticate()`. */
      auth?: { userId: string; role: Role };
    }
  }
}

export {};
