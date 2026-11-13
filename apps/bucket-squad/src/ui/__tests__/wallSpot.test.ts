import { wallSpot, type SignShape, type WallRoom } from '../arcade/wallSpot';

const SIGN: SignShape = { ratio: 1, left: 0.1, right: 0.9, bottom: 0.6 };
const ROOM: WallRoom = { from: 0, to: 300, tops: [20, 10], widest: 90, least: 50, step: 10, clear: 4 };

describe('wallSpot', () => {
  it('hangs the sign at its full size at the left when the wall above the heads is free', () => {
    expect(wallSpot([{ x: 150, top: 200, half: 40 }], SIGN, ROOM)).toEqual({ left: 0, top: 20, width: 90 });
  });

  it('moves the sign along to a gap between heads before making it smaller', () => {
    const out = wallSpot(
      [
        { x: 40, top: 40, half: 40 },
        { x: 260, top: 40, half: 40 },
      ],
      SIGN,
      ROOM,
    );
    expect(out).not.toBeNull();
    expect(out!.width).toBe(90);
    // the board (the middle 80% of the sign) lies between the two heads
    expect(out!.left + out!.width * 0.1).toBeGreaterThanOrEqual(80);
    expect(out!.left + out!.width * 0.9).toBeLessThanOrEqual(220);
  });

  it('makes the sign smaller and hangs it higher when the heads leave little wall above them', () => {
    const out = wallSpot([{ x: 150, top: 50, half: 200 }], SIGN, ROOM);
    // the board's bottom is at top + 0.6 * width and must stay 4 above the head
    expect(out).toEqual({ left: 0, top: 10, width: 60 });
  });

  it('finds no place when even the smallest sign would cover a head', () => {
    expect(wallSpot([{ x: 150, top: 30, half: 200 }], SIGN, ROOM)).toBeNull();
  });
});
