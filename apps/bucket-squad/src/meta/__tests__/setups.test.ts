import { TEAMS, colorGap, kitAgainst, kitsClash, mustPlayer, playerOverall, teamById, teamPlayers } from '@/data/roster';

import { TIERS } from '../ladder';
import { buildMatch, chemistry, type Side, type SidePlayer } from '../match';
import { seededRng } from '../rng';
import { QUARTERS, homeSide, ladderSetup, playableTeams, quickSetup, sideOverall, teamSide, tourSetup, withoutMirrors, type Prefs } from '../setups';
import { toursFor } from '../tour';

/** the three Comets everyone starts with, best first */
const STARTERS: SidePlayer[] = [
  { id: 'wren-kowalski', level: 1 },
  { id: 'pippa-quinn', level: 1 },
  { id: 'gus-moretti', level: 1 },
];

const prefs = (over: Partial<Prefs> = {}): Prefs => ({ squad: STARTERS, quarterSeconds: 60, easyShots: true, homeTeam: 'comets', ...over });

const ids = (side: Side) => side.players.map((p) => p.id);
const shares = (a: Side, b: Side) => ids(a).some((id) => ids(b).includes(id));

describe('your side', () => {
  it('wears the captain’s uniform and brings the whole squad', () => {
    const side = homeSide(STARTERS);
    expect(side.kitTeam).toBe('comets');
    expect(ids(side)).toEqual(['wren-kowalski', 'pippa-quinn', 'gus-moretti']);
    const mixed = homeSide([{ id: 'kai-nakoa', level: 2 }, STARTERS[0], STARTERS[1]]);
    expect(mixed.kitTeam).toBe('waves');
  });

  it('rates only the players who take the court', () => {
    const side = homeSide([{ id: 'stella-starr', level: 1 }, STARTERS[0], STARTERS[2]]);
    const two = Math.round((playerOverall(mustPlayer('stella-starr')) + playerOverall(mustPlayer('wren-kowalski'))) / 2);
    expect(sideOverall(side, 2)).toBe(two);
    expect(sideOverall(side, 3)).toBeLessThan(two);
    expect(sideOverall({ ...side, players: [] }, 2)).toBe(0);
  });

  it('gets better with levels', () => {
    const low = sideOverall(homeSide(STARTERS), 3);
    const high = sideOverall(homeSide(STARTERS.map((p) => ({ ...p, level: 5 }))), 3);
    expect(high).toBeGreaterThan(low);
  });
});

describe('computer sides', () => {
  it('fields weaker players on Rookie and the best on All-Star', () => {
    for (const team of TEAMS) {
      for (const perTeam of [2, 3] as const) {
        const easy = teamSide(team, perTeam, 0, 1);
        const mid = teamSide(team, perTeam, 1, 1);
        const hard = teamSide(team, perTeam, 2, 1);
        expect(easy.players).toHaveLength(perTeam);
        expect(new Set(ids(hard)).size).toBe(perTeam);
        expect(sideOverall(easy, perTeam)).toBeLessThanOrEqual(sideOverall(mid, perTeam));
        expect(sideOverall(mid, perTeam)).toBeLessThanOrEqual(sideOverall(hard, perTeam));
        expect(hard.kitTeam).toBe(team.id);
        // strongest first, so the best player is the one with the ball
        const ovr = hard.players.map((p) => playerOverall(mustPlayer(p.id)));
        expect([...ovr].sort((a, b) => b - a)).toEqual(ovr);
      }
    }
  });

  it('lists every team that can fill a side', () => {
    expect(playableTeams(3).map((t) => t.id)).toEqual(TEAMS.map((t) => t.id));
    expect(playableTeams(99)).toEqual([]);
  });
});

describe('never facing your own squad', () => {
  it('leaves a side alone when nobody is shared', () => {
    const away = teamSide(teamById('stompers'), 3, 0, 1);
    expect(withoutMirrors(away, homeSide(STARTERS))).toBe(away);
  });

  it('swaps a shared player for the teammate closest in skill', () => {
    const home = homeSide(STARTERS);
    const away: Side = { name: 'Comets', short: 'COM', kitTeam: 'comets', players: [{ id: 'gus-moretti', level: 3 }, { id: 'nia-brooks', level: 3 }] };
    const out = withoutMirrors(away, home);
    expect(shares(out, home)).toBe(false);
    expect(out.players[1]).toEqual({ id: 'nia-brooks', level: 3 });
    // the stand-in keeps the level and comes from the same team
    expect(out.players[0].level).toBe(3);
    expect(mustPlayer(out.players[0].id).team).toBe('comets');
    const want = playerOverall(mustPlayer('gus-moretti'));
    const free = teamPlayers('comets').filter((p) => !ids(home).includes(p.id) && p.id !== 'nia-brooks');
    const closest = Math.min(...free.map((p) => Math.abs(playerOverall(p) - want)));
    expect(Math.abs(playerOverall(mustPlayer(out.players[0].id)) - want)).toBe(closest);
  });

  it('counts the bench too, and never uses a stand-in twice', () => {
    const home = homeSide(STARTERS);
    const away: Side = { name: 'Comets', short: 'COM', kitTeam: 'comets', players: STARTERS.map((p) => ({ ...p })) };
    const out = withoutMirrors(away, home);
    expect(shares(out, home)).toBe(false);
    expect(new Set(ids(out)).size).toBe(3);
  });

  it('keeps a player it cannot replace rather than leaving a hole', () => {
    const everyone = teamPlayers('comets').map((p) => ({ id: p.id, level: 1 }));
    const home: Side = { name: 'Your Squad', short: 'YOU', kitTeam: 'comets', players: everyone };
    const away: Side = { name: 'Comets', short: 'COM', kitTeam: 'comets', players: everyone.slice(0, 2) };
    expect(withoutMirrors(away, home).players).toHaveLength(2);
  });
});

describe('a quick game', () => {
  it('uses the chosen opponent, court and level', () => {
    const s = quickSetup(prefs(), { perTeam: 3, difficulty: 2, opponent: 'waves', court: 'snow' }, seededRng(1));
    expect(s.mode).toBe('quick');
    expect(s.perTeam).toBe(3);
    expect(s.away.kitTeam).toBe('waves');
    expect(s.court).toBe('snow');
    expect(s.quarters).toBe(QUARTERS);
    expect(s.quarterSeconds).toBe(60);
    expect(s.away.players).toHaveLength(3);
    expect(s.tour).toBeUndefined();
    expect(Number.isInteger(s.seed)).toBe(true);
    expect(s.seed).toBeGreaterThan(0);
  });

  it('plays on the other team’s court unless told otherwise', () => {
    const s = quickSetup(prefs(), { perTeam: 2, difficulty: 0, opponent: 'yetis', court: null }, seededRng(2));
    expect(s.court).toBe(teamById('yetis').court);
  });

  it('gets harder with each level', () => {
    const at = (difficulty: 0 | 1 | 2) => quickSetup(prefs(), { perTeam: 2, difficulty, opponent: 'stompers', court: null }, seededRng(3));
    expect(at(0).difficulty).toBeLessThan(at(1).difficulty);
    expect(at(1).difficulty).toBeLessThan(at(2).difficulty);
    expect(at(0).rubberBand).toBeGreaterThan(at(2).rubberBand);
    expect(sideOverall(at(0).away, 2)).toBeLessThan(sideOverall(at(2).away, 2));
  });

  it('gives a wider shot window with easy shots on', () => {
    const easy = quickSetup(prefs({ easyShots: true }), { perTeam: 2, difficulty: 0, opponent: 'stompers', court: null }, seededRng(4));
    const standard = quickSetup(prefs({ easyShots: false }), { perTeam: 2, difficulty: 0, opponent: 'stompers', court: null }, seededRng(4));
    expect(easy.timingAssist).toBeGreaterThan(standard.timingAssist);
    expect(standard.timingAssist).toBeGreaterThanOrEqual(1);
  });

  it('never surprises you with a team that needs stand-ins', () => {
    const p = prefs();
    for (let seed = 1; seed <= 200; seed++) {
      for (const difficulty of [0, 1, 2] as const) {
        const s = quickSetup(p, { perTeam: 3, difficulty, opponent: null, court: null }, seededRng(seed));
        expect(shares(s.away, s.home)).toBe(false);
        expect(ids(s.away)).toEqual(ids(teamSide(teamById(s.away.kitTeam), 3, difficulty, s.away.players[0].level)));
      }
    }
  });

  it('still fields a full, different side when you pick your own team', () => {
    const s = quickSetup(prefs(), { perTeam: 3, difficulty: 0, opponent: 'comets', court: null }, seededRng(5));
    expect(s.away.kitTeam).toBe('comets');
    expect(shares(s.away, s.home)).toBe(false);
    expect(new Set(ids(s.away)).size).toBe(3);
  });

  it('builds a match the simulation can run for every team and level', () => {
    for (const team of TEAMS) {
      for (const difficulty of [0, 1, 2] as const) {
        for (const perTeam of [2, 3] as const) {
          const s = quickSetup(prefs(), { perTeam, difficulty, opponent: team.id, court: null }, seededRng(6));
          const built = buildMatch(s);
          expect(built.lineup).toHaveLength(perTeam * 2);
          expect(new Set(built.lineup.map((l) => l.def.id)).size).toBe(perTeam * 2);
          expect(built.colors[0]).not.toBe(built.colors[1]);
        }
      }
    }
  });
});

describe('a ladder game', () => {
  it('never draws the captain’s own team', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const s = ladderSetup(prefs(), (seed * 37) % 2200, seed % 2 === 0 ? 2 : 3, seededRng(seed));
      expect(s.mode).toBe('ladder');
      expect(s.away.kitTeam).not.toBe('comets');
      expect(shares(s.away, s.home)).toBe(false);
      expect(s.court).toBe(teamById(s.away.kitTeam).court);
    }
  });

  it('matches the tier for difficulty and opponent level', () => {
    for (const tier of TIERS) {
      const s = ladderSetup(prefs(), tier.floor, 3, seededRng(7));
      expect(s.difficulty).toBe(tier.difficulty);
      expect(s.away.players.every((p) => p.level === tier.level)).toBe(true);
    }
  });

  it('sends tougher squads as you climb', () => {
    const strength = (points: number) => {
      let total = 0;
      for (let seed = 1; seed <= 200; seed++) total += sideOverall(ladderSetup(prefs(), points, 3, seededRng(seed)).away, 3);
      return total / 200;
    };
    const perTier = TIERS.map((tier) => strength(tier.floor));
    for (let i = 1; i < perTier.length; i++) expect(perTier[i]).toBeGreaterThanOrEqual(perTier[i - 1]);
    expect(perTier[perTier.length - 1] - perTier[0]).toBeGreaterThan(12);
  });

  it('still meets a handful of different teams at every tier', () => {
    for (const tier of TIERS) {
      const met = new Set<string>();
      for (let seed = 1; seed <= 200; seed++) met.add(ladderSetup(prefs(), tier.floor, 2, seededRng(seed)).away.kitTeam);
      expect(met.size).toBeGreaterThanOrEqual(5);
    }
  });

  it('keeps a mixed squad away from its own players', () => {
    const squad: SidePlayer[] = [
      { id: 'kai-nakoa', level: 2 },
      { id: 'jax-monroe', level: 1 },
      { id: 'ace-carter', level: 1 },
    ];
    for (let seed = 1; seed <= 300; seed++) {
      const s = ladderSetup(prefs({ squad }), 1900, 3, seededRng(seed));
      expect(s.away.kitTeam).not.toBe('waves');
      expect(shares(s.away, s.home)).toBe(false);
    }
  });
});

describe('a tour game', () => {
  it('starts away from home', () => {
    const s = tourSetup(prefs(), 'neighborhood', 0, 0, seededRng(8));
    expect(s).not.toBeNull();
    expect(s?.mode).toBe('tour');
    expect(s?.away.kitTeam).toBe('stompers');
    expect(s?.court).toBe(teamById('stompers').court);
    expect(s?.perTeam).toBe(2);
    expect(s?.tour).toEqual({ tourId: 'neighborhood', stage: 0, game: 0 });
  });

  it('says no to a stop or game that does not exist', () => {
    expect(tourSetup(prefs(), 'neighborhood', 99, 0)).toBeNull();
    expect(tourSetup(prefs(), 'neighborhood', 0, 9)).toBeNull();
    expect(tourSetup(prefs(), 'neighborhood', -1, 0)).toBeNull();
  });

  it('never puts your own players on the other side, even at home', () => {
    for (const home of ['comets', 'stompers', 'waves', 'skyhawks', 'yetis', 'coyotes']) {
      const squad = teamPlayers(home)
        .filter((p) => p.rarity === 'common')
        .map((p) => ({ id: p.id, level: 1 }));
      const p = prefs({ squad, homeTeam: home });
      const tour = toursFor(home)[0];
      tour.stages.forEach((stage, st) => {
        stage.games.forEach((game, g) => {
          const s = tourSetup(p, tour.id, st, g, seededRng(9));
          expect(s).not.toBeNull();
          if (!s) return;
          expect(shares(s.away, s.home)).toBe(false);
          expect(s.away.players).toHaveLength(game.opponents.length);
          expect(new Set(ids(s.away)).size).toBe(game.opponents.length);
          expect(s.away.players.length).toBeGreaterThanOrEqual(s.perTeam);
        });
      });
    }
  });

  it('opens against a side a brand new squad can beat', () => {
    for (const home of ['comets', 'stompers', 'waves', 'skyhawks', 'yetis', 'coyotes']) {
      const squad = teamPlayers(home)
        .filter((p) => p.rarity === 'common')
        .sort((a, b) => playerOverall(b) - playerOverall(a))
        .map((p) => ({ id: p.id, level: 1 }));
      const s = tourSetup(prefs({ squad, homeTeam: home }), 'neighborhood', 0, 0, seededRng(10));
      expect(s).not.toBeNull();
      if (!s) return;
      expect(s.away.kitTeam).not.toBe(home);
      // within a few points of the starters, and the computer plays at its gentlest
      expect(sideOverall(s.away, 2) - sideOverall(s.home, 2)).toBeLessThanOrEqual(6);
      expect(s.difficulty).toBeLessThan(0.25);
    }
  });
});

describe('teammates', () => {
  it('lifts a squad that plays for the same team', () => {
    expect(chemistry(['wren-kowalski', 'pippa-quinn', 'gus-moretti'])).toBe(3);
    expect(chemistry(['wren-kowalski', 'pippa-quinn', 'kai-nakoa'])).toBe(1);
    expect(chemistry(['wren-kowalski', 'jax-monroe', 'kai-nakoa'])).toBe(0);
    expect(chemistry(['wren-kowalski', 'pippa-quinn'])).toBe(1);
    expect(chemistry([])).toBe(0);
  });
});

describe('uniforms', () => {
  it('keeps the two teams easy to tell apart in every pairing', () => {
    for (const home of TEAMS) {
      for (const away of TEAMS) {
        const kit = kitAgainst(home, away);
        expect(colorGap(home.kit.jersey, kit.jersey)).toBeGreaterThanOrEqual(0.42);
        // visitors only change when they have to
        if (home.id !== away.id && !kitsClash(home, away)) expect(kit).toBe(away.kit);
      }
    }
  });

  it('puts the visitors in white when their change strip looks like the home team too', () => {
    const home = teamById('comets');
    const twin = { ...home, id: 'twins', kit: { ...home.kit, trim: home.kit.jersey } };
    const kit = kitAgainst(home, twin);
    expect(kit.jersey).toBe('#FFFFFF');
    expect(kit.number).not.toBe('#FFFFFF');
  });
});
