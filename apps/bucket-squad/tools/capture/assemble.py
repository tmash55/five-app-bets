"""Turn a captured walkthrough (frames plus the sound log) into an MP4.

usage: assemble.py <dir> <fps> <out.mp4> [--crf N] [--dissolve FRAMES]

Softens the jump where part of the match was skipped with a short dissolve,
mixes the soundtrack from the game's own sounds (mix.py), sets its loudness
and encodes the lot with ffmpeg.
"""
import glob, json, os, re, shutil, subprocess, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))


def arg(flag, default):
    return type(default)(sys.argv[sys.argv.index(flag) + 1]) if flag in sys.argv else default


def main():
    d, fps, out = sys.argv[1], float(sys.argv[2]), sys.argv[3]
    crf = arg('--crf', 19)
    span = arg('--dissolve', 9)
    frames = sorted(glob.glob(os.path.join(d, 'f_*.jpg')))
    seconds = len(frames) / fps
    log = json.load(open(os.path.join(d, 'sound.json')))
    kinds = [e['kind'] for e in log]
    start = log[kinds.index('start')]['t']
    end = log[kinds.index('end')]['t']
    gap = 0.0
    if 'cut0' in kinds:
        cut = (log[kinds.index('cut0')]['t'] - start) / 1000.0
        gap = log[kinds.index('cut1')]['t'] - log[kinds.index('cut0')]['t']
        c = int(round(cut * fps))
        keep = os.path.join(d, 'orig')
        os.makedirs(keep, exist_ok=True)
        last = Image.open(frames[c - 1]).convert('RGB')
        for k in range(span):
            f = frames[c + k]
            saved = os.path.join(keep, os.path.basename(f))
            if not os.path.exists(saved):
                shutil.copy2(f, saved)
            new = Image.open(saved).convert('RGB')
            a = (k + 1) / (span + 1)
            Image.blend(last, new, a).save(f, quality=93, subsampling=0)
        print(f'cut at {cut:.2f}s (frame {c}), {span}-frame dissolve')
    logged = (end - start - gap) / 1000.0
    print(f'{len(frames)} frames at {fps:g} fps = {seconds:.2f}s (sound log covers {logged:.2f}s)')
    assert abs(logged - seconds) < 0.11, 'frames and sound log disagree about the length'

    wav = os.path.join(d, 'mix.wav')
    subprocess.run([sys.executable, os.path.join(HERE, 'mix.py'), os.path.join(d, 'sound.json'), wav, f'{seconds:.4f}'], check=True)
    # bring the mix to a normal listening level for a phone or laptop
    probe = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', wav, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    loud = float(re.findall(r'I:\s+(-?[0-9.]+) LUFS', probe)[-1])
    gain = max(-6.0, min(8.0, -16.0 - loud))
    print(f'integrated loudness {loud:.1f} LUFS, gain {gain:+.1f} dB')
    cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-framerate', f'{fps:g}', '-i', os.path.join(d, 'f_%05d.jpg'), '-i', wav,
           '-af', f'volume={gain:.2f}dB,alimiter=limit=0.84:attack=3:release=60:level=disabled',
           '-c:v', 'libx264', '-preset', 'slow', '-crf', str(crf), '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
           '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', '-shortest', out]
    subprocess.run(cmd, check=True)
    print(out, f'{os.path.getsize(out) / 1e6:.1f} MB')


main()
