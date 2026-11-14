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
VOICES = {'tap': 2, 'coin': 3, 'cardFlip': 2, 'star': 3, 'swipe': 2, 'tick': 2}
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


def at_speed(x, rate):
    """The sound played `rate` times as fast, pitch and all, as the app's players do it."""
    if abs(rate - 1.0) < 1e-6 or len(x) < 2:
        return x
    n = max(2, int(round(len(x) / rate)))
    return np.interp(np.arange(n) * rate, np.arange(len(x)), x).astype(np.float32)


def load(name, take=0):
    stem = '%s_%d' % (name, take + 1) if takes(name) else name
    if stem not in _cache:
        w = wave.open(os.path.join(SOUNDS, stem + '.wav'))
        assert w.getnchannels() == 1 and w.getsampwidth() == 2, stem
        x = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(np.float32) / 32768.0
        # the court loops are stored at a lower rate than everything else
        _cache[stem] = at_speed(x, w.getframerate() / SR)
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
    before = np.zeros(n, dtype=np.float32)  # effects up to the cut
    after = np.zeros(n, dtype=np.float32)   # effects from the cut on

    def lay(kind, stem_of):
        """One looping bed at a time, switched (or its level changed) the moment the app does it."""
        out_buf = np.zeros(n, dtype=np.float32)
        beds = []  # (time, name or None, level)
        current = None
        for e in log[:i_start]:
            if e['kind'] == kind:
                current = (e['name'], e['volume'])
        if current and current[0]:
            beds.append((0.0, current[0], current[1]))
        last = current
        for i, e in enumerate(log):
            if i <= i_start or i >= i_end or e['kind'] != kind:
                continue
            t = when(i, e['t'])
            if t is None:
                t = cut_at
            if last is not None and (e['name'], e['volume']) == last:
                continue
            # the app keeps the same player when only the level changes: the loop carries on where it was
            same = last is not None and e['name'] == last[0]
            last = (e['name'], e['volume'])
            beds.append((t, e['name'], e['volume'], same))
        pos = 0
        for k, bed in enumerate(beds):
            t, name, level = bed[0], bed[1], bed[2]
            carry = len(bed) > 3 and bed[3]
            if not name:
                continue
            t_end = beds[k + 1][0] if k + 1 < len(beds) else seconds
            a, b = int(round(t * SR)), min(n, int(round(t_end * SR)))
            if b <= a:
                continue
            loop = load(stem_of(name))
            if not carry:
                pos = 0
            reps = int(np.ceil((pos + b - a) / len(loop))) + 1
            seg = np.tile(loop, reps)[pos: pos + b - a].copy() * level
            pos = (pos + b - a) % len(loop)
            fade(seg, 0, int((0.35 if t == 0 else 0.02) * SR), True)
            fade(seg, len(seg) - int(0.05 * SR), len(seg), False)
            out_buf[a:b] += seg
        return out_buf, beds

    music, beds = lay('music', lambda name: MUSIC[name])
    # the court's own sound: birds, waves, wind
    court, court_beds = lay('amb', lambda name: 'amb' + name[0].upper() + name[1:])

    # ---- effects, with the app's voice pools
    events = []
    for i, e in enumerate(log):
        if i <= i_start or i >= i_end or e['kind'] != 'sfx':
            continue
        t = when(i, e['t'])
        if t is None or t >= seconds:
            continue
        events.append({'t': t, 'name': e['name'], 'take': e.get('take', 0), 'vol': e['volume'], 'rate': e.get('rate', 1.0), 'late': i_cut1 is not None and i > i_cut1})
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
        s = at_speed(load(ev['name'], ev['take']), ev['rate'])
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
    mix = music + court + sfx
    tail = int(0.9 * SR)
    for buf in (mix, music, court, sfx):
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
        write(out.replace('.wav', '.court.wav'), court)
        write(out.replace('.wav', '.sfx.wav'), ceiling(sfx))

    def db(x):
        r = float(np.sqrt(np.mean(x * x))) if len(x) else 0.0
        return -120.0 if r <= 0 else 20 * np.log10(r)

    print(f'{out}: {seconds:.2f}s, {len(events)} effects, music {[(round(b[0], 2), b[1]) for b in beds]}, court sound {[(round(b[0], 2), b[1], b[2]) for b in court_beds]}')
    print(f'peak before ceiling {peak:.2f}, {over:.2f}% of samples above 0.75, music {db(music):.1f} dBFS, court sound {db(court):.1f} dBFS, effects {db(sfx):.1f} dBFS, mix {db(final):.1f} dBFS')
    counts = {}
    for ev in events:
        counts[ev['name']] = counts.get(ev['name'], 0) + 1
    print('effects:', ', '.join(f'{k} x{v}' for k, v in sorted(counts.items(), key=lambda kv: -kv[1])))


main()
