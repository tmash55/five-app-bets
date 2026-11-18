import { fitText, firstThatFits } from '../arcade/fitText';
import { widthOf } from '../arcade/measure';

describe('fitText', () => {
  it('keeps a line that fits at its own size', () => {
    expect(fitText('Playground Pack', 'bold', 14, 400)).toEqual({ text: 'Playground Pack', size: 14, lines: 1 });
  });

  it('shrinks a line a little when that is enough', () => {
    const room = widthOf('Throwbacks Pack', 'bold', 14) * 0.9;
    const out = fitText('Throwbacks Pack', 'bold', 14, room);
    expect(out.lines).toBe(1);
    expect(out.size).toBeLessThan(14);
    expect(widthOf(out.text, 'bold', out.size)).toBeLessThanOrEqual(room);
  });

  it('breaks a line that would have to shrink past the floor over two lines, never cutting it', () => {
    const room = widthOf('Neighborhood', 'bold', 14) * 1.1;
    const out = fitText('Neighborhood Champions Pack', 'bold', 14, room);
    expect(out.lines).toBe(2);
    expect(out.text.replace('\n', ' ')).toBe('Neighborhood Champions Pack');
    for (const line of out.text.split('\n')) expect(widthOf(line, 'bold', out.size)).toBeLessThanOrEqual(room);
  });
});

describe('firstThatFits', () => {
  it('takes the first wording with room to spare, or the last one', () => {
    const room = widthOf('3 to open', 'body', 12) * 1.2;
    expect(firstThatFits(['Free pack + 2 more', '3 to open'], 'body', 12, room)).toBe('3 to open');
    expect(firstThatFits(['Free pack + 2 more', 'Free + 2 more'], 'body', 12, 1)).toBe('Free + 2 more');
  });
});
