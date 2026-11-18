/** Playing as any team, the squad's name on its side, and random courts in each way of playing. */

import { mustPlayer, teamById, teamPlayers } from '@/data/roster';
import { finishMatch, newSave, startCareer } from '@/state/logic';
import { summary, totals } from '@/testing/summary';

import { ALL_COURTS, randomCourt } from '../courts';
import { buildMatch, type Side, type SidePlayer } from '../match';
import { seededRng } from '../rng';
import { asTeamSide, duoLevel, duoSetup, homeSide, ladderSetup, onlineSetup, playableTeams, quickSetup, tourSetup, type OnlineSquad, type Prefs } from '../setups';
import { toursFor } from '../tour';

const STARTERS: SidePlayer[] = [
  { id: 'wren-kowalski', level: 3 },
  { id: 'pippa-quinn', level: 2 },
  { id: 'gus-moretti', level: 4 },
];
const prefs = (over: Partial<Prefs> = {}): Prefs => ({ squad: STARTERS, quarterSeconds: 60, easyShots: true, homeTeam: 'comets', ...over });
const ids = (side: Side) => side.players.map((p) => p.id);
const shares = (a: Side, b: Side) => ids(a).some((id) => ids(b).includes(id));

describe('the squad’s own name', () => {
  it('goes on the squad’s side in a quick game, the ladder and the tour', () => {
    const p = prefs({ teamName: { words: ['Galaxy', 'Geckos'] }, teamColors: 'deep-sea' });
    const tour = toursFor('comets')[0];
    const setups = [quickSetup(p, { perTeam: 2, difficulty: 0, opponent: 'stompers', court: null }, seededRng(1)), ladderSetup(p, 0, 2, seededRng(2)), tourSetup(p, tour.id, 0, 0, seededRng(3))!];
    for (const s of setups) {
      expect(s.home.name).toBe('Galaxy Geckos');
      expect(s.home.short).toBe('GEC');
      expect(s.home.colors).toBe('deep-sea');
    }
  });

  it('stays Your Squad until one is chosen', () => {
    const s = quickSetup(prefs(), { perTeam: 2, difficulty: 0, opponent: 'stompers', court: null }, seededRng(1));
    expect([s.home.name, s.home.short]).toEqual(['Your Squad', 'YOU']);
  });

  it('goes by YOU when its letters are the other team’s', () => {
    const s = quickSetup(prefs({ teamName: { typed: 'Comets' } }), { perTeam: 2, difficulty: 0, opponent: 'comets', court: null }, seededRng(1));
    expect(s.away.short).toBe('COM');
    expect(s.home.short).toBe('YOU');
    expect(s.home.name).toBe('Comets');
  });
});

describe('playing as a team in a quick game', () => {
  it('plays that team’s own players, in its colours and under its name, at the squad’s level on average', () => {
    for (const team of playableTeams(3)) {
      const s = quickSetup(prefs(), { perTeam: 3, difficulty: 1, opponent: null, court: null, team: team.id }, seededRng(4));
      expect(s.home.kitTeam).toBe(team.id);
      expect(s.home.name).toBe(team.name);
      expect(s.home.short).toBe(team.short);
      expect(s.home.uniform).toBeUndefined();
      for (const p of s.home.players) {
        expect(mustPlayer(p.id).team).toBe(team.id);
        expect(p.level).toBe(duoLevel(homeSide(STARTERS), 3));
      }
      expect(new Set(ids(s.home)).size).toBe(3);
      // never the same team on both sides, and nobody on both
      expect(s.away.kitTeam).not.toBe(team.id);
      expect(shares(s.home, s.away)).toBe(false);
    }
  });

  it('never plays against itself, even when that team is picked as the opponent', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = quickSetup(prefs(), { perTeam: 2, difficulty: 2, opponent: 'yetis', court: null, team: 'yetis' }, seededRng(seed));
      expect(s.home.kitTeam).toBe('yetis');
      expect(s.away.kitTeam).not.toBe('yetis');
    }
  });

  it('is a quick game like any other afterwards: the same coins, nothing else changed', () => {
    const before = startCareer(newSave(), 'comets');
    const win = summary({ mode: 'quick', score: [24, 18], totals: [totals({ points: 24 }), totals({ points: 18 })], names: ['Yetis', 'Stompers'] });
    const asSquad = finishMatch(before, { ...win, names: ['Your Squad', 'Stompers'] }, '2027-03-01');
    const asTeam = finishMatch(before, win, '2027-03-01');
    expect(asTeam.outcome.rewards).toEqual(asSquad.outcome.rewards);
    expect(asTeam.data.coins).toBe(asSquad.data.coins);
    expect(asTeam.data.squad).toEqual(before.squad);
    expect(asTeam.data.owned).toEqual(before.owned);
  });

  it('builds a match the simulation can play', () => {
    const s = quickSetup(prefs(), { perTeam: 3, difficulty: 0, opponent: null, court: 'random', team: 'legends' }, seededRng(9));
    const built = buildMatch(s);
    expect(built.lineup).toHaveLength(6);
    expect(built.lineup.filter((l) => l.team === 0).every((l) => l.def.team === 'legends')).toBe(true);
  });

  it('a team that cannot field the size plays the squad instead', () => {
    const small = playableTeams(2).find((t) => teamPlayers(t.id).length < 3);
    const s = quickSetup(prefs(), { perTeam: 3, difficulty: 0, opponent: null, court: null, team: small?.id ?? 'no-such-team' }, seededRng(1));
    expect(ids(s.home)).toEqual(ids(homeSide(STARTERS)));
  });
});

describe('playing as a team with two players on one screen', () => {
  it('lets P1 play any team, and never the team P2 picked', () => {
    const s = duoSetup(prefs(), { perTeam: 3, rival: 'yetis', court: null, help: 0, team: 'coyotes' }, seededRng(1));
    expect(s.home.kitTeam).toBe('coyotes');
    expect(s.home.short).toBe('P1');
    expect(s.home.name).toBe(teamById('coyotes').name);
    expect(s.away.kitTeam).toBe('yetis');
    expect(s.away.players.every((p) => p.level === duoLevel(homeSide(STARTERS), 3))).toBe(true);
    for (let seed = 1; seed <= 30; seed++) {
      const same = duoSetup(prefs(), { perTeam: 2, rival: 'coyotes', court: null, help: 0, team: 'coyotes' }, seededRng(seed));
      expect(same.home.kitTeam).toBe('coyotes');
      expect(same.away.kitTeam).not.toBe('coyotes');
      const fair = duoSetup(prefs(), { perTeam: 2, rival: null, court: null, help: 0, team: 'waves' }, seededRng(seed));
      expect(fair.away.kitTeam).not.toBe('waves');
      expect(shares(fair.home, fair.away)).toBe(false);
    }
  });
});

const squad = (s: SidePlayer[], over: Partial<OnlineSquad> = {}): OnlineSquad => ({ squad: s, uniform: null, easyShots: false, ...over });
const GUEST: SidePlayer[] = [
  { id: 'dash-bennett', level: 1 },
  { id: 'kai-nakoa', level: 2 },
  { id: 'wren-kowalski', level: 1 },
];

describe('an online game', () => {
  it('names each side by its wheel name, or Player 1 and Player 2', () => {
    const s = onlineSetup(squad(STARTERS, { words: ['Pixel', 'Puffins'], colors: 'hot-pink' }), squad(GUEST), 2, 60, seededRng(1));
    expect([s.home.name, s.home.short, s.home.colors]).toEqual(['Pixel Puffins', 'P1', 'hot-pink']);
    expect([s.away.name, s.away.short, s.away.colors]).toEqual(['Player 2', 'P2', undefined]);
  });

  it('lets each person play a team, and never the same one: then the guest plays its squad', () => {
    const s = onlineSetup(squad(STARTERS, { team: 'legends' }), squad(GUEST, { team: 'waves' }), 3, 60, seededRng(1));
    expect([s.home.kitTeam, s.home.name, s.home.short]).toEqual(['legends', teamById('legends').name, 'P1']);
    expect([s.away.kitTeam, s.away.name, s.away.short]).toEqual(['waves', teamById('waves').name, 'P2']);
    expect(s.home.players.every((p) => p.level === duoLevel(homeSide(STARTERS), 3))).toBe(true);
    expect(s.away.players.every((p) => p.level === duoLevel(homeSide(GUEST), 3))).toBe(true);
    expect(shares(s.home, s.away)).toBe(false);
    const same = onlineSetup(squad(STARTERS, { team: 'legends' }), squad(GUEST, { team: 'legends' }), 3, 60, seededRng(1));
    expect(same.home.kitTeam).toBe('legends');
    expect(ids(same.away)).toEqual(ids(homeSide(GUEST)));
    expect(same.away.name).toBe('Player 2');
    expect(shares(same.home, same.away)).toBe(false);
  });

  it('plays on the court the host picked, a random one by the seed, or the host’s home court', () => {
    const home = onlineSetup(squad(STARTERS), squad(GUEST), 2, 60, seededRng(1));
    expect(home.court).toBe(teamById('comets').court);
    expect(home.randomCourt).toBeUndefined();
    expect(onlineSetup(squad(STARTERS), squad(GUEST), 2, 60, seededRng(1), 'canyon').court).toBe('canyon');
    const random = onlineSetup(squad(STARTERS), squad(GUEST), 2, 60, seededRng(5), 'random', 'park');
    expect(random.randomCourt).toBe(true);
    expect(random.court).toBe(randomCourt(random.seed, 'park'));
    expect(random.court).not.toBe('park');
  });
});

describe('random courts in a game', () => {
  it('come from the game’s seed, all six, never the one just played', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const s = quickSetup(prefs({ lastCourt: 'beach' }), { perTeam: 2, difficulty: 0, opponent: 'stompers', court: 'random' }, seededRng(seed));
      expect(s.randomCourt).toBe(true);
      expect(s.court).toBe(randomCourt(s.seed, 'beach'));
      expect(s.court).not.toBe('beach');
      seen.add(s.court);
      const d = duoSetup(prefs({ lastCourt: 'snow' }), { perTeam: 2, rival: 'stompers', court: 'random', help: 0 }, seededRng(seed));
      expect(d.court).not.toBe('snow');
      seen.add(d.court);
    }
    expect(seen.size).toBe(ALL_COURTS.length);
  });

  it('leave a picked court or the home court as before, and the tour on its home courts', () => {
    const s = quickSetup(prefs({ lastCourt: 'beach' }), { perTeam: 2, difficulty: 0, opponent: 'stompers', court: null }, seededRng(1));
    expect(s.court).toBe(teamById('stompers').court);
    expect(s.randomCourt).toBeUndefined();
    const tour = toursFor('comets')[0];
    const t = tourSetup(prefs({ lastCourt: tour.stages[0].team.court }), tour.id, 0, 0, seededRng(1))!;
    expect(t.court).toBe(tour.stages[0].team.court);
  });
});

describe('a team side', () => {
  it('is the team’s strongest, at the level given by the squad', () => {
    const side = asTeamSide(teamById('stompers'), homeSide(STARTERS.map((p) => ({ ...p, level: 5 }))), 2);
    expect(side.players.every((p) => p.level === 5)).toBe(true);
    expect(side.kitTeam).toBe('stompers');
  });
});
