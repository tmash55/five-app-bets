import { columnsThatFit, rowsOf } from '@/ui/rows';

describe('rows of a grid', () => {
  it('fills each row and leaves the rest for the last one', () => {
    expect(rowsOf([1, 2, 3, 4, 5, 6], 3)).toEqual([[1, 2, 3], [4, 5, 6]]);
    expect(rowsOf([1, 2, 3, 4, 5], 3)).toEqual([[1, 2, 3], [4, 5]]);
    expect(rowsOf([1, 2], 3)).toEqual([[1, 2]]);
    expect(rowsOf([], 3)).toEqual([]);
  });

  it('never makes an empty or endless row', () => {
    expect(rowsOf([1, 2, 3], 0)).toEqual([[1], [2], [3]]);
    expect(rowsOf([1, 2, 3], 2.9)).toEqual([[1, 2], [3]]);
  });
});

describe('how many fit side by side', () => {
  it('counts the gaps between, not around', () => {
    expect(columnsThatFit(320, 100, 10)).toBe(3);
    expect(columnsThatFit(319, 100, 10)).toBe(2);
    expect(columnsThatFit(100, 100, 10)).toBe(1);
  });

  it('is not thrown by a rounding error in sizes that fit exactly', () => {
    // three cards of 110 and two gaps of 7.333... on a 3x screen
    const gap = 22 / 3;
    expect(columnsThatFit(110 * 3 + gap * 2 - 1e-4, 110, gap)).toBe(3);
  });

  it('always leaves room for one', () => {
    expect(columnsThatFit(10, 100, 10)).toBe(1);
    expect(columnsThatFit(100, 0, 10)).toBe(1);
  });
});
