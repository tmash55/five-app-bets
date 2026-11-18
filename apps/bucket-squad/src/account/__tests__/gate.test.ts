import { seededRng } from '@/meta/rng';

import { gateQuestion } from '../gate';

describe('the grown-up check', () => {
  it('asks a times-table question from 6x6 to 9x9 with one right answer among three', () => {
    const rng = seededRng(42);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const q = gateQuestion(rng);
      expect(q.a).toBeGreaterThanOrEqual(6);
      expect(q.a).toBeLessThanOrEqual(9);
      expect(q.b).toBeGreaterThanOrEqual(6);
      expect(q.b).toBeLessThanOrEqual(9);
      expect(q.answer).toBe(q.a * q.b);
      expect(q.choices).toHaveLength(3);
      expect(new Set(q.choices).size).toBe(3);
      expect(q.choices.filter((n) => n === q.answer)).toHaveLength(1);
      for (const n of q.choices) expect(n).toBeGreaterThan(0);
      seen.add(q.choices.indexOf(q.answer));
    }
    // the right answer turns up in every place
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });

  it('makes the right answer the smallest, middle and largest about as often', () => {
    const rng = seededRng(11);
    const ranks = [0, 0, 0];
    for (let i = 0; i < 3000; i++) {
      const q = gateQuestion(rng);
      ranks[[...q.choices].sort((x, y) => x - y).indexOf(q.answer)]++;
    }
    for (const n of ranks) {
      expect(n).toBeGreaterThan(800);
      expect(n).toBeLessThan(1200);
    }
  });

  it('gives near misses, so the wrong answers are not easy to rule out', () => {
    const rng = seededRng(7);
    for (let i = 0; i < 200; i++) {
      const q = gateQuestion(rng);
      for (const n of q.choices) expect(Math.abs(n - q.answer)).toBeLessThanOrEqual(q.a + q.b);
    }
  });

  it('is the same question for the same random numbers', () => {
    expect(gateQuestion(seededRng(3))).toEqual(gateQuestion(seededRng(3)));
  });
});
