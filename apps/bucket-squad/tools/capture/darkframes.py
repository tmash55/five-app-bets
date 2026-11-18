"""Lists the frames of a take that have black blocks in them.

usage: python3 darkframes.py <dir> [<dir> ...]

A block is a 32x32 square whose brightest pixel is under 4. A frame that is dark
on purpose (a fade to black) is listed too, so look at what comes out. With more
than one folder, it also says which take has each listed frame clean, so a
retake (VT_ONLY) can be pieced back into the first take.
"""

import glob
import os
import sys

import numpy as np
from PIL import Image

TILE = 32


def blocks(path: str) -> int:
    a = np.asarray(Image.open(path).convert('L'))
    h, w = a.shape[0] // TILE * TILE, a.shape[1] // TILE * TILE
    tiles = a[:h, :w].reshape(h // TILE, TILE, w // TILE, TILE).max(axis=(1, 3))
    return int((tiles < 4).sum())


def runs(numbers: list[int]) -> str:
    out: list[str] = []
    for n in numbers:
        if out and int(out[-1].split('-')[-1]) == n - 1:
            out[-1] = f"{out[-1].split('-')[0]}-{n}"
        else:
            out.append(str(n))
    return ','.join(out)


def main() -> None:
    dirs = sys.argv[1:]
    if not dirs:
        sys.exit(__doc__)
    first = sorted(glob.glob(os.path.join(dirs[0], 'f_*.jpg')))
    bad = [(int(os.path.basename(f)[2:7]), blocks(f)) for f in first]
    bad = [(n, b) for n, b in bad if b]
    print(f'{len(first)} frames, {len(bad)} with black blocks: {runs([n for n, _ in bad]) or "none"}')
    for n, b in bad:
        clean = [d for d in dirs[1:] if os.path.exists(p := os.path.join(d, f'f_{n:05d}.jpg')) and blocks(p) == 0]
        print(f'  f_{n:05d}.jpg  {b} blocks' + (f'  clean in {", ".join(clean)}' if clean else ''))


if __name__ == '__main__':
    main()
