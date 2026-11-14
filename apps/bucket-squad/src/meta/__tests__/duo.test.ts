/** Two players on one screen: the setup, what the match is told, and what the save gets afterwards. */

import { mustPlayer, playerOverall, teamById } from '@/data/roster';
import { missionsFor } from '@/meta/missions';
import { finishMatch, newSave, startCareer, type SaveData } from '@/state/logic';
import { summary, totals } from '@/testing/summary';

import { buildMatch, type SidePlayer } from '../match';
import { matchRewards } from '../rewards';
import { seededRng } from '../rng';
import { DUO_CATCH_UP, duoLevel, duoSetup, fairRival, playableTeams, quickSetup, rivalSide, sideOverall, teamSide, homeSide, type Prefs } from '../setups';

const STARTERS: SidePlayer[] = [
  { id: 'wren-kowalski', level: 1 },
  { id: 'pippa-quinn', level: 1 },
  { id: 'gus-moretti', level: 1 },
];
const prefs = (over: Partial<Prefs> = {}): Prefs => ({ squad: STARTERS, quarterSeconds: 60, easyShots: false, homeTeam: 'comets', ...over });
const ids = (players: SidePlayer[]) => players.map((p) => p.id);

describe('a two-player game', () => {
  it('puts the device’s squad on as P1 and the picked team as P2', () => {
    const s = duoSetup(prefs(), { perTeam: 3, rival: 'yetis', court: null, help: 0 }, seededRng(1));
    expect(s.mode).toBe('duo');
    expect(s.home.short).toBe('P1');
    expect(s.away.short).toBe('P2');
    expect(ids(s.home.players)).toEqual(ids(STARTERS));
    expect(s.away.kitTeam).toBe('yetis');
    expect(s.away.players).toHaveLength(3);
    expect(s.court).toBe(teamById('yetis').court);
    expect(ids(s.away.players).some((id) => ids(s.home.players).includes(id))).toBe(false);
  });

  it('fields the picked team’s strongest side', () => {
    for (const team of playableTeams(2)) {
      const home = homeSide(STARTERS);
      const side = rivalSide(team, home, 2);
      const strongest = teamSide(team, 2, 2, 1);
      if (!strongest.players.some((p) => ids(home.players).includes(p.id))) expect(ids(side.players)).toEqual(ids(strongest.players));
      expect(side.players).toHaveLength(2);
    }
  });

  it('plays P2’s team at the level P1’s squad has reached', () => {
    const levelled = STARTERS.map((p) => ({ ...p, level: 4 }));
    expect(duoLevel(homeSide(levelled), 3)).toBe(4);
    const s = duoSetup(prefs({ squad: levelled }), { perTeam: 3, rival: 'waves', court: null, help: 0 }, seededRng(2));
    expect(s.away.players.every((p) => p.level === 4)).toBe(true);
  });

  it('finds a fair match: no side anywhere is closer to P1’s overall', () => {
    for (const perTeam of [2, 3] as const) {
      const home = homeSide(STARTERS);
      const mine = sideOverall(home, perTeam);
      const fair = fairRival(home, perTeam, seededRng(3));
      const gap = Math.abs(sideOverall(fair, perTeam) - mine);
      for (const team of playableTeams(perTeam)) {
        for (const strength of [0, 1, 2] as const) {
          for (let level = 1; level <= 5; level++) {
            const other = teamSide(team, perTeam, strength, level);
            if (other.players.some((p) => ids(home.players).includes(p.id))) continue;
            expect(Math.abs(sideOverall(other, perTeam) - mine)).toBeGreaterThanOrEqual(gap);
          }
        }
      }
      expect(gap).toBeLessThanOrEqual(2);
    }
  });

  it('has no rubber band and the same shot window for both, unless someone takes a helping hand', () => {
    const even = duoSetup(prefs(), { perTeam: 2, rival: null, court: 'park', help: 0 }, seededRng(4));
    expect(even.court).toBe('park');
    expect(even.rubberBand).toBe(0);
    expect(even.duo?.catchUp).toEqual([0, 0]);
    expect(even.duo?.teamAssist[0]).toBe(even.duo?.teamAssist[1]);
    const helpP2 = duoSetup(prefs(), { perTeam: 2, rival: null, court: null, help: 2 }, seededRng(4));
    expect(helpP2.duo?.catchUp).toEqual([0, DUO_CATCH_UP]);
    expect(helpP2.duo!.teamAssist[1]).toBeGreaterThan(helpP2.duo!.teamAssist[0]);
    // P1 keeps the device's easy-shots setting
    const easy = duoSetup(prefs({ easyShots: true }), { perTeam: 2, rival: null, court: null, help: 0 }, seededRng(4));
    expect(easy.duo!.teamAssist[0]).toBeGreaterThan(easy.duo!.teamAssist[1]);
  });

  it('tells the match both teams are played by people', () => {
    const s = duoSetup(prefs(), { perTeam: 3, rival: 'comets', court: null, help: 1 }, seededRng(5));
    const { config } = buildMatch(s);
    expect(config.userTeam).toBe(0);
    expect(config.humans).toEqual([true, true]);
    expect(config.teamAssist).toEqual(s.duo?.teamAssist);
    expect(config.catchUp).toEqual(s.duo?.catchUp);
    // a one-player game is told nothing new
    const one = buildMatch(quickSetup(prefs(), { perTeam: 3, difficulty: 1, opponent: 'yetis', court: null }, seededRng(5))).config;
    expect(one.humans).toBeUndefined();
    expect(one.teamAssist).toBeUndefined();
    expect(one.catchUp).toBeUndefined();
  });

  it('gives P2 a mirror-free side even against P1’s own team', () => {
    const s = duoSetup(prefs(), { perTeam: 3, rival: mustPlayer(STARTERS[0].id).team, court: null, help: 0 }, seededRng(6));
    expect(ids(s.away.players).some((id) => ids(s.home.players).includes(id))).toBe(false);
    for (const p of s.away.players) expect(playerOverall(mustPlayer(p.id))).toBeGreaterThan(0);
  });
});

describe('after a two-player game', () => {
  const career = (): SaveData => startCareer(newSave(), 'comets');
  const duoGame = (score: [number, number]) =>
    summary({ mode: 'duo', score, difficulty: 0.5, totals: [totals({ points: score[0], dunks: 2, threes: 1 }), totals({ points: score[1], dunks: 5 })] });

  it('pays quick-game coins for P1’s game, with nothing for beating the computer', () => {
    const quick = matchRewards(summary({ mode: 'quick', score: [20, 14], difficulty: 0, totals: [totals({ points: 20, dunks: 2, threes: 1 }), totals({ points: 14 })] }), false);
    const duo = matchRewards(duoGame([20, 14]), true);
    expect(duo.total).toBe(quick.total);
    const labels = duo.lines.map((l) => l.label);
    expect(labels).not.toContain('First win today');
    expect(labels).not.toContain('Tough opponent');
    expect(matchRewards(duoGame([10, 22]), false).lines[0]).toEqual({ label: 'Good game', coins: 20 });
  });

  it('puts the coins on the device’s save and leaves ladder, tour, record and first win alone', () => {
    const s = career();
    const { data, outcome } = finishMatch(s, duoGame([22, 18]), '2027-02-01');
    expect(data.coins).toBe(s.coins + outcome.rewards.total);
    expect(outcome.rewards.total).toBeGreaterThan(0);
    expect(data.ladder).toEqual(s.ladder);
    expect(data.tour).toEqual(s.tour);
    expect(data.stats).toEqual(s.stats);
    expect(data.firstWinDay).toBe(s.firstWinDay);
    expect(outcome.ladder).toBeUndefined();
    expect(outcome.tour).toBeUndefined();
  });

  it('counts only toward "Play N games" missions', () => {
    let day = '';
    for (let d = 1; d <= 400 && !day; d++) {
      const key = `2027-03-${String(d).padStart(3, '0')}`;
      const metrics = missionsFor(key).missions.map((m) => m.metric);
      if (metrics.includes('games') && metrics.some((x) => x === 'dunks' || x === 'points' || x === 'wins' || x === 'threes')) day = key;
    }
    expect(day).not.toBe('');
    const { data } = finishMatch(career(), duoGame([30, 10]), day);
    for (const m of data.missions!.missions) expect(m.progress).toBe(m.metric === 'games' ? 1 : 0);
  });
});
