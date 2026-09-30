/**
 * Incoming-job alert for technicians: a warm marimba/bell phrase
 * (/sounds/job-alert.wav, 3 s) looped with Web Audio, plus repeating vibration.
 * The Play Store app uses the same tone for its closed-app notification.
 *
 * Browsers only allow sound after the user has touched the page once, so
 * `unlockAudio()` runs on taps anywhere in the app.
 */

const SOUND_URL = '/sounds/job-alert.wav';

let ctx: AudioContext | null = null;
let buffer: Promise<AudioBuffer | null> | null = null;
let source: AudioBufferSourceNode | null = null;
let vibrateTimer: ReturnType<typeof setInterval> | null = null;
let wanted = false;

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

function loadBuffer(c: AudioContext) {
  buffer ??= fetch(SOUND_URL)
    .then((r) => r.arrayBuffer())
    .then((data) => c.decodeAudioData(data))
    .catch(() => {
      buffer = null; // try again next time
      return null;
    });
  return buffer;
}

/** Call from a user gesture (registered on pointerdown). Also preloads the tone. */
export function unlockAudio() {
  const c = context();
  if (!c) return;
  if (c.state === 'suspended') void c.resume().catch(() => undefined);
  void loadBuffer(c);
}

/** Loop the alert (and vibrate) until `stopRinging()`. Safe to call repeatedly. */
export function startRinging() {
  if (wanted) return;
  wanted = true;
  const c = context();
  if (c) {
    if (c.state === 'suspended') void c.resume().catch(() => undefined);
    void loadBuffer(c).then((buf) => {
      if (!buf || !wanted || source) return;
      const gain = c.createGain();
      gain.gain.value = 0.9;
      source = c.createBufferSource();
      source.buffer = buf;
      source.loop = true;
      source.connect(gain).connect(c.destination);
      source.start();
    });
  }
  const buzz = () => navigator.vibrate?.([500, 200, 500]);
  buzz();
  vibrateTimer = setInterval(buzz, 3000);
}

export function stopRinging() {
  wanted = false;
  try {
    source?.stop();
  } catch {
    /* already stopped */
  }
  source = null;
  if (vibrateTimer) clearInterval(vibrateTimer);
  vibrateTimer = null;
  navigator.vibrate?.(0);
}
