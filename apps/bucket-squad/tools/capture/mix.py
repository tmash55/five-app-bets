"""Lay the game's own sounds under a captured walkthrough.

usage: mix.py sound.json out.wav seconds [--stems]

sound.json is the development sound log the app keeps while the capture runs
(what was played, when, and how loud) plus the capture's own markers:
`start` (first frame), `cut0`/`cut1` (a stretch of the match that was skipped)
and `end`. Times are page time in milliseconds, which the capture drives frame
by frame, so they line up with the frames exactly.
"""
import json, os, sys, wave
import numpy as np

SR = 32000
SOUNDS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'sounds')
# the same pool sizes the app uses: a sound played again on a busy voice restarts that voice
VOICES = {'tap': 2, 'coin': 3, 'dribble': 3, 'bounce': 2, 'rim': 2, 'cardFlip': 2, 'star': 3, 'swipe': 2, 'land': 2, 'tick': 2}
MUSIC = {'menu': 'musicMenu', 'game': 'musicGame'}

_cache = {}
_takes = {}


def takes(name):
    """How many takes a sound has: recorded sounds come as name_1.wav, name_2.wav, ..."""
    if name not in _takes:
        n = 0
        while os.path.exists(os.path.join(SOUNDS, '%s_%d.wav' % (name, n + 1))):
            n += 1
        _takes[name] = n
    return _takes[name]


def load(name, take=0):
    stem = '%s_%d' % (name, take + 1) if takes(name) else name
    if stem not in _cache:
        w = wave.open(os.path.join(SOUNDS, stem + '.wav'))
        assert w.getnchannels() == 1 and w.getframerate() == SR and w.getsampwidth() == 2, stem
        _cache[stem] = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(np.float32) / 32768.0
    return _cache[stem]


def fade(buf, a, b, up):
    """Linear fade over samples [a, b) of buf, in place."""
    a = max(0, a)
    b = min(len(buf), b)
    if b <= a:
        return
    ramp = np.linspace(0.0, 1.0, b - a, endpoint=False, dtype=np.float32)
    buf[a:b] *= ramp if up else (1.0 - ramp)


def main():
    src, out, seconds = sys.argv[1], sys.argv[2], float(sys.argv[3])
    stems = '--stems' in sys.argv
    log = json.load(open(src))
    kinds = [e['kind'] for e in log]
    i_start = kinds.index('start')
    i_end = kinds.index('end')
    i_cut0 = kinds.index('cut0') if 'cut0' in kinds else None
    i_cut1 = kinds.index('cut1') if 'cut1' in kinds else None
    start = log[i_start]['t']
    gap = (log[i_cut1]['t'] - log[i_cut0]['t']) if i_cut0 is not None else 0.0
    cut_at = (log[i_cut0]['t'] - start) / 1000.0 if i_cut0 is not None else None

    def when(i, t):
        """Video time in seconds of log entry i, or None when it fell in the skipped stretch."""
        if i_cut0 is not None and i_cut0 < i < i_cut1:
            return None
        if i_cut1 is not None and i > i_cut1:
            return (t - start - gap) / 1000.0
        return (t - start) / 1000.0

    n = int(round(seconds * SR))
    music = np.zeros(n, dtype=np.float32)
    before = np.zeros(n, dtype=np.float32)  # effects up to the cut
    after = np.zeros(n, dtype=np.float32)   # effects from the cut on

    # ---- music: one bed at a time, switched the moment the app switches it
    beds = []  # (time, name or None, level)
    current = None
    for i, e in enumerate(log[:i_start]):
        if e['kind'] == 'music':
            current = (e['name'], e['volume'])
    if current and current[0]:
        beds.append((0.0, current[0], current[1]))
    last = current[0] if current else None
    for i, e in enumerate(log):
        if i <= i_start or i >= i_end or e['kind'] != 'music':
            continue
        t = when(i, e['t'])
        if t is None:
            t = cut_at
        if e['name'] == last:
            continue
        last = e['name']
        beds.append((t, e['name'], e['volume']))
    for k, (t, name, level) in enumerate(beds):
        if not name:
            continue
        t_end = beds[k + 1][0] if k + 1 < len(beds) else seconds
        a, b = int(round(t * SR)), min(n, int(round(t_end * SR)))
        if b <= a:
            continue
        loop = load(MUSIC[name])
        reps = int(np.ceil((b - a) / len(loop)))
        seg = np.tile(loop, reps)[: b - a].copy() * level
        fade(seg, 0, int((0.35 if t == 0 else 0.02) * SR), True)
        fade(seg, len(seg) - int(0.05 * SR), len(seg), False)
        music[a:b] += seg

    # ---- effects, with the app's voice pools
    events = []
    for i, e in enumerate(log):
        if i <= i_start or i >= i_end or e['kind'] != 'sfx':
            continue
        t = when(i, e['t'])
        if t is None or t >= seconds:
            continue
        events.append({'t': t, 'name': e['name'], 'take': e.get('take', 0), 'vol': e['volume'], 'late': i_cut1 is not None and i > i_cut1})
    turn = {}
    held = {}
    for ev in events:
        # like the app: each take has its own players, at least one, sharing the sound's voices between them
        voices = max(1, -(-VOICES.get(ev['name'], 1) // max(1, takes(ev['name']))))
        row = (ev['name'], ev['take'])
        v = turn.get(row, 0)
        turn[row] = (v + 1) % voices
        key = (ev['name'], ev['take'], v)
        if key in held:
            held[key]['stop'] = ev['t']
        held[key] = ev
    for ev in events:
        s = load(ev['name'], ev['take'])
        a = int(round(ev['t'] * SR))
        length = len(s)
        if 'stop' in ev:
            length = min(length, max(0, int(round(ev['stop'] * SR)) - a))
        length = min(length, n - a)
        if length <= 0:
            continue
        seg = s[:length].copy() * ev['vol']
        if length < len(s):
            fade(seg, length - int(0.004 * SR), length, False)
        (after if ev['late'] else before)[a:a + length] += seg
    if cut_at is not None:
        c = int(round(cut_at * SR))
        fade(before, c - int(0.03 * SR), c + int(0.12 * SR), False)
        before[c + int(0.12 * SR):] = 0.0

    sfx = before + after
    mix = music + sfx
    tail = int(0.9 * SR)
    for buf in (mix, music, sfx):
        fade(buf, n - tail, n, False)

    # gentle ceiling: untouched below 0.75, eased into the top above it
    def ceiling(x, th=0.75):
        a = np.abs(x)
        y = x.copy()
        over = a > th
        y[over] = np.sign(x[over]) * (th + (1 - th) * np.tanh((a[over] - th) / (1 - th)))
        return y

    peak = float(np.max(np.abs(mix)))
    over = float(np.mean(np.abs(mix) > 0.75)) * 100
    final = ceiling(mix)

    def write(path, x):
        w = wave.open(path, 'wb')
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())
        w.close()

    write(out, final)
    if stems:
        write(out.replace('.wav', '.music.wav'), music)
        write(out.replace('.wav', '.sfx.wav'), ceiling(sfx))

    def db(x):
        r = float(np.sqrt(np.mean(x * x))) if len(x) else 0.0
        return -120.0 if r <= 0 else 20 * np.log10(r)

    print(f'{out}: {seconds:.2f}s, {len(events)} effects, beds {[(round(t, 2), nm) for t, nm, _ in beds]}')
    print(f'peak before ceiling {peak:.2f}, {over:.2f}% of samples above 0.75, music {db(music):.1f} dBFS, effects {db(sfx):.1f} dBFS, mix {db(final):.1f} dBFS')
    counts = {}
    for ev in events:
        counts[ev['name']] = counts.get(ev['name'], 0) + 1
    print('effects:', ', '.join(f'{k} x{v}' for k, v in sorted(counts.items(), key=lambda kv: -kv[1])))


main()
