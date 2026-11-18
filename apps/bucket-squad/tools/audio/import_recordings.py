"""Cuts the game's recorded sounds out of source recordings.

    python tools/audio/import_recordings.py                          # cut every sound again from sources/
    python tools/audio/import_recordings.py dribble rim              # only these sounds
    python tools/audio/import_recordings.py <folder> [<folder> ...]  # also look for sources in these folders
    python tools/audio/import_recordings.py --measure                # loudness of every sound in assets/sounds

`recordings.json` (next to this file) says which recording each take comes from,
where the take starts and how long it is, and how it is cleaned up. There are
two kinds of source:

- Creative Commons 0 recordings from freesound.org, named by their number
  (`<number>.mp3` is the recording's preview; the list is under "sources" in
  recordings.json).
- Sounds made from a written description (see generate_sounds.py). Those cannot
  be made twice the same.

Every source in use is kept in `sources/` next to this file, so the takes can
be cut again anywhere. To try a new recording, put it in any folder, name it in
recordings.json and pass the folder: the sources in use are then copied into
`sources/`, and the ones no longer used are removed from it.

The takes themselves (`assets/sounds/<name>_<n>.wav`) are committed, so the app
and `make_sounds.py` never need the sources. A sound with takes here replaces
the synthesized sound of the same name. The background loops of the courts
(`assets/sounds/amb<Court>.wav`) are made here too, under "loops".

Needs numpy and ffmpeg.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import make_sounds as synth  # noqa: E402

SR = synth.SR
OUT = synth.OUT
SPEC = HERE / "recordings.json"
CREDITS = HERE / "CREDITS.md"
#: every source in use lives here, so the takes can always be cut again
KEPT = HERE / "sources"
#: what a phone speaker can play; loudness is measured above this
PHONE_HZ = 300.0
#: background loops are quiet and soft: half the sample rate halves their size
LOOP_RATE = 22050

_decoded: dict[str, np.ndarray] = {}


def find(raws: list[Path], src: str) -> Path:
    for folder in raws:
        for ext in (".mp3", ".wav", ".flac", ".m4a", ".ogg"):
            path = folder / f"{src}{ext}"
            if path.exists():
                return path
    raise SystemExit(f"The recording '{src}' is in none of: {', '.join(str(r) for r in raws)}")


def decode(path: Path) -> np.ndarray:
    key = str(path)
    if key not in _decoded:
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", key, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
        _decoded[key] = np.frombuffer(raw, dtype="<f4").astype(np.float64)
    return _decoded[key]


def loudness(x: np.ndarray, window: float = 0.03, above: float = PHONE_HZ) -> float:
    """Loudest stretch of the sound as a phone plays it, in dBFS (RMS over `window` seconds, lows removed)."""
    y = synth.band(x, above, 0, 2) if above > 0 else x
    w = max(1, min(len(y), int(window * SR)))
    c = np.cumsum(np.concatenate([[0.0], y * y]))
    rms = np.sqrt(np.max(c[w:] - c[:-w]) / w)
    return float(20 * np.log10(max(rms, 1e-9)))


def steady(x: np.ndarray, above: float = PHONE_HZ) -> float:
    """Level of a sound that goes on and on (a background loop), in dBFS: RMS of all of it as a phone plays it."""
    y = synth.band(x, above, 0, 2) if above > 0 else x
    return float(20 * np.log10(max(float(np.sqrt(np.mean(y * y))), 1e-9)))


def resample(x: np.ndarray, rate: float) -> np.ndarray:
    """Play `x` faster (rate > 1, higher and shorter) or slower."""
    if abs(rate - 1) < 1e-6:
        return x
    n = int(len(x) / rate)
    return np.interp(np.arange(n) * rate, np.arange(len(x)), x)


def tone(x: np.ndarray, shelf: list | None, bells: list) -> np.ndarray:
    """Zero-phase tone shaping: `shelf` = [corner Hz, dB] turns everything under the corner up or down,
    each bell = [centre Hz, dB, width in octaves] lifts or dips a region."""
    if not shelf and not bells:
        return x
    spec = np.fft.rfft(x)
    f = np.maximum(np.fft.rfftfreq(len(x), 1 / SR), 1e-6)
    g = np.ones_like(f)
    if shelf:
        corner, gain_db = shelf
        g *= 1 + (10 ** (gain_db / 20) - 1) / (1 + (f / corner) ** 4)
    for centre, gain_db, octaves in bells:
        g *= 10 ** (gain_db / 20 * np.exp(-0.5 * (np.log2(f / centre) / (octaves / 2)) ** 2))
    return np.fft.irfft(spec * g, len(x))


def warm(x: np.ndarray, split: float, drive: float, gain_db: float = 0.0) -> np.ndarray:
    """Round off the low thud only (under `split` Hz) and leave the rest untouched.

    A hit's peak is nearly all thud, which a phone cannot play. Rounding the thud off frees the
    headroom for the part a phone does play, and the overtones it adds let a small speaker hint at it.
    """
    low = synth.band(x, 0, split, 2)
    rest = x - low
    m = float(np.max(np.abs(low))) or 1.0
    low = np.tanh(drive * low / m) * (m / np.tanh(drive))
    return rest + low * 10 ** (gain_db / 20)


def ceiling(x: np.ndarray, knee: float = 0.7, top: float = 0.97) -> np.ndarray:
    """Soft limit: untouched under `knee`, bent smoothly so nothing passes `top`."""
    a = np.abs(x)
    over = a > knee
    y = x.copy()
    y[over] = np.sign(x[over]) * (knee + (top - knee) * np.tanh((a[over] - knee) / (top - knee)))
    return y


def cut_piece(raws: list[Path], piece: dict, sound: dict) -> np.ndarray:
    """One stretch of one recording, tuned and faded but not yet levelled."""

    def opt(key: str, default):
        return piece.get(key, sound.get(key, default))

    src = decode(find(raws, str(piece["src"])))
    lead = opt("lead", 0.002)
    a = max(0, int((piece["at"] - lead) * SR))
    b = min(len(src), a + int((opt("len", 0.2) + lead) * SR))
    x = src[a:b].copy()
    x = resample(x, opt("pitch", 1.0))
    x = synth.band(x, opt("hp", 60.0), opt("lp", 0.0), 2)
    x = tone(x, opt("shelf", None), opt("bells", []))
    # ease in and out, so a cut never clicks
    n_in = max(1, int(opt("fade_in", 0.0015) * SR))
    n_out = max(1, min(len(x) - n_in, int(opt("tail", 0.04) * SR)))
    x[:n_in] *= np.linspace(0, 1, n_in)
    x[-n_out:] *= np.linspace(1, 0, n_out) ** opt("tail_curve", 1.5)
    return x


def cut_take(raws: list[Path], take: dict, sound: dict) -> np.ndarray:
    """A finished take: one piece, or several pieces laid over each other (`mix`)."""

    def opt(key: str, default):
        return take.get(key, sound.get(key, default))

    if "mix" in take:
        # each layer is levelled on its own first, so `gain` (dB) says how loud it is next to the others
        layers = []
        for layer in take["mix"]:
            y = cut_piece(raws, layer, sound)
            y = y * 10 ** ((layer.get("gain", 0.0) - loudness(y)) / 20)
            layers.append((layer.get("delay", 0.0), y))
        total = max(delay + len(y) / SR for delay, y in layers)
        x = synth.mix(total, *layers)
    else:
        x = cut_piece(raws, take, sound)
    w = opt("warm", None)
    if w:
        x = warm(x, *w)
    drive = opt("punch", 0.0)
    if drive > 0:
        x = synth.punch(x, drive)
    # every take of a sound plays equally loud
    gain = 10 ** ((sound["level"] + take.get("trim", 0.0) - loudness(x, opt("window", 0.03))) / 20)
    return ceiling(x * gain)


def to_rate(x: np.ndarray, rate: int) -> np.ndarray:
    """A whole loop at another sample rate. Done in the frequency domain, which treats the
    stretch as going round and round: exactly what a loop is, so the join stays seamless."""
    n = int(round(len(x) * rate / SR))
    spec = np.fft.rfft(x)
    keep = n // 2 + 1
    out = spec[:keep].copy()
    # ease the very top out so the cut-off does not ring
    edge = max(1, keep // 12)
    out[-edge:] *= np.cos(np.linspace(0, np.pi / 2, edge)) ** 2
    return np.fft.irfft(out, n) * (n / len(x))


def cut_loop(raws: list[Path], loop: dict) -> np.ndarray:
    """A background loop: a stretch of a recording whose end melts into its own beginning."""
    src = decode(find(raws, str(loop["src"])))
    seam = loop.get("seam", 2.0)
    a = max(0, int(loop.get("at", 0.0) * SR))
    n = int(loop["len"] * SR)
    k = int(seam * SR)
    if a + n + k > len(src):
        raise SystemExit(f"{loop['src']}: {loop['len']} s from {loop.get('at', 0.0)} s plus a {seam} s join is longer than the recording ({len(src) / SR:.1f} s)")
    x = synth.band(src[a : a + n + k].copy(), loop.get("hp", 120.0), loop.get("lp", 0.0), 2)
    x = tone(x, loop.get("shelf", None), loop.get("bells", []))
    body = x[:n].copy()
    # what follows the stretch fades out under the stretch's own start fading in
    t = np.linspace(0, 1, k)
    body[:k] = body[:k] * np.sin(t * np.pi / 2) + x[n : n + k] * np.cos(t * np.pi / 2)
    body *= 10 ** ((loop["level"] - steady(body)) / 20)
    return to_rate(ceiling(body, 0.5, 0.9), loop.get("rate", LOOP_RATE))


def write_wav(stem: str, x: np.ndarray, rate: int = SR) -> None:
    pcm = np.clip(x * 32767, -32768, 32767).astype("<i2")
    OUT.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT / f"{stem}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())


def read_wav(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path)) as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float64) / 32768.0, w.getframerate()


def measure() -> None:
    for path in sorted(OUT.glob("*.wav")):
        if path.stem.startswith("music"):
            continue
        x, rate = read_wav(path)
        if rate != SR:
            print(f"{path.stem:16s} {len(x) / rate:5.2f}s  peak {np.max(np.abs(x)):.2f}  a loop at {rate} Hz, {path.stat().st_size / 1000:.0f} KB")
            continue
        print(f"{path.stem:16s} {len(x) / SR:5.2f}s  peak {np.max(np.abs(x)):.2f}  phone {loudness(x):6.1f} dB  full {loudness(x, above=0):6.1f} dB")


def sources_of(take: dict) -> set[str]:
    return {str(piece["src"]) for piece in take.get("mix", [take])}


def used_by(spec: dict) -> dict[str, list[str]]:
    """Every source in use, with the sounds it is used for."""
    out: dict[str, set[str]] = {}
    for name, sound in spec["sounds"].items():
        for take in sound["takes"]:
            for sid in sources_of(take):
                out.setdefault(sid, set()).add(name)
    for name, loop in spec.get("loops", {}).items():
        out.setdefault(str(loop["src"]), set()).add(name)
    return {sid: sorted(names) for sid, names in out.items()}


def keep_sources(raws: list[Path], spec: dict) -> None:
    """Keeps `sources/` in step with recordings.json: every source in use is there, and nothing else."""
    KEPT.mkdir(exist_ok=True)
    used = set(used_by(spec))
    for src in sorted(used):
        path = find(raws, src)
        if path.parent.resolve() != KEPT.resolve():
            shutil.copyfile(path, KEPT / path.name)
            print(f"kept {path.name} in {KEPT.name}/")
    for path in sorted(KEPT.iterdir()):
        if path.is_file() and path.stem not in used:
            path.unlink()
            print(f"removed {path.name} from {KEPT.name}/: no longer used")


def write_credits(spec: dict) -> None:
    used = used_by(spec)
    recorded = sorted((sid for sid in used if sid in spec["sources"]), key=int)
    made = sorted(sid for sid in used if sid not in spec["sources"])
    lines = [
        "# Sound credits",
        "",
        "## Recordings",
        "",
        "Cut from Creative Commons 0 (public domain) recordings shared on freesound.org.",
        "No attribution is required; thank you to the people who recorded them.",
        "",
        "| Recording | By | Used for |",
        "| --- | --- | --- |",
    ]
    for sid in recorded:
        src = spec["sources"][sid]
        lines.append(f"| [{src['title']}]({src['url']}) | {src['author']} | {', '.join(used[sid])} |")
    if made:
        described = spec.get("generated", {})
        lines += [
            "",
            "## Made from a description",
            "",
            "Made with the ElevenLabs sound effects service from the written descriptions below (see `generate_sounds.py`).",
            "The files are kept in `sources/`. They were made on a paid plan; check that plan's terms before shipping",
            "them in a store build.",
            "",
            "| File | Description | Used for |",
            "| --- | --- | --- |",
        ]
        for sid in made:
            lines.append(f"| {sid} | {described.get(sid, '')} | {', '.join(used[sid])} |")
    lines += ["", "Everything else (menus, cards, coins, fanfares and the music) is synthesized by `make_sounds.py`.", ""]
    CREDITS.write_text("\n".join(lines))


def main() -> None:
    args = sys.argv[1:]
    if args and args[0] == "--measure":
        measure()
        return
    raws = [Path(a) for a in args if Path(a).is_dir()]
    only = {a for a in args if not Path(a).is_dir()}
    raws.append(KEPT)
    spec = json.loads(SPEC.read_text())
    unknown = only - set(spec["sounds"]) - set(spec.get("loops", {}))
    if unknown:
        raise SystemExit(f"Not in recordings.json: {', '.join(sorted(unknown))}")
    for name, sound in spec["sounds"].items():
        if only and name not in only:
            continue
        for old in OUT.glob(f"{name}_[0-9]*.wav"):
            old.unlink()
        for i, take in enumerate(sound["takes"], 1):
            x = cut_take(raws, take, sound)
            write_wav(f"{name}_{i}", x)
            where = " + ".join(f"{piece['src']} at {piece['at']:.3f}" for piece in take.get("mix", [take]))
            print(f"{name}_{i:<3} {len(x) / SR:5.2f}s  peak {np.max(np.abs(x)):.2f}  phone {loudness(x):6.1f} dB  from {where}")
        (OUT / f"{name}.wav").unlink(missing_ok=True)
    for name, loop in spec.get("loops", {}).items():
        if only and name not in only:
            continue
        rate = loop.get("rate", LOOP_RATE)
        x = cut_loop(raws, loop)
        write_wav(name, x, rate)
        print(f"{name:12s} {len(x) / rate:5.2f}s  peak {np.max(np.abs(x)):.2f}  a loop at {rate} Hz, {(OUT / f'{name}.wav').stat().st_size / 1000:.0f} KB  from {loop['src']}")
    keep_sources(raws, spec)
    write_credits(spec)
    synth.write_file_list()


if __name__ == "__main__":
    main()
