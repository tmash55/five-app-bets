"""Synthesises every sound in the game from scratch (no samples, no licences to track).

    python tools/audio/make_sounds.py            # writes assets/sounds/*.wav

Sound effects are short mono WAVs; the two music beds are seamless loops.
"""

from __future__ import annotations

import sys
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "sounds"
SR = 32000
RNG = np.random.default_rng(58)


# --- building blocks -------------------------------------------------------


def t_axis(dur: float) -> np.ndarray:
    return np.arange(int(round(dur * SR))) / SR


def silence(dur: float) -> np.ndarray:
    return np.zeros(int(round(dur * SR)))


def noise(dur: float) -> np.ndarray:
    return RNG.uniform(-1, 1, int(round(dur * SR)))


def sweep(f0: float, f1: float, dur: float, curve: float = 1.0) -> np.ndarray:
    """Phase of a tone gliding from f0 to f1."""
    t = t_axis(dur)
    u = (t / max(dur, 1e-9)) ** curve
    f = f0 + (f1 - f0) * u
    return 2 * np.pi * np.cumsum(f) / SR


def tone(f0: float, dur: float, f1: float | None = None, curve: float = 1.0) -> np.ndarray:
    return np.sin(sweep(f0, f0 if f1 is None else f1, dur, curve))


def decay(dur: float, tau: float, attack: float = 0.002) -> np.ndarray:
    t = t_axis(dur)
    return np.minimum(1.0, t / max(attack, 1e-6)) * np.exp(-t / tau)


def shape(dur: float, attack: float, release: float) -> np.ndarray:
    t = t_axis(dur)
    a = np.clip(t / max(attack, 1e-6), 0, 1)
    r = np.clip((dur - t) / max(release, 1e-6), 0, 1)
    return a * r


def band(x: np.ndarray, lo: float = 0.0, hi: float = 0.0, order: int = 3) -> np.ndarray:
    """Zero-phase band filter in the frequency domain (lo = high-pass corner, hi = low-pass corner)."""
    n = len(x)
    if n == 0:
        return x
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    g = np.ones_like(f)
    if lo > 0:
        g *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1e-6)) ** (2 * order))
    if hi > 0:
        g *= 1 / np.sqrt(1 + (f / hi) ** (2 * order))
    return np.fft.irfft(spec * g, n)


def square(f: float, dur: float, harmonics: int = 9) -> np.ndarray:
    t = t_axis(dur)
    out = np.zeros_like(t)
    for k in range(1, harmonics * 2, 2):
        if f * k > SR * 0.45:
            break
        out += np.sin(2 * np.pi * f * k * t) / k
    return out * (4 / np.pi) * 0.6


def saw(f: float, dur: float, harmonics: int = 14) -> np.ndarray:
    t = t_axis(dur)
    out = np.zeros_like(t)
    for k in range(1, harmonics + 1):
        if f * k > SR * 0.45:
            break
        out += np.sin(2 * np.pi * f * k * t) / k * (-1) ** (k + 1)
    return out * (2 / np.pi)


def bell(f: float, dur: float, tau: float = 0.22, bright: float = 0.35) -> np.ndarray:
    t = t_axis(dur)
    x = np.sin(2 * np.pi * f * t) + bright * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / (tau * 0.4)) + 0.2 * np.sin(2 * np.pi * f * 2 * t)
    return x * decay(dur, tau, 0.003)


def marimba(f: float, dur: float, tau: float = 0.2) -> np.ndarray:
    t = t_axis(dur)
    x = np.sin(2 * np.pi * f * t) + 0.45 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t / 0.03) + 0.12 * np.sin(2 * np.pi * f * 10 * t) * np.exp(-t / 0.012)
    return x * decay(dur, tau, 0.002)


def mix(dur: float, *layers: tuple[float, np.ndarray]) -> np.ndarray:
    """mix(total, (start_time, signal), ...)"""
    out = silence(dur)
    for start, sig in layers:
        i = int(round(start * SR))
        if i >= len(out):
            continue
        n = min(len(sig), len(out) - i)
        out[i : i + n] += sig[:n]
    return out


def norm(x: np.ndarray, peak: float = 0.89) -> np.ndarray:
    m = float(np.max(np.abs(x))) or 1.0
    return x * (peak / m)


def fade_edges(x: np.ndarray, ms: float = 3.0) -> np.ndarray:
    n = max(1, int(SR * ms / 1000))
    y = x.copy()
    ramp = np.linspace(0, 1, n)
    y[:n] *= ramp
    y[-n:] *= ramp[::-1]
    return y


def save(name: str, x: np.ndarray, peak: float = 0.89, loop: bool = False):
    y = norm(x, peak)
    if not loop:
        y = fade_edges(y)
    pcm = np.clip(y * 32767, -32768, 32767).astype("<i2")
    OUT.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    return len(pcm) / SR


def midi(n: float) -> float:
    return 440.0 * 2 ** ((n - 69) / 12)


# --- sound effects ---------------------------------------------------------


def sfx_tap():
    return tone(760, 0.045, 560) * decay(0.045, 0.018) + 0.25 * band(noise(0.045), 2500, 0) * decay(0.045, 0.004)


def sfx_back():
    return tone(520, 0.06, 340) * decay(0.06, 0.024)


def sfx_coin():
    return mix(0.36, (0, bell(midi(88), 0.07, 0.05) * 0.8), (0.06, bell(midi(95), 0.3, 0.13)))


def sfx_coins():
    layers = []
    for i in range(7):
        layers.append((i * 0.07 + RNG.uniform(0, 0.012), bell(midi(88 + RNG.choice([0, 3, 7, 12])), 0.22, 0.08) * (0.6 + 0.4 * RNG.random())))
    return mix(0.75, *layers)


def sfx_buy():
    ring = mix(0.5, (0, bell(midi(96), 0.5, 0.2)), (0.0, bell(midi(100), 0.5, 0.2) * 0.8), (0.0, bell(midi(103), 0.5, 0.16) * 0.5))
    clack = band(noise(0.05), 800, 5000) * decay(0.05, 0.012)
    return mix(0.62, (0, clack * 0.7), (0.08, ring))


def sfx_pack_shake():
    out = []
    for i in range(3):
        n = noise(0.08)
        crinkle = band(n * (RNG.random(len(n)) > 0.72), 3000, 0) * shape(0.08, 0.008, 0.05)
        out.append((i * 0.1, crinkle))
    return mix(0.34, *out)


def sfx_pack_open():
    d = 0.3
    n = noise(d)
    t = t_axis(d)
    rip = band(n * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 70 * t))), 1800, 9000) * shape(d, 0.01, 0.12)
    pop = tone(340, 0.12, 110) * decay(0.12, 0.04)
    air = band(noise(0.35), 500, 4000) * shape(0.35, 0.05, 0.28) * 0.5
    return mix(0.7, (0, rip), (0.27, pop * 1.2), (0.27, air))


def sfx_card_flip():
    d = 0.14
    whoosh = band(noise(d), 700, 5000) * shape(d, 0.05, 0.07)
    click = band(noise(0.02), 2000, 0) * decay(0.02, 0.004)
    return mix(0.18, (0, whoosh * 0.6), (0.12, click * 0.6))


def shimmer(dur: float, amount: float = 0.25) -> np.ndarray:
    n = band(noise(dur), 6000, 0)
    t = t_axis(dur)
    return n * (0.5 + 0.5 * np.sin(2 * np.pi * 17 * t)) * shape(dur, 0.02, dur * 0.8) * amount


def sfx_reveal_common():
    return mix(0.4, (0, bell(midi(84), 0.4, 0.14)))


def sfx_reveal_rare():
    return mix(0.7, (0, bell(midi(84), 0.4, 0.14)), (0.09, bell(midi(88), 0.55, 0.2)), (0.09, shimmer(0.5, 0.12)))


def sfx_reveal_epic():
    notes = [84, 88, 91, 96]
    layers = [(i * 0.075, bell(midi(n), 0.7, 0.24)) for i, n in enumerate(notes)]
    chord = sum(bell(midi(n), 0.9, 0.4) for n in (72, 76, 79)) * 0.35
    return mix(1.25, *layers, (0.3, chord), (0.25, shimmer(0.9, 0.2)))


def sfx_reveal_legend():
    notes = [72, 76, 79, 84, 88, 91, 96]
    layers = [(i * 0.07, bell(midi(n), 0.9, 0.3)) for i, n in enumerate(notes)]
    chord = sum(bell(midi(n), 1.5, 0.7) for n in (60, 67, 72, 76, 79, 84)) * 0.28
    boom = tone(90, 0.6, 38) * decay(0.6, 0.2)
    brass = sum(band(saw(midi(n), 1.1), 0, 2600) for n in (60, 64, 67)) * shape(1.1, 0.04, 0.5) * 0.16
    return mix(2.2, *layers, (0.5, chord), (0.5, boom * 0.9), (0.5, brass), (0.45, shimmer(1.6, 0.3)))


def sfx_level_up():
    notes = [72, 76, 79, 84, 88]
    layers = [(i * 0.06, marimba(midi(n), 0.4, 0.16) + 0.4 * bell(midi(n), 0.4, 0.16)) for i, n in enumerate(notes)]
    return mix(0.85, *layers, (0.24, shimmer(0.55, 0.2)))


def thump(f0: float, f1: float, dur: float, tau: float) -> np.ndarray:
    return tone(f0, dur, f1, 0.5) * decay(dur, tau, 0.001)


def sfx_bounce():
    click = band(noise(0.02), 300, 2500) * decay(0.02, 0.005)
    return mix(0.16, (0, thump(150, 62, 0.15, 0.045)), (0, click * 0.45))


def sfx_dribble():
    click = band(noise(0.015), 400, 2000) * decay(0.015, 0.004)
    return mix(0.11, (0, thump(128, 66, 0.1, 0.03)), (0, click * 0.35))


def rim_partials(dur: float, scale: float = 1.0) -> np.ndarray:
    out = silence(dur)
    for f, tau, a in ((523, 0.22, 1.0), (531, 0.2, 0.5), (1307, 0.16, 0.7), (2113, 0.11, 0.5), (2987, 0.07, 0.35)):
        out += a * tone(f * scale, dur) * decay(dur, tau, 0.001)
    return out


def sfx_rim():
    click = band(noise(0.02), 1500, 0) * decay(0.02, 0.004)
    return mix(0.5, (0, rim_partials(0.5)), (0, click * 0.6))


def sfx_board():
    return mix(0.2, (0, thump(190, 120, 0.14, 0.04)), (0, band(noise(0.06), 200, 1600) * decay(0.06, 0.014) * 0.8))


def sfx_swish():
    d = 0.34
    t = t_axis(d)
    hi = band(noise(d), 2200, 10000) * shape(d, 0.012, 0.26) * (0.75 + 0.25 * np.sin(2 * np.pi * 31 * t))
    lo = band(noise(d), 700, 2200) * shape(d, 0.03, 0.2) * 0.5
    return mix(0.4, (0, hi), (0.03, lo))


def sfx_dunk():
    boom = thump(92, 36, 0.5, 0.16)
    t = t_axis(0.6)
    rattle = rim_partials(0.6, 0.82) * (0.6 + 0.4 * np.sin(2 * np.pi * 23 * t))
    crack = band(noise(0.09), 300, 5000) * decay(0.09, 0.02)
    return mix(0.75, (0, boom * 1.3), (0, crack), (0.01, rattle * 0.8))


def sfx_shoot():
    d = 0.09
    return band(noise(d), 1400, 6000) * shape(d, 0.02, 0.06)


def sfx_pass():
    d = 0.15
    return band(noise(d), 500, 3200) * shape(d, 0.05, 0.09)


def sfx_catch():
    return mix(0.09, (0, band(noise(0.045), 250, 1800) * decay(0.045, 0.012)), (0, thump(210, 130, 0.06, 0.02) * 0.6))


def sfx_steal():
    d = 0.1
    swipe = band(noise(d), 1200, 7000) * shape(d, 0.05, 0.04)
    snap = tone(1900, 0.03, 1200) * decay(0.03, 0.008) + band(noise(0.03), 2500, 0) * decay(0.03, 0.006)
    return mix(0.2, (0, swipe * 0.8), (0.09, snap))


def sfx_swipe():
    d = 0.1
    return band(noise(d), 1000, 6000) * shape(d, 0.05, 0.04)


def sfx_block():
    slap = band(noise(0.08), 500, 3600) * decay(0.08, 0.018)
    return mix(0.2, (0, slap), (0, thump(160, 70, 0.12, 0.035) * 0.9))


def sfx_whistle():
    d = 0.46
    t = t_axis(d)
    f = 2850 + 95 * np.sign(np.sin(2 * np.pi * 36 * t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) + 0.22 * np.sin(2 * ph) + 0.25 * band(noise(d), 2400, 4200)
    return x * shape(d, 0.015, 0.06)


def sfx_buzzer():
    d = 0.95
    x = saw(196, d) + 0.8 * saw(196 * 1.012, d) + 0.6 * square(98, d)
    return band(x, 80, 2800) * shape(d, 0.02, 0.08)


def sfx_tick():
    d = 0.09
    return (tone(880, d) + 0.3 * tone(1760, d)) * shape(d, 0.004, 0.05)


def sfx_go():
    d = 0.34
    return (tone(1320, d) + 0.5 * tone(1760, d) + 0.25 * tone(2640, d)) * shape(d, 0.004, 0.2)


def crowd(dur: float, lo: float, hi: float, rise: float, hold: float) -> np.ndarray:
    n = band(noise(dur), lo, hi, 3)
    t = t_axis(dur)
    # many voices: slow random swell on top of the envelope
    wob = np.interp(t, np.linspace(0, dur, 14), 0.75 + 0.25 * RNG.random(14))
    env = np.clip(t / rise, 0, 1) * np.where(t < rise + hold, 1.0, np.exp(-(t - rise - hold) / (dur * 0.28)))
    return n * wob * env


def whoop(f0: float, f1: float, dur: float) -> np.ndarray:
    t = t_axis(dur)
    ph = sweep(f0, f1, dur, 0.7) + 0.5 * np.sin(2 * np.pi * 6.5 * t)
    x = np.sin(ph) + 0.4 * np.sin(2 * ph) + 0.2 * np.sin(3 * ph)
    return band(x, 300, 3200) * shape(dur, 0.06, dur * 0.5)


def sfx_cheer():
    d = 1.7
    base = crowd(d, 420, 2700, 0.16, 0.55)
    voices = [(RNG.uniform(0.02, 0.5), whoop(RNG.uniform(520, 760), RNG.uniform(820, 1150), RNG.uniform(0.35, 0.6)) * RNG.uniform(0.05, 0.11)) for _ in range(9)]
    claps = [(RNG.uniform(0.1, 1.2), band(noise(0.02), 900, 4500) * decay(0.02, 0.006) * RNG.uniform(0.1, 0.25)) for _ in range(26)]
    return mix(d, (0, base), *voices, *claps)


def sfx_cheer_big():
    d = 2.6
    base = crowd(d, 400, 2900, 0.2, 1.1)
    voices = [(RNG.uniform(0.02, 1.1), whoop(RNG.uniform(520, 800), RNG.uniform(850, 1300), RNG.uniform(0.4, 0.8)) * RNG.uniform(0.06, 0.12)) for _ in range(18)]
    claps = [(RNG.uniform(0.1, 2.0), band(noise(0.02), 900, 4500) * decay(0.02, 0.006) * RNG.uniform(0.1, 0.25)) for _ in range(60)]
    return mix(d, (0, base), *voices, *claps)


def sfx_ooh():
    d = 1.0
    base = crowd(d, 240, 1300, 0.14, 0.2)
    voices = [(RNG.uniform(0.0, 0.15), whoop(RNG.uniform(380, 520), RNG.uniform(250, 330), RNG.uniform(0.5, 0.75)) * RNG.uniform(0.08, 0.14)) for _ in range(7)]
    return mix(d, (0, base), *voices)


def sfx_perfect():
    layers = [(i * 0.05, bell(midi(n), 0.4, 0.14)) for i, n in enumerate((91, 96, 100))]
    return mix(0.6, *layers, (0.05, shimmer(0.45, 0.16)))


def sfx_ankle():
    d = 0.46
    t = t_axis(d)
    ph = sweep(1250, 360, d, 0.8) + 0.6 * np.sin(2 * np.pi * 9 * t)
    return (np.sin(ph) + 0.2 * np.sin(2 * ph)) * shape(d, 0.02, 0.12)


def sfx_squeak():
    d = 0.1
    t = t_axis(d)
    f = 2500 + 600 * np.sin(np.pi * t / d)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return (np.sin(ph) + 0.4 * np.sin(2 * ph)) * shape(d, 0.01, 0.04)


def sfx_land():
    return mix(0.14, (0, thump(120, 55, 0.13, 0.035)), (0, band(noise(0.04), 200, 1500) * decay(0.04, 0.01) * 0.6))


def sfx_hype():
    d = 0.55
    t = t_axis(d)
    ph = sweep(180, 1400, d, 2.0)
    rise = (np.sin(ph) + 0.5 * np.sin(2 * ph)) * (0.6 + 0.4 * np.sin(2 * np.pi * 24 * t)) * shape(d, 0.05, 0.03)
    chord = sum(bell(midi(n), 0.9, 0.35) for n in (72, 76, 79, 84, 88)) * 0.4
    zap = band(noise(0.25), 3000, 0) * decay(0.25, 0.06)
    return mix(1.5, (0, rise * 0.7), (0.52, chord), (0.52, zap * 0.5), (0.5, shimmer(0.9, 0.25)))


def sfx_hype_end():
    d = 0.5
    ph = sweep(900, 160, d, 0.6)
    return (np.sin(ph) + 0.3 * np.sin(2 * ph)) * shape(d, 0.02, 0.3)


def brass(n: float, dur: float) -> np.ndarray:
    f = midi(n)
    x = saw(f, dur) + 0.6 * saw(f * 1.006, dur)
    t = t_axis(dur)
    return band(x, 120, 2400 + 900 * np.exp(-t.mean())) * shape(dur, 0.025, min(0.12, dur * 0.4)) * (1 + 0.05 * np.sin(2 * np.pi * 5.5 * t))


def sfx_win():
    b = 0.13
    line = [(0, 67, b), (b, 72, b), (2 * b, 76, b), (3 * b, 79, b * 1.6), (4.8 * b, 76, b), (5.8 * b, 79, b * 0.9)]
    layers = [(s, brass(n, d * 1.05) * 0.8) for s, n, d in line]
    end = 6.9 * b
    final = sum(brass(n, 1.1) for n in (72, 76, 79, 84)) * 0.45
    cym = band(noise(1.2), 5000, 0) * decay(1.2, 0.35) * 0.35
    drum = thump(110, 45, 0.3, 0.1)
    return mix(end + 1.25, *layers, (end, final), (end, cym), (end, drum * 0.9), (end, shimmer(1.0, 0.2)))


def sfx_lose():
    notes = [(0, 64, 0.34), (0.36, 63, 0.34), (0.72, 62, 0.34), (1.08, 61, 0.9)]
    layers = []
    for s, n, d in notes:
        f = midi(n)
        t = t_axis(d)
        ph = 2 * np.pi * f * t + (0.9 if d > 0.5 else 0.3) * np.sin(2 * np.pi * 5 * t)
        x = np.sin(ph) + 0.5 * np.sin(2 * ph) + 0.3 * np.sin(3 * ph) + 0.15 * np.sin(4 * ph)
        layers.append((s, band(x, 100, 1500) * shape(d, 0.03, 0.14 if d < 0.5 else 0.5)))
    return mix(2.0, *layers)


def sfx_star():
    return mix(0.5, (0, bell(midi(93), 0.5, 0.16)), (0, bell(midi(98), 0.5, 0.12) * 0.6), (0, shimmer(0.4, 0.14)))


def sfx_lock():
    return mix(0.16, (0, thump(180, 90, 0.08, 0.025)), (0.07, thump(140, 70, 0.08, 0.025) * 0.8))


# --- music -----------------------------------------------------------------


class Loop:
    """A bar-based loop; anything that rings past the end wraps round to the start."""

    def __init__(self, bpm: float, bars: int):
        self.beat = 60.0 / bpm
        self.dur = bars * 4 * self.beat
        self.n = int(round(self.dur * SR))
        self.buf = np.zeros(self.n)

    def add(self, beat: float, sig: np.ndarray, gain: float = 1.0):
        i = int(round(beat * self.beat * SR)) % self.n
        idx = (i + np.arange(len(sig))) % self.n
        np.add.at(self.buf, idx, sig * gain)


def kick() -> np.ndarray:
    return mix(0.22, (0, thump(130, 44, 0.22, 0.07)), (0, 0.3 * band(noise(0.012), 800, 5000) * decay(0.012, 0.003)))


def snare() -> np.ndarray:
    return mix(0.16, (0, band(noise(0.16), 900, 7000) * decay(0.16, 0.045)), (0, 0.5 * thump(220, 170, 0.09, 0.03)))


def clap() -> np.ndarray:
    out = silence(0.16)
    for k, s in enumerate((0.0, 0.011, 0.023)):
        b = band(noise(0.1), 1000, 5000) * decay(0.1, 0.02 if k < 2 else 0.05)
        i = int(s * SR)
        out[i : i + len(b)] += b[: len(out) - i]
    return out


def hat(open_: bool = False) -> np.ndarray:
    d = 0.12 if open_ else 0.04
    return band(noise(d), 7000, 0) * decay(d, 0.045 if open_ else 0.01)


def bass_note(n: float, dur: float) -> np.ndarray:
    f = midi(n)
    x = square(f, dur, 5) * 0.7 + np.sin(2 * np.pi * f * t_axis(dur))
    return band(x, 0, 900) * shape(dur, 0.006, min(0.06, dur * 0.4))


def stab(notes, dur: float) -> np.ndarray:
    out = silence(dur)
    for n in notes:
        f = midi(n)
        t = t_axis(dur)
        out += np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) + 0.2 * np.sin(2 * np.pi * 3.01 * f * t)
    return out * decay(dur, 0.09, 0.004) / len(notes)


def music_menu():
    """Sunny and bouncy: I - vi - IV - V in C with a marimba tune."""
    L = Loop(112, 8)
    chords = [(48, (60, 64, 67)), (45, (57, 60, 64)), (41, (57, 60, 65)), (43, (59, 62, 67))] * 2
    for bar, (root, tri) in enumerate(chords):
        b0 = bar * 4
        # drums
        for q in (0, 2):
            L.add(b0 + q, kick(), 0.95)
        L.add(b0 + 2.5, kick(), 0.6)
        for q in (1, 3):
            L.add(b0 + q, clap(), 0.5)
            L.add(b0 + q, snare(), 0.32)
        for e in range(8):
            L.add(b0 + e * 0.5, hat(e == 7), 0.2 if e % 2 else 0.12)
        # bass: root, octave bounce
        for q, n, d in ((0, root, 0.45), (0.75, root + 12, 0.2), (1.5, root, 0.4), (2.5, root + 7, 0.3), (3, root + 12, 0.25), (3.5, root + 7, 0.25)):
            L.add(b0 + q, bass_note(n - 12, d * L.beat * 1.6), 0.5)
        # off-beat chord stabs
        for q in (0.5, 1.5, 2.5, 3.5):
            L.add(b0 + q, stab(tri, 0.22), 0.3)
    # the tune (beats from the start, midi note, length in beats)
    tune_a = [(0, 76, 0.5), (0.5, 79, 0.5), (1, 84, 1), (2.5, 81, 0.5), (3, 79, 1),
              (4, 76, 0.5), (4.5, 72, 0.5), (5, 76, 1), (6.5, 74, 0.5), (7, 72, 1),
              (8, 77, 0.5), (8.5, 81, 0.5), (9, 84, 1), (10.5, 81, 0.5), (11, 77, 1),
              (12, 79, 0.5), (12.5, 83, 0.5), (13, 86, 1), (14, 83, 0.5), (14.5, 79, 0.5), (15, 74, 1)]
    tune_b = [(16, 84, 0.5), (16.5, 83, 0.5), (17, 79, 1), (18.5, 76, 0.5), (19, 79, 1),
              (20, 81, 0.5), (20.5, 79, 0.5), (21, 76, 1), (22.5, 72, 0.5), (23, 69, 1),
              (24, 72, 0.5), (24.5, 77, 0.5), (25, 81, 0.75), (25.75, 84, 0.75), (26.5, 81, 0.5), (27, 77, 1),
              (28, 79, 0.5), (28.5, 83, 0.5), (29, 86, 0.5), (29.5, 91, 1), (31, 86, 0.5), (31.5, 79, 0.5)]
    for beat, n, length in tune_a + tune_b:
        d = max(0.25, length * L.beat * 1.5)
        L.add(beat, marimba(midi(n), d, 0.16 + 0.05 * length), 0.42)
        L.add(beat, marimba(midi(n + 12), d, 0.1), 0.1)
    return band(L.buf, 30, 12000)


def music_game():
    """A low-key court groove: drums, a pentatonic bass riff and a few clavinet pokes, quiet enough to sit under the action."""
    L = Loop(100, 8)
    riff = [(0, 45, 0.5), (0.75, 45, 0.25), (1.5, 48, 0.5), (2.5, 50, 0.5), (3.25, 52, 0.5)]
    riff2 = [(0, 43, 0.5), (0.75, 43, 0.25), (1.5, 45, 0.5), (2.5, 48, 0.5), (3.5, 50, 0.4)]
    for bar in range(8):
        b0 = bar * 4
        for q in (0, 1.75, 2.5):
            L.add(b0 + q, kick(), 0.95)
        for q in (1, 3):
            L.add(b0 + q, snare(), 0.55)
        for e in range(16):
            L.add(b0 + e * 0.25, hat(e % 8 == 6), 0.14 if e % 4 == 2 else 0.07)
        for q, n, d in (riff2 if bar % 4 == 3 else riff):
            L.add(b0 + q, bass_note(n - 12, d * L.beat * 1.5), 0.6)
        if bar % 2 == 1:
            for q, tri in ((2.5, (69, 72, 76)), (3.25, (67, 72, 76))):
                L.add(b0 + q, stab(tri, 0.14), 0.2)
        if bar % 4 == 3:
            L.add(b0 + 3.5, clap(), 0.4)
            L.add(b0 + 3.75, clap(), 0.45)
    return band(L.buf, 30, 11000)


SOUNDS = {
    "tap": (sfx_tap, 0.7),
    "back": (sfx_back, 0.7),
    "coin": (sfx_coin, 0.8),
    "coins": (sfx_coins, 0.8),
    "buy": (sfx_buy, 0.85),
    "packShake": (sfx_pack_shake, 0.8),
    "packOpen": (sfx_pack_open, 0.89),
    "cardFlip": (sfx_card_flip, 0.7),
    "revealCommon": (sfx_reveal_common, 0.7),
    "revealRare": (sfx_reveal_rare, 0.8),
    "revealEpic": (sfx_reveal_epic, 0.89),
    "revealLegend": (sfx_reveal_legend, 0.93),
    "levelUp": (sfx_level_up, 0.85),
    "star": (sfx_star, 0.8),
    "lock": (sfx_lock, 0.7),
    "bounce": (sfx_bounce, 0.85),
    "dribble": (sfx_dribble, 0.7),
    "rim": (sfx_rim, 0.85),
    "board": (sfx_board, 0.85),
    "swish": (sfx_swish, 0.85),
    "dunk": (sfx_dunk, 0.95),
    "shoot": (sfx_shoot, 0.5),
    "pass": (sfx_pass, 0.55),
    "catch": (sfx_catch, 0.6),
    "steal": (sfx_steal, 0.85),
    "swipe": (sfx_swipe, 0.5),
    "block": (sfx_block, 0.9),
    "whistle": (sfx_whistle, 0.75),
    "buzzer": (sfx_buzzer, 0.85),
    "tick": (sfx_tick, 0.7),
    "go": (sfx_go, 0.8),
    "cheer": (sfx_cheer, 0.8),
    "cheerBig": (sfx_cheer_big, 0.85),
    "ooh": (sfx_ooh, 0.75),
    "perfect": (sfx_perfect, 0.8),
    "ankle": (sfx_ankle, 0.7),
    "squeak": (sfx_squeak, 0.45),
    "land": (sfx_land, 0.7),
    "hype": (sfx_hype, 0.9),
    "hypeEnd": (sfx_hype_end, 0.6),
    "win": (sfx_win, 0.9),
    "lose": (sfx_lose, 0.75),
}

MUSIC = {"musicMenu": (music_menu, 0.8), "musicGame": (music_game, 0.8)}


def main():
    only = set(sys.argv[1:])
    total = 0.0
    size = 0
    for name, (fn, peak) in SOUNDS.items():
        if only and name not in only:
            continue
        d = save(name, fn(), peak)
        total += d
        size += (OUT / f"{name}.wav").stat().st_size
    for name, (fn, peak) in MUSIC.items():
        if only and name not in only:
            continue
        d = save(name, fn(), peak, loop=True)
        total += d
        size += (OUT / f"{name}.wav").stat().st_size
    print(f"wrote {len(SOUNDS) + len(MUSIC)} sounds to {OUT.relative_to(ROOT)}: {total:.1f}s, {size / 1e6:.2f} MB")
    write_file_list()


def write_file_list():
    """The app loads sounds through this generated list, so a new sound only has to be added here."""
    lines = [
        "// Generated by tools/audio/make_sounds.py. Do not edit by hand.",
        "",
        "export const SFX_FILES = {",
    ]
    for name in sorted(SOUNDS):
        lines.append(f"  {name}: require('../../assets/sounds/{name}.wav'),")
    lines += ["} as const;", "", "export const MUSIC_FILES = {"]
    for name in MUSIC:
        key = name[len("music"):].lower()
        lines.append(f"  {key}: require('../../assets/sounds/{name}.wav'),")
    lines += ["} as const;", ""]
    (ROOT / "src" / "audio" / "files.ts").write_text("\n".join(lines))


if __name__ == "__main__":
    main()
