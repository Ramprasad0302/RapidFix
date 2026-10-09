import { useSyncExternalStore } from 'react';

/**
 * The launch screen's reveal animation holds the site's own pop-ups (location / notification
 * questions) until it has finished — a browser dialog would otherwise jump on top of it.
 */
let held = false;
let timer: number | undefined;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function holdPopups(ms: number) {
  held = true;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    held = false;
    notify();
  }, ms);
  notify();
}

/** True once pop-ups may open. */
export function usePopupsAllowed() {
  return !useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => held,
  );
}
