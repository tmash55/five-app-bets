import { elapsed, pauseClock, resumeClock, startClock } from '../core/clock';
import { defaultDifficulty, initialDifficulty, recordAnswer } from '../core/difficulty';
import { createRng } from '../core/rng';
import { levelMultiplier, scoreAnswer, summarizeRound, type AnswerRecord } from '../core/scoring';

describe('rng', () => {
  it('repeats the same numbers from the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a.next(), a.int(1, 6), a.pick(['x', 'y', 'z'])]).toEqual([b.next(), b.int(1, 6), b.pick(['x', 'y', 'z'])]);
  });

  it('keeps int inside its bounds', () => {
    const rng = createRng(7);
    for (let i = 0; i < 500; i += 1) {
      const n = rng.int(3, 5);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
    }
  });

  it('continues from its seed', () => {
    const first = createRng(9);
    first.next();
    const resumed = createRng(first.seed);
    expect(resumed.next()).toBe(first.next());
  });

  it('shuffles without losing items', () => {
    expect(createRng(1).shuffle([1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4]);
  });
});

describe('clock', () => {
  it('does not count paused time', () => {
    let clock = startClock(1000);
    clock = pauseClock(clock, 3000); // 2s counted
    clock = resumeClock(clock, 10_000); // 7s paused
    expect(elapsed(clock, 11_500)).toBe(3500);
  });

  it('ignores a second pause or resume', () => {
    const paused = pauseClock(startClock(0), 100);
    expect(pauseClock(paused, 500)).toBe(paused);
    const running = resumeClock(paused, 200);
    expect(resumeClock(running, 900)).toBe(running);
  });
});

describe('scoring', () => {
  it('gives accuracy plus a speed bonus that shrinks to zero at the target time', () => {
    expect(scoreAnswer({ correct: true, responseMs: 0, targetMs: 1000, level: 1 })).toEqual({
      accuracyPoints: 100,
      speedPoints: 50,
      points: 150,
    });
    expect(scoreAnswer({ correct: true, responseMs: 500, targetMs: 1000, level: 1 }).speedPoints).toBe(25);
    expect(scoreAnswer({ correct: true, responseMs: 2000, targetMs: 1000, level: 1 }).speedPoints).toBe(0);
  });

  it('pays more at higher levels', () => {
    expect(levelMultiplier(3)).toBe(1.5);
    expect(scoreAnswer({ correct: true, responseMs: 1000, targetMs: 1000, level: 3 }).points).toBe(150);
  });

  it('gives nothing for a wrong answer unless a penalty is set', () => {
    expect(scoreAnswer({ correct: false, responseMs: 10, targetMs: 1000, level: 2 }).points).toBe(0);
    const config = { correctPoints: 100, maxSpeedBonus: 50, levelMultiplierStep: 0.25, wrongPenalty: 30 };
    expect(scoreAnswer({ correct: false, responseMs: 10, targetMs: 1000, level: 2 }, config).points).toBe(-30);
  });

  it('summarizes a round without letting the score go below zero', () => {
    const answer = (correct: boolean, points: number, level = 1): AnswerRecord => ({
      correct,
      timedOut: false,
      responseMs: 1000,
      level,
      score: { accuracyPoints: Math.max(0, points), speedPoints: 0, points },
    });
    const summary = summarizeRound([answer(false, -50), answer(true, 100), answer(true, 100, 2), answer(false, 0, 2)], {
      start: 1,
      final: 2,
    });
    expect(summary).toMatchObject({
      score: 200,
      answered: 4,
      correct: 2,
      accuracy: 0.5,
      averageCorrectMs: 1000,
      highestLevel: 2,
      longestStreak: 2,
    });
  });
});

describe('adaptive difficulty', () => {
  const fast = { correct: true, responseMs: 500, targetMs: 1000 };
  const slow = { correct: true, responseMs: 2000, targetMs: 1000 };
  const miss = { correct: false, responseMs: 500, targetMs: 1000 };

  function play(answers: (typeof fast)[], start = 1, config = defaultDifficulty) {
    let state = initialDifficulty(start, 5);
    const changes: (string | null)[] = [];
    for (const a of answers) {
      const result = recordAnswer(state, a, config);
      state = result.state;
      changes.push(result.change);
    }
    return { state, changes };
  }

  it('moves up after a window of fast, accurate answers', () => {
    const { state, changes } = play([fast, fast, fast, fast]);
    expect(state.level).toBe(2);
    expect(changes).toEqual([null, null, null, 'up']);
  });

  it('stays put when accurate but too slow', () => {
    expect(play([slow, slow, slow, slow]).state.level).toBe(1);
  });

  it('drops a level after two misses in a row', () => {
    const { state, changes } = play([fast, miss, miss], 3);
    expect(state.level).toBe(2);
    expect(changes[2]).toBe('down');
  });

  it('drops a level when a window is mostly wrong', () => {
    const noStreakDrop = { ...defaultDifficulty, missesToDrop: 99 };
    expect(play([miss, fast, miss, miss], 3, noStreakDrop).state.level).toBe(2);
    // Exactly half right is not below the 50% bar, so the level holds.
    expect(play([miss, fast, miss, fast], 3, noStreakDrop).state.level).toBe(3);
  });

  it('never leaves the level range', () => {
    expect(play([miss, miss, miss, miss]).state.level).toBe(1);
    expect(play(Array(40).fill(fast)).state.level).toBe(5);
  });
});
