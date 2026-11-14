/** Two players on two devices: the match the host builds, and what each device's save gets afterwards. */

import { teamById } from '@/data/roster';
import { finishMatch, newSave, startCareer } from '@/state/logic';
import { summary, totals } from '@/testing/summary';

import { buildMatch, seenBy, type SidePlayer } from '../match';
import { seededRng } from '../rng';
import { duoSetup, onlineSetup, type OnlineSquad } from '../setups';

const HOST: SidePlayer[] = [
  { id: 'wren-kowalski', level: 2 },
  { id: 'pippa-quinn', level: 1 },
  { id: 'gus-moretti', level: 3 },
];
const GUEST: SidePlayer[] = [
  { id: 'pippa-quinn', level: 4 },
  { id: 'dash-bennett', level: 1 },
  { id: 'wren-kowalski', level: 1 },
];
const squad = (s: SidePlayer[], over: Partial<OnlineSquad> = {}): OnlineSquad => ({ squad: s, uniform: null, easyShots: false, ...over });

describe('an online game', () => {
  it('plays the host’s own squad as P1 and the guest’s own squad as P2, cards and levels as they are', () => {
    const s = onlineSetup(squad(HOST), squad(GUEST, { easyShots: true }), 3, 60, seededRng(1));
    expect(s.mode).toBe('online');
    expect(s.home.players).toEqual(HOST);
    expect(s.away.players).toEqual(GUEST);
    expect([s.home.short, s.away.short]).toEqual(['P1', 'P2']);
    expect(s.court).toBe(teamById(s.home.kitTeam).court);
    // each person keeps their own shot window, and nobody is helped while behind
    expect(s.duo?.teamAssist[0]).toBeLessThan(s.duo!.teamAssist[1]);
    expect(s.duo?.catchUp).toEqual([0, 0]);
    expect(s.rubberBand).toBe(0);
    const cfg = buildMatch(s).config;
    expect(cfg.humans).toEqual([true, true]);
    expect(cfg.userTeam).toBe(0);
  });

  it('refuses a squad short of players for the size', () => {
    expect(() => onlineSetup(squad(HOST.slice(0, 2)), squad(GUEST), 3, 60)).toThrow();
    expect(() => onlineSetup(squad(HOST.slice(0, 2)), squad(GUEST), 2, 60)).not.toThrow();
  });

  it('turns the summary round for the guest: their side first', () => {
    const s = summary({ mode: 'online', score: [18, 24], totals: [totals({ points: 18, dunks: 1 }), totals({ points: 24, steals: 3 })], names: ['Player 1', 'Player 2'] });
    const guest = seenBy(s, 1);
    expect(guest.won).toBe(true);
    expect(guest.score).toEqual([24, 18]);
    expect(guest.totals[0].steals).toBe(3);
    expect(guest.names).toEqual(['Player 2', 'Player 1']);
    expect(seenBy(s, 0)).toBe(s);
  });

  it('pays each device what a game on one screen pays, for its own side, and nothing else', () => {
    const day = '2027-03-01';
    const host = summary({ mode: 'online', score: [30, 22], totals: [totals({ points: 30, dunks: 2, threes: 1 }), totals({ points: 22, blocks: 2 })] });
    const asDuo = { ...host, mode: 'duo' as const };
    const before = startCareer(newSave(), 'comets');
    const online = finishMatch(before, host, day);
    const duo = finishMatch(before, asDuo, day);
    expect(online.outcome.rewards).toEqual(duo.outcome.rewards);
    expect(online.data.coins).toBe(duo.data.coins);
    // the guest lost, and is paid for a loss with their own highlights
    const guest = finishMatch(before, seenBy(host, 1), day);
    expect(guest.outcome.rewards).toEqual(finishMatch(before, { ...seenBy(host, 1), mode: 'duo' }, day).outcome.rewards);
    expect(guest.outcome.rewards.lines[0].label).toBe('Good game');
    // no ladder, tour, record or first win of the day
    for (const r of [online, guest]) {
      expect(r.data.ladder).toEqual(before.ladder);
      expect(r.data.tour).toEqual(before.tour);
      expect(r.data.stats).toEqual(before.stats);
      expect(r.data.firstWinDay).toEqual(before.firstWinDay);
    }
  });

  it('sets up the same kind of match a game on one screen does', () => {
    const one = duoSetup({ squad: HOST, quarterSeconds: 60, easyShots: false }, { perTeam: 3, rival: null, court: null, help: 0 }, seededRng(4));
    const two = onlineSetup(squad(HOST), squad(GUEST), 3, 60, seededRng(4));
    expect(two.difficulty).toBe(one.difficulty);
    expect(two.quarters).toBe(one.quarters);
  });
});
