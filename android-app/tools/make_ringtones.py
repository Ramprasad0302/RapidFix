#!/usr/bin/env python3
"""
RapidFix job-alert ringtone pack — studio-quality (48 kHz, 16-bit stereo, ~30 s
loops), synthesised from scratch (no samples, no licences needed).

    python3 android-app/tools/make_ringtones.py   → app/src/main/res/raw/alert_*.wav

Each tone is a short musical phrase repeated with breathing room, panned in
stereo and given a little room reverb, then normalised to -1 dBFS.
"""
import math
import os
import random
import struct
import wave

RATE = 48_000
LENGTH_S = 30.0
OUT = os.path.join(os.path.dirname(__file__), '..', 'app', 'src', 'main', 'res', 'raw')

N = int(RATE * LENGTH_S)


def note(name):
    """'C5' → Hz."""
    names = {'C': -9, 'C#': -8, 'D': -7, 'D#': -6, 'E': -5, 'F': -4, 'F#': -3, 'G': -2, 'G#': -1, 'A': 0, 'A#': 1, 'B': 2}
    pitch, octave = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((names[pitch] + 12 * (octave - 4)) / 12)


class Mix:
    def __init__(self):
        self.l = [0.0] * N
        self.r = [0.0] * N

    def add(self, start_s, samples, pan=0.0, gain=1.0):
        """pan -1 (left) … +1 (right), constant-power."""
        a = (pan + 1) * math.pi / 4
        gl, gr = math.cos(a) * gain, math.sin(a) * gain
        i0 = int(start_s * RATE)
        for i, v in enumerate(samples):
            j = i0 + i
            if j >= N:
                break
            self.l[j] += v * gl
            self.r[j] += v * gr

    def reverb(self, mix=0.22, room=0.82):
        """Small Schroeder room: 4 combs + 2 all-passes per side (slightly different = width)."""
        def side(x, offs):
            combs = [int(RATE * t) for t in (0.0297 + offs, 0.0371 + offs, 0.0411 + offs, 0.0437 + offs)]
            out = [0.0] * N
            for d in combs:
                buf = [0.0] * d
                k = 0
                for i in range(N):
                    y = buf[k]
                    buf[k] = x[i] + y * room
                    out[i] += y * 0.25
                    k += 1
                    if k == d:
                        k = 0
            for d, g in ((int(RATE * 0.005), 0.7), (int(RATE * 0.0017), 0.7)):
                buf = [0.0] * d
                k = 0
                for i in range(N):
                    b = buf[k]
                    y = -g * out[i] + b
                    buf[k] = out[i] + g * y
                    out[i] = y
                    k += 1
                    if k == d:
                        k = 0
            return [x[i] * (1 - mix) + out[i] * mix for i in range(N)]

        self.l = side(self.l, 0.0)
        self.r = side(self.r, 0.0011)

    def write(self, path):
        peak = max(max(abs(v) for v in self.l), max(abs(v) for v in self.r)) or 1.0
        scale = 0.891 / peak  # -1 dBFS
        # 40 ms fades so the loop restarts without a click.
        fade = int(RATE * 0.04)
        frames = bytearray()
        for i in range(N):
            f = min(1.0, i / fade, (N - 1 - i) / fade)
            frames += struct.pack('<hh', int(self.l[i] * scale * f * 32767), int(self.r[i] * scale * f * 32767))
        with wave.open(path, 'wb') as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(bytes(frames))


# ─── Instruments ─────────────────────────────────────────────────────────

def mallet(freq, dur=1.4, partials=((1, 1.0, 3.2), (4.0, 0.35, 9.0), (9.8, 0.12, 16.0)), attack=0.004):
    n = int(dur * RATE)
    out = []
    for i in range(n):
        t = i / RATE
        env_a = min(1.0, t / attack)
        out.append(env_a * sum(a * math.exp(-t * d) * math.sin(2 * math.pi * freq * m * t) for m, a, d in partials))
    return out


def bell(freq, dur=4.0):
    return mallet(freq, dur, partials=((0.56, 0.5, 0.9), (1, 1.0, 1.2), (2.76, 0.55, 2.2), (5.40, 0.3, 3.6), (8.93, 0.15, 5.0)), attack=0.002)


def glass(freq, dur=2.6):
    return mallet(freq, dur, partials=((1, 1.0, 1.6), (2.0, 0.25, 3.0), (3.01, 0.18, 4.5)), attack=0.003)


def pluck(freq, dur=2.0, damping=0.996, bright=0.5):
    """Karplus–Strong string."""
    period = max(2, int(RATE / freq))
    rnd = random.Random(int(freq * 1000))
    buf = [rnd.uniform(-1, 1) for _ in range(period)]
    out = []
    k = 0
    for _ in range(int(dur * RATE)):
        v = buf[k]
        nxt = buf[(k + 1) % period]
        buf[k] = damping * (bright * v + (1 - bright) * nxt) if bright != 0.5 else damping * 0.5 * (v + nxt)
        out.append(v)
        k = (k + 1) % period
    return out


def soft_square(freq, dur, harmonics=7):
    n = int(dur * RATE)
    out = []
    for i in range(n):
        t = i / RATE
        env = min(1.0, t / 0.006) * min(1.0, (dur - t) / 0.02)
        out.append(env * sum(math.sin(2 * math.pi * freq * h * t) / h for h in range(1, harmonics + 1, 2)))
    return out


def ring_burst(dur=1.6):
    """Classic telephone bell: 440+480 Hz, warbled at 20 Hz."""
    n = int(dur * RATE)
    out = []
    for i in range(n):
        t = i / RATE
        env = min(1.0, t / 0.01) * min(1.0, (dur - t) / 0.03)
        warble = 0.55 + 0.45 * math.sin(2 * math.pi * 20 * t)
        out.append(env * warble * (math.sin(2 * math.pi * 440 * t) + math.sin(2 * math.pi * 480 * t)) * 0.5)
    return out


def sweep(f0, f1, dur):
    n = int(dur * RATE)
    out = []
    phase = 0.0
    for i in range(n):
        t = i / RATE
        f = f0 + (f1 - f0) * (t / dur)
        phase += 2 * math.pi * f / RATE
        env = min(1.0, t / 0.01) * min(1.0, (dur - t) / 0.03)
        out.append(env * (math.sin(phase) + 0.3 * math.sin(2 * phase)))
    return out


# ─── Phrases ─────────────────────────────────────────────────────────────

def repeat(every_s, fn):
    t = 0.0
    while t < LENGTH_S - 0.5:
        fn(t)
        t += every_s


def tone_marimba(m):
    seq = ['C5', 'E5', 'G5', 'C6', 'G5', 'E5', 'D5', 'G5']
    def phrase(t0):
        for i, n in enumerate(seq):
            m.add(t0 + i * 0.16, mallet(note(n)), pan=(-0.5 + i / len(seq)), gain=0.8)
    repeat(2.4, phrase)


def tone_bells(m):
    seq = [('E5', -0.4), ('B4', 0.4), ('G#5', -0.2), ('E5', 0.3)]
    def phrase(t0):
        for i, (n, p) in enumerate(seq):
            m.add(t0 + i * 0.5, bell(note(n)), pan=p, gain=0.7)
    repeat(3.6, phrase)


def tone_crystal(m):
    seq = ['A5', 'E6', 'C#6', 'A6', 'E6', 'B5']
    def phrase(t0):
        for i, n in enumerate(seq):
            m.add(t0 + i * 0.22, glass(note(n)), pan=math.sin(i), gain=0.6)
    repeat(3.0, phrase)


def tone_classic(m):
    def phrase(t0):
        m.add(t0, ring_burst(), pan=-0.15)
        m.add(t0 + 0.02, ring_burst(), pan=0.15, gain=0.6)
    repeat(3.2, phrase)


def tone_digital(m):
    seq = [(1318.5, 0.09), (1567.98, 0.09), (1318.5, 0.09), (1975.5, 0.18)]
    def phrase(t0):
        t = t0
        for f, d in seq:
            m.add(t, soft_square(f, d), pan=0.0, gain=0.5)
            t += d + 0.05
        t += 0.25
        for f, d in seq:
            m.add(t, soft_square(f, d), pan=0.0, gain=0.5)
            t += d + 0.05
    repeat(2.2, phrase)


def tone_harp(m):
    seq = ['C4', 'E4', 'G4', 'B4', 'C5', 'E5', 'G5', 'B5', 'C6']
    def phrase(t0):
        for i, n in enumerate(seq):
            m.add(t0 + i * 0.07, pluck(note(n), 2.5, 0.9975), pan=-0.6 + 1.2 * i / len(seq), gain=0.55)
    repeat(2.8, phrase)


def tone_guitar(m):
    chords = [['E3', 'B3', 'E4', 'G#4', 'B4', 'E5'], ['A3', 'E4', 'A4', 'C#5', 'E5'], ['B3', 'F#4', 'B4', 'D#5', 'F#5']]
    def phrase(t0):
        for c, chord in enumerate(chords):
            for i, n in enumerate(chord):
                m.add(t0 + c * 0.7 + i * 0.018, pluck(note(n), 1.8, 0.996), pan=-0.3 + 0.12 * i, gain=0.45)
    repeat(3.4, phrase)


def tone_urgent(m):
    def phrase(t0):
        for i in range(3):
            m.add(t0 + i * 0.42, sweep(700, 1400, 0.32), pan=(-0.3, 0.0, 0.3)[i], gain=0.6)
    repeat(2.0, phrase)


def tone_kalimba(m):
    seq = ['G5', 'B5', 'D6', 'G6', 'E6', 'D6', 'B5', 'D6']
    def phrase(t0):
        for i, n in enumerate(seq):
            m.add(t0 + i * 0.19, mallet(note(n), 1.6, partials=((1, 1.0, 2.6), (5.4, 0.22, 7.0), (12.0, 0.06, 14.0)), attack=0.002), pan=(-0.45, 0.45)[i % 2], gain=0.7)
    repeat(2.8, phrase)


def tone_piano(m):
    seq = [('C5', 0.0), ('E5', 0.25), ('G5', 0.5), ('C6', 0.75), ('B5', 1.25), ('G5', 1.5)]
    def phrase(t0):
        for n, at in seq:
            f = note(n)
            m.add(t0 + at, mallet(f, 2.2, partials=((1, 1.0, 1.8), (2, 0.45, 2.6), (3, 0.22, 3.4), (4, 0.12, 4.4), (5, 0.06, 5.4)), attack=0.003), pan=-0.3 + (f - 523) / 1200, gain=0.6)
    repeat(3.2, phrase)


TONES = [
    ('marimba', tone_marimba),
    ('bells', tone_bells),
    ('crystal', tone_crystal),
    ('classic', tone_classic),
    ('digital', tone_digital),
    ('harp', tone_harp),
    ('guitar', tone_guitar),
    ('urgent', tone_urgent),
    ('kalimba', tone_kalimba),
    ('piano', tone_piano),
]

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, build in TONES:
        path = os.path.join(OUT, f'alert_{name}.wav')
        if os.path.exists(path):
            print('exists', path)
            continue
        mix = Mix()
        build(mix)
        mix.reverb()
        mix.write(path)
        print('wrote', path, os.path.getsize(path) // 1024, 'KB')
