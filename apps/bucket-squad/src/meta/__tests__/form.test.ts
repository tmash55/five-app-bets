/** The hidden form (meta/form): how the person has been doing nudges the next games a little, inside a band. */

import { BEGINNER } from '@/testing/playerModel';
import { playGames } from '@/testing/difficultyLab';
import { summary } from '@/testing/summary';
import { finishMatch, newSave, repairSave, startCareer } from '@/state/logic';
import { shotLevelFor } from '@/game/sim/core';
import { FORM, easeFor, formAfter, gameForm, repairForm } from '../form';
import { buildMatch, type SidePlayer } from '../match';
import { seededRng } from '../rng';
import { duoSetup, ladderSetup, quickSetup, tourSetup, type Prefs } from '../setups';
import { TIERS } from '../ladder';

const STARTERS: SidePlayer[] = [
  { id: 'wren-kowalski', level: 1 },
  { id: 'pippa-quinn', level: 1 },
  { id: 'gus-moretti', level: 1 },
];
const prefs = (over: Partial<Prefs> = {}): Prefs => ({ squad: STARTERS, quarterSeconds: 60, easyShots: true, homeTeam: 'comets', ...over });
const DAY = '2026-03-09';

describe('form', () => {
  it('counts a close game for little and a big one in full', () => {
    expect(gameForm(1)).toBeCloseTo(1 / FORM.margin, 10);
    expect(gameForm(-1)).toBeCloseTo(-1 / FORM.margin, 10);
    expect(gameForm(40)).toBe(1);
    expect(gameForm(-40)).toBe(-1);
  });

  it('goes down with a few losses in a row and up with a run of easy wins, never past -1 or 1', () => {
    let f = 0;
    for (let i = 0; i < 3; i++) f = formAfter(f, -10);
    expect(f).toBeLessThan(-0.4);
    let g = 0;
    for (let i = 0; i < 3; i++) g = formAfter(g, 15);
    expect(g).toBeGreaterThan(0.5);
    let h = 0;
    for (let i = 0; i < 50; i++) h = formAfter(h, 30);
    expect(h).toBeLessThanOrEqual(1);
    // a close game after a good run brings it back toward even, without turning it round
    expect(formAfter(g, -1)).toBeLessThan(g);
    expect(formAfter(g, -1)).toBeGreaterThan(0);
    expect(formAfter(Number.NaN, 0)).toBe(0);
  });

  it('turns into a nudge inside the band, and keeps the computer’s skill between 0 and 1', () => {
    expect(easeFor(0, 0.5)).toBe(0);
    expect(easeFor(undefined, 0.5)).toBe(0);
    expect(easeFor(-1, 0.5)).toBeCloseTo(-FORM.easeDown, 10);
    expect(easeFor(1, 0.5)).toBeCloseTo(FORM.firmUp, 10);
    expect(easeFor(-5, 0.5)).toBeCloseTo(-FORM.easeDown, 10);
    expect(easeFor(-1, 0.05)).toBeCloseTo(-0.05, 10);
    expect(easeFor(1, 0.97)).toBeCloseTo(0.03, 10);
    // Rookie stays easy and All-Star stays hard: the band is narrower than the step between the levels
    expect(0.22 + FORM.firmUp).toBeLessThan(0.5 - FORM.easeDown);
    expect(0.82 - FORM.easeDown).toBeGreaterThan(0.5 + FORM.firmUp);
  });

  it('reads a save’s form as a number in range, or 0', () => {
    expect(repairForm(0.4)).toBe(0.4);
    expect(repairForm(9)).toBe(1);
    expect(repairForm('x')).toBe(0);
    expect(repairForm(undefined)).toBe(0);
  });
});

describe('form in the save', () => {
  it('starts even, and an old save without it loads even', () => {
    expect(newSave().form).toBe(0);
    const old: Record<string, unknown> = { ...startCareer(newSave(), 'comets') };
    delete old.form;
    expect(repairSave(old).form).toBe(0);
    expect(repairSave({ ...old, form: -0.3 }).form).toBe(-0.3);
    expect(repairSave({ ...old, form: 'lots' }).form).toBe(0);
  });

  it('moves after a game against the computer, and not after a game between two people', () => {
    const s = startCareer(newSave(), 'comets');
    const lost = finishMatch(s, summary({ score: [10, 22] }), DAY).data;
    expect(lost.form).toBeLessThan(0);
    const won = finishMatch(s, summary({ mode: 'ladder', score: [30, 12] }), DAY).data;
    expect(won.form).toBeGreaterThan(0);
    const tour = finishMatch(s, summary({ mode: 'tour', score: [12, 30], tour: { tourId: 'neighborhood', stage: 0, game: 0 } }), DAY).data;
    expect(tour.form).toBeLessThan(0);
    for (const mode of ['duo', 'online'] as const) expect(finishMatch(s, summary({ mode, score: [5, 30] }), DAY).data.form).toBe(0);
  });
});

describe('form in a game', () => {
  it('nudges the computer’s play only: the level shown, rewarded and its long shots stay the one picked', () => {
    for (const make of [
      (p: Prefs) => quickSetup(p, { perTeam: 2, difficulty: 0, opponent: 'stompers', court: null }, seededRng(3)),
      (p: Prefs) => ladderSetup(p, TIERS[2].floor, 2, seededRng(3)),
      (p: Prefs) => tourSetup(p, 'neighborhood', 1, 0, seededRng(3))!,
    ]) {
      const even = make(prefs());
      expect(even.ease).toBeUndefined();
      const down = make(prefs({ form: -1 }));
      const up = make(prefs({ form: 1 }));
      expect(down.difficulty).toBe(even.difficulty);
      expect(down.ease).toBeCloseTo(-Math.min(FORM.easeDown, even.difficulty), 10);
      expect(up.ease).toBeCloseTo(FORM.firmUp, 10);
      const cfg = buildMatch(down).config;
      expect(cfg.difficulty).toBeCloseTo(even.difficulty + (down.ease ?? 0), 10);
      expect(cfg.shotLevel).toBe(shotLevelFor(even.difficulty));
      expect(buildMatch(up).config.difficulty).toBeGreaterThan(buildMatch(even).config.difficulty);
      // the same setup always plays the same: the nudge is part of it before the game starts
      expect(buildMatch(down).config).toEqual(buildMatch(make(prefs({ form: -1 }))).config);
    }
  });

  it('never touches a game between two people', () => {
    const s = duoSetup(prefs({ form: -1 }), { perTeam: 2, rival: null, court: null, help: 0 }, seededRng(4));
    expect(s.ease).toBeUndefined();
    expect(buildMatch({ ...s, ease: -0.1 }).config.difficulty).toBe(s.difficulty);
  });

  it('eases Pro for a beginner who keeps losing there, and stays inside the band', () => {
    const run = playGames({ kind: 'quick', difficulty: 1 }, BEGINNER, 8, 501, { adapt: true });
    expect(run.games.filter((g) => !g.won).length).toBeGreaterThanOrEqual(6);
    // the first game is even; after the losses the computer has come down, but no further than the band
    expect(run.ease[0]).toBe(0);
    expect(run.ease[run.ease.length - 1]).toBeLessThan(-0.05);
    for (const e of run.ease) expect(e).toBeGreaterThanOrEqual(-FORM.easeDown);
  }, 60000);
});
