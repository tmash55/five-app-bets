import { mustPlayer, teamPlayers } from '@/data/roster';
import { summary, totals } from '@/testing/summary';

import { TIERS, ladderOpponent, ladderResult, tierIndex, tierProgress } from '../ladder';
import { MISSIONS_PER_DAY, currentMissions, missionDone, missionsAfterMatch, missionsAfterPack, missionsFor, missionsToClaim } from '../missions';
import { FIRST_WIN_BONUS, matchRewards } from '../rewards';
import { dayKey, seededRng } from '../rng';
import { STARS_PER_GAME, gameKey, gameOpen, nextTourGame, stageCleared, stageOpen, stageStars, starsFor, tourById, tourStars, toursFor, type TourProgress } from '../tour';

describe('the ladder', () => {
  it('has tiers that only get harder and richer', () => {
    for (let i = 1; i < TIERS.length; i++) {
      expect(TIERS[i].floor).toBeGreaterThan(TIERS[i - 1].floor);
      expect(TIERS[i].difficulty).toBeGreaterThan(TIERS[i - 1].difficulty);
      expect(TIERS[i].level).toBeGreaterThanOrEqual(TIERS[i - 1].level);
      expect(TIERS[i].reward.coins).toBeGreaterThan(TIERS[i - 1].reward.coins);
    }
  });

  it('finds the tier for any number of points', () => {
    expect(tierIndex(0)).toBe(0);
    expect(tierIndex(99)).toBe(0);
    expect(tierIndex(100)).toBe(1);
    expect(tierIndex(100000)).toBe(TIERS.length - 1);
    expect(tierProgress(130)).toMatchObject({ index: 1, have: 30, span: 150 });
    expect(tierProgress(5000).next).toBeNull();
  });

  it('pays more for a bigger win, up to a cap', () => {
    expect(ladderResult(0, true, 1)).toBe(29);
    expect(ladderResult(0, true, 12)).toBe(40);
    expect(ladderResult(0, true, 40)).toBe(40);
  });

  it('never drops a loser out of a tier', () => {
    expect(ladderResult(0, false, -20)).toBe(0);
    expect(ladderResult(104, false, -3)).toBe(100);
    expect(ladderResult(180, false, -3)).toBe(168);
  });

  it('fields opponents of the right size and level, from another team', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const side = ladderOpponent(500, 3, seededRng(seed), 'rockets');
      expect(side.players).toHaveLength(3);
      expect(side.kitTeam).not.toBe('rockets');
      for (const p of side.players) {
        expect(p.level).toBe(TIERS[tierIndex(500)].level);
        expect(mustPlayer(p.id).team).toBe(side.kitTeam);
      }
    }
  });
});

describe('the tour', () => {
  const plain = toursFor(null)[0];

  it('visits every neighborhood court, three games each, with a star to win', () => {
    expect(plain.stages.map((s) => s.team.id)).toEqual(['rockets', 'thunder', 'waves', 'coyotes', 'yetis', 'skyhawks', 'throwbacks', 'legends']);
    for (const stage of plain.stages) {
      expect(stage.games).toHaveLength(3);
      const star = stage.games[2].unlock;
      expect(star).toBeDefined();
      expect(mustPlayer(star as string).team).toBe(stage.team.id);
      expect(stage.games[0].perTeam).toBe(2);
      for (const g of stage.games) {
        expect(g.opponents.length).toBeGreaterThanOrEqual(g.perTeam);
        for (const o of g.opponents) expect(mustPlayer(o.id).team).toBe(stage.team.id);
      }
    }
  });

  it('gets harder stop by stop and game by game', () => {
    for (let s = 0; s < plain.stages.length; s++) {
      const g = plain.stages[s].games;
      expect(g[1].difficulty).toBeGreaterThan(g[0].difficulty);
      expect(g[2].difficulty).toBeGreaterThan(g[1].difficulty);
      expect(g[2].coins).toBeGreaterThan(g[0].coins);
      if (s > 0) expect(g[0].difficulty).toBeGreaterThan(plain.stages[s - 1].games[0].difficulty);
    }
    expect(plain.stages[0].games[0].difficulty).toBeLessThan(0.25);
  });

  it('saves your home court for later in the trip', () => {
    const mine = toursFor('rockets')[0];
    expect(mine.stages.map((s) => s.team.id)).toEqual(['thunder', 'waves', 'coyotes', 'yetis', 'skyhawks', 'rockets', 'throwbacks', 'legends']);
    // a home court that is already a late stop stays where it is
    expect(toursFor('skyhawks')[0].stages.map((s) => s.team.id)).toEqual(plain.stages.map((s) => s.team.id));
    // the first stop is always the gentlest, whoever it is
    expect(mine.stages[0].games[0].difficulty).toBe(plain.stages[0].games[0].difficulty);
    expect(toursFor('rockets')).toBe(toursFor('rockets'));
    expect(tourById('neighborhood', 'rockets')).toBe(mine);
    expect(tourById('no-such-tour', null)).toBe(plain);
  });

  it('awards stars by margin', () => {
    expect(starsFor(false, -4)).toBe(0);
    expect(starsFor(true, 1)).toBe(1);
    expect(starsFor(true, 5)).toBe(2);
    expect(starsFor(true, 10)).toBe(3);
  });

  it('opens games and stops in order', () => {
    const p: TourProgress = {};
    expect(nextTourGame(p, plain)).toEqual({ stage: 0, game: 0 });
    expect(gameOpen(p, plain, 0, 0)).toBe(true);
    expect(gameOpen(p, plain, 0, 1)).toBe(false);
    expect(stageOpen(p, plain, 1)).toBe(false);

    p[gameKey(plain.id, 0, 0)] = 2;
    expect(gameOpen(p, plain, 0, 1)).toBe(true);
    expect(nextTourGame(p, plain)).toEqual({ stage: 0, game: 1 });

    p[gameKey(plain.id, 0, 1)] = 1;
    p[gameKey(plain.id, 0, 2)] = 3;
    expect(stageCleared(p, plain, 0)).toBe(true);
    expect(stageOpen(p, plain, 1)).toBe(true);
    expect(stageStars(p, plain, 0)).toBe(6);
    expect(nextTourGame(p, plain)).toEqual({ stage: 1, game: 0 });
    expect(tourStars(p, plain)).toEqual({ have: 6, all: plain.stages.length * 3 * STARS_PER_GAME });
  });

  it('has nothing left to play once every game is won', () => {
    const p: TourProgress = {};
    plain.stages.forEach((s, si) => s.games.forEach((_, gi) => (p[gameKey(plain.id, si, gi)] = 1)));
    expect(nextTourGame(p, plain)).toBeNull();
  });

  it('never asks for more opponents than a team has', () => {
    for (const tour of toursFor('waves')) {
      for (const stage of tour.stages) {
        const roster = teamPlayers(stage.team.id).length;
        for (const g of stage.games) expect(g.perTeam).toBeLessThanOrEqual(roster);
      }
    }
  });
});

describe('daily missions', () => {
  it('deals the same three missions all day and new ones tomorrow', () => {
    const a = missionsFor('2026-03-09');
    expect(a).toEqual(missionsFor('2026-03-09'));
    expect(a.missions).toHaveLength(MISSIONS_PER_DAY);
    expect(new Set(a.missions.map((m) => m.metric)).size).toBe(MISSIONS_PER_DAY);
    for (const m of a.missions) {
      expect(m.target).toBeGreaterThan(0);
      expect(m.coins % 5).toBe(0);
      expect(m.coins).toBeGreaterThan(0);
      expect(m.text.length).toBeGreaterThan(5);
    }
    const days = new Set<string>();
    for (let d = 1; d <= 20; d++) days.add(JSON.stringify(missionsFor(`2026-04-${String(d).padStart(2, '0')}`).missions.map((m) => [m.metric, m.target])));
    expect(days.size).toBeGreaterThan(10);
  });

  it('starts fresh when the saved set is from another day', () => {
    const old = missionsFor('2026-03-09');
    expect(currentMissions(old, '2026-03-09')).toBe(old);
    expect(currentMissions(old, '2026-03-10').day).toBe('2026-03-10');
    expect(currentMissions(null, '2026-03-10').day).toBe('2026-03-10');
  });

  it('counts a game toward the missions it matches and never past the target', () => {
    const day = { day: 'd', bonusClaimed: false, missions: [
      { metric: 'wins' as const, text: 'Win 2 games', target: 2, progress: 0, coins: 120, claimed: false },
      { metric: 'dunks' as const, text: 'Throw down 3 dunks', target: 3, progress: 2, coins: 70, claimed: false },
      { metric: 'packs' as const, text: 'Open a pack', target: 1, progress: 0, coins: 60, claimed: false },
    ] };
    const after = missionsAfterMatch(day, summary({ totals: [totals({ points: 21, dunks: 5 }), totals({ points: 15 })] }));
    expect(after.missions.map((m) => m.progress)).toEqual([1, 3, 0]);
    expect(missionDone(after.missions[1])).toBe(true);
    expect(missionsToClaim(after)).toBe(1);
    expect(day.missions[1].progress).toBe(2);

    const lost = missionsAfterMatch(day, summary({ score: [10, 15] }));
    expect(lost.missions[0].progress).toBe(0);

    const opened = missionsAfterPack(after);
    expect(opened.missions[2].progress).toBe(1);
    expect(missionsToClaim(opened)).toBe(2);
  });

  it('offers the bonus once all three are collected', () => {
    const day = missionsFor('2026-03-09');
    const done = { ...day, missions: day.missions.map((m) => ({ ...m, progress: m.target, claimed: true })) };
    expect(missionsToClaim(done)).toBe(1);
    expect(missionsToClaim({ ...done, bonusClaimed: true })).toBe(0);
  });

  it('names days by the local calendar', () => {
    expect(dayKey(new Date(2026, 2, 9, 23, 59))).toBe('2026-03-09');
    expect(dayKey(new Date(2026, 11, 1, 0, 0))).toBe('2026-12-01');
  });
});

describe('match rewards', () => {
  it('pays something for a loss and more for a win', () => {
    const loss = matchRewards(summary({ score: [10, 15] }), true);
    expect(loss.lines).toEqual([{ label: 'Good game', coins: 20 }]);
    const win = matchRewards(summary(), false);
    expect(win.total).toBeGreaterThan(loss.total);
    expect(win.lines[0]).toEqual({ label: 'Win', coins: 50 });
  });

  it('adds a line per kind of highlight, with a cap', () => {
    const r = matchRewards(summary({ totals: [totals({ points: 40, dunks: 2, threes: 1, steals: 30 }), totals({ points: 15 })], score: [40, 15] }), false);
    const byLabel = Object.fromEntries(r.lines.map((l) => [l.label, l.coins]));
    expect(byLabel['2 dunks']).toBe(6);
    expect(byLabel['1 three-pointer']).toBe(3);
    expect(byLabel['8 steals']).toBe(16);
    expect(byLabel['Big win']).toBe(10);
    expect(r.total).toBe(r.lines.reduce((a, l) => a + l.coins, 0));
  });

  it('pays the first win of the day once, and tough opponents better', () => {
    const first = matchRewards(summary(), true);
    expect(first.lines[first.lines.length - 1]).toEqual({ label: 'First win today', coins: FIRST_WIN_BONUS });
    expect(matchRewards(summary({ score: [10, 15] }), true).lines.some((l) => l.label === 'First win today')).toBe(false);
    const easy = matchRewards(summary({ mode: 'ladder', difficulty: 0.2 }), false);
    const hard = matchRewards(summary({ mode: 'ladder', difficulty: 0.9 }), false);
    expect(hard.total).toBeGreaterThan(easy.total);
    expect(hard.lines.some((l) => l.label === 'Tough opponent')).toBe(true);
  });

  it('rewards the dramatic finishes', () => {
    const r = matchRewards(summary({ buzzerBeater: true, overtime: true, score: [22, 21] }), false);
    const labels = r.lines.map((l) => l.label);
    expect(labels).toContain('Buzzer beater');
    expect(labels).toContain('Overtime thriller');
    expect(labels).not.toContain('Big win');
  });
});
