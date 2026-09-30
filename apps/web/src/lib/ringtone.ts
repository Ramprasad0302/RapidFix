/**
 * Incoming-job ringtone for technicians: a phone-style double ring made with
 * Web Audio (no audio file to download), plus repeating vibration.
 *
 * Browsers only allow sound after the user has touched the page once, so
 * `unlockAudio()` runs on the first tap anywhere in the app.
 */

let ctx: AudioContext | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

/** Call once from a user gesture (we register it on the first pointerdown). */
export function unlockAudio() {
  const c = context();
  if (c && c.state === 'suspended') void c.resume().catch(() => undefined);
}

/** One "ring-ring": two short bursts of a dual-tone bell. */
function ringOnce() {
  const c = context();
  if (!c || c.state !== 'running') return;
  const t0 = c.currentTime;
  for (const start of [0, 0.5]) {
    for (const freq of [880, 1320]) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      // Quick attack, short hold, fade — a bell rather than a beep.
      gain.gain.setValueAtTime(0.0001, t0 + start);
      gain.gain.exponentialRampToValueAtTime(0.35, t0 + start + 0.02);
      gain.gain.setValueAtTime(0.35, t0 + start + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + 0.42);
      osc.connect(gain).connect(c.destination);
      osc.start(t0 + start);
      osc.stop(t0 + start + 0.45);
    }
  }
}

/** Ring (and vibrate) every 2 s until `stopRinging()`. Safe to call repeatedly. */
export function startRinging() {
  if (timer) return;
  unlockAudio();
  const tick = () => {
    ringOnce();
    navigator.vibrate?.([400, 150, 400]);
  };
  tick();
  timer = setInterval(tick, 2000);
}

export function stopRinging() {
  if (timer) clearInterval(timer);
  timer = null;
  navigator.vibrate?.(0);
}
