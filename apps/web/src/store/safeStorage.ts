import { createJSONStorage } from 'zustand/middleware';

/**
 * localStorage that never throws (private mode, blocked storage, quota).
 * Used only for per-device conveniences — nothing critical lives here.
 */
export const safeStorage = createJSONStorage(() => ({
  getItem: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage unavailable */
    }
  },
  removeItem: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* storage unavailable */
    }
  },
}));
