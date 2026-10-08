import { create } from 'zustand';
import { haptic } from '../lib/haptics';

interface ToastState {
  message: string | null;
  tone: 'default' | 'error';
  show(message: string, tone?: 'default' | 'error'): void;
  hide(): void;
}

let timer: ReturnType<typeof setTimeout> | undefined;

export const useToast = create<ToastState>()((set) => ({
  message: null,
  tone: 'default',
  show: (message, tone = 'default') => {
    clearTimeout(timer);
    haptic(tone === 'error' ? 'error' : 'success');
    set({ message, tone });
    timer = setTimeout(() => set({ message: null }), 2600);
  },
  hide: () => set({ message: null }),
}));

export const toast = (message: string, tone: 'default' | 'error' = 'default') => useToast.getState().show(message, tone);

export async function copyText(text: string, label = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label}: ${text}`);
  } catch {
    toast(`Couldn't copy. Code: ${text}`, 'error');
  }
}
