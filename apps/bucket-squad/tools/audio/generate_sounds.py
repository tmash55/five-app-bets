"""Makes sound effects from written descriptions with the ElevenLabs sound effects service.

    python3 tools/audio/generate_sounds.py --cost                    # what the list would cost, nothing is sent
    python3 tools/audio/generate_sounds.py <folder>                  # make every sound in generated.json that is not in <folder> yet
    python3 tools/audio/generate_sounds.py <folder> rim cheer        # only these sounds
    python3 tools/audio/generate_sounds.py <folder> --group court    # only one group

`generated.json` (next to this file) holds one entry per sound: the description, the length
in seconds, how many variants to make, and whether it has to loop. The results land in
<folder> as `<name>_<n>.mp3`, with `generated-log.json` saying what each one cost.
`import_recordings.py` then cuts and levels them like any other recording.

The account key is read from the environment variable ELEVENLABS_API_KEY, or from the
file ~/.elevenlabs-key. It is never printed, logged or written anywhere. Files that
already exist are kept, so running this again costs nothing.

Needs only Python 3 and curl. `--cost` counts 40 credits for every second of sound, which is
a ceiling: in November 2026 the service really charged about 11 a second (220 for a 20 second
clip), and `generated-log.json` records what each file did cost.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = HERE / "generated.json"
URL = "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128"
CREDITS_PER_SECOND = 40
KEY_FILE = Path.home() / ".elevenlabs-key"


def read_key() -> str:
    key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not key and KEY_FILE.exists():
        key = KEY_FILE.read_text().strip()
    if not key:
        raise SystemExit(f"No key: set ELEVENLABS_API_KEY or save the key in {KEY_FILE}")
    if any(c.isspace() for c in key) or '"' in key:
        raise SystemExit("The key holds spaces or quotes, so it is probably not just the key. Save only the key itself.")
    return key


def wanted(spec: dict, names: set[str], group: str | None) -> list[tuple[str, dict]]:
    out = []
    for name, sound in spec["sounds"].items():
        if names and name not in names:
            continue
        if group and sound.get("group") != group:
            continue
        out.append((name, sound))
    return out


def cost_of(sound: dict) -> int:
    return round(sound["seconds"] * sound.get("variants", 1) * CREDITS_PER_SECOND)


def request(key: str, body: dict, out: Path) -> tuple[int, str, str]:
    """One sound. Returns (HTTP status, what it cost as the service reports it, error text)."""
    with tempfile.TemporaryDirectory() as tmp:
        body_file = Path(tmp) / "body.json"
        head_file = Path(tmp) / "head.txt"
        part = Path(tmp) / "sound.part"
        body_file.write_text(json.dumps(body))
        # the key travels in a config read from standard input, so it never shows up in the process list
        config = f'header = "xi-api-key: {key}"\nheader = "Content-Type: application/json"\n'
        done = subprocess.run(
            ["curl", "-sS", "-K", "-", "-X", "POST", URL, "--data-binary", f"@{body_file}", "-o", str(part), "-D", str(head_file), "-w", "%{http_code}", "--max-time", "180"],
            input=config,
            capture_output=True,
            text=True,
        )
        status = int(done.stdout.strip() or 0) if done.stdout.strip().isdigit() else 0
        cost = ""
        if head_file.exists():
            for line in head_file.read_text(errors="replace").splitlines():
                if line.lower().startswith("character-cost:"):
                    cost = line.split(":", 1)[1].strip()
        if status == 200 and part.exists() and part.stat().st_size > 500:
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(part.read_bytes())
            return status, cost, ""
        error = done.stderr.strip()
        if part.exists():
            error = (error + " " + part.read_bytes()[:400].decode("utf-8", "replace")).strip()
        return status, cost, error


def main() -> None:
    args = sys.argv[1:]
    spec = json.loads(SPEC.read_text())
    group = None
    if "--group" in args:
        i = args.index("--group")
        group = args[i + 1]
        del args[i : i + 2]
    limit = 16000
    if "--max-credits" in args:
        i = args.index("--max-credits")
        limit = int(args[i + 1])
        del args[i : i + 2]
    if args and args[0] == "--cost":
        total = 0
        for name, sound in wanted(spec, set(args[1:]), group):
            total += cost_of(sound)
            print(f"{name:12s} {sound.get('variants', 1)} x {sound['seconds']:4.1f}s  {cost_of(sound):5d} credits  [{sound.get('group', '')}]")
        print(f"total {total} credits")
        return
    if not args:
        raise SystemExit(__doc__)
    folder = Path(args[0])
    todo = []
    for name, sound in wanted(spec, set(args[1:]), group):
        for n in range(1, sound.get("variants", 1) + 1):
            out = folder / f"{name}_{n}.mp3"
            if not out.exists():
                todo.append((name, n, sound, out))
    planned = sum(round(sound["seconds"] * CREDITS_PER_SECOND) for _, _, sound, _ in todo)
    print(f"{len(todo)} sounds to make, about {planned} credits")
    if planned > limit:
        raise SystemExit(f"That is more than the limit of {limit} credits (--max-credits). Nothing was sent.")
    if not todo:
        return
    key = read_key()
    log_file = folder / "generated-log.json"
    log = json.loads(log_file.read_text()) if log_file.exists() else []
    spent = 0
    failed = 0
    for name, n, sound, out in todo:
        body = {
            "text": sound["text"],
            "duration_seconds": sound["seconds"],
            "prompt_influence": sound.get("influence", 0.5),
            "loop": bool(sound.get("loop", False)),
            "model_id": spec.get("model", "eleven_text_to_sound_v3"),
        }
        status, cost, error = 0, "", ""
        for attempt in range(4):
            status, cost, error = request(key, body, out)
            if status == 200:
                break
            if status in (401, 403):
                raise SystemExit(f"The service refused the key (HTTP {status}). Nothing more was sent. {error[:200]}")
            if status in (400, 422):
                break
            time.sleep(4 * (attempt + 1))
        if status != 200:
            failed += 1
            print(f"FAILED {name}_{n}: HTTP {status} {error[:300]}")
            continue
        credits = int(cost) if cost.isdigit() else round(sound["seconds"] * CREDITS_PER_SECOND)
        spent += credits
        log.append({"file": out.name, "text": sound["text"], "seconds": sound["seconds"], "loop": body["loop"], "model": body["model_id"], "credits": credits})
        log_file.write_text(json.dumps(log, indent=1))
        print(f"{out.name:18s} {out.stat().st_size / 1000:6.0f} KB  {credits} credits")
        time.sleep(0.5)
    print(f"done: {len(todo) - failed} made, {failed} failed, {spent} credits used")


if __name__ == "__main__":
    main()
