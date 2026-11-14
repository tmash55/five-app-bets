/**
 * A family build can carry a second league (see metro.config.js). No such pack
 * is ever committed, so these tests plug in a made-up one to keep that path
 * working: its teams, its tour, its packs and its home teams.
 */

import { HAS_EXTRA_ROSTER, LEAGUES, PLAYERS, leagueOf, leagueTeams, mustPlayer, playerOverall, teamById } from '@/data/roster';
import { homeTeamChoices, newSave, startCareer, starterIds, startersOf } from '@/state/logic';

import { openPack, packById, teamPackId } from '../packs';
import { seededRng } from '../rng';
import { playableTeams, quickSetup, type Prefs } from '../setups';
import { preferredTour, toursFor } from '../tour';

jest.mock('@roster-extra', () => {
  const raw = jest.requireActual('../../data/roster.json');
  const kit = raw.teams[0].kit;
  const look = raw.players[0].look;
  const team = (id: string, more: object) => ({ id, name: id.toUpperCase(), place: 'Somewhere', short: id.toUpperCase(), color: '#112233', color2: '#DDEEFF', kit, court: 'park', league: 'extra', ...more });
  const player = (id: string, teamId: string, rarity: string, v: number) => ({ id, name: `Extra ${id}`, team: teamId, number: 7, rarity, era: 'now', role: 'All-Around', ratings: { speed: v, shot: v, dunk: v, handle: v, steal: v, block: v }, look, blurb: '' });
  return {
    EXTRA_ROSTER: {
      id: 'extra',
      name: 'Extra League',
      teams: [team('xa', { starters: ['xa-2', 'xa-4', 'xa-3'], star: 'xa-1' }), team('xb', {})],
      players: [
        player('xa-1', 'xa', 'legend', 95),
        player('xa-2', 'xa', 'epic', 82),
        player('xa-3', 'xa', 'rare', 74),
        player('xa-4', 'xa', 'common', 64),
        player('xb-1', 'xb', 'legend', 90),
        player('xb-2', 'xb', 'epic', 80),
        player('xb-3', 'xb', 'rare', 72),
        player('xb-4', 'xb', 'common', 62),
      ],
    },
  };
});

const prefs = (ids: string[]): Prefs => ({ squad: ids.map((id) => ({ id, level: 1 })), quarterSeconds: 60, easyShots: false, homeTeam: 'xa' });

describe('a build with an extra league', () => {
  it('adds the league and its players next to the neighborhood', () => {
    expect(HAS_EXTRA_ROSTER).toBe(true);
    expect(LEAGUES.map((l) => l.id)).toEqual(['neighborhood', 'extra']);
    expect(leagueTeams('extra').map((t) => t.id)).toEqual(['xa', 'xb']);
    expect(PLAYERS.filter((p) => p.team === 'xa')).toHaveLength(4);
    expect(leagueOf('xa')).toBe('extra');
    expect(leagueOf('comets')).toBe('neighborhood');
    expect(leagueOf(null)).toBe('neighborhood');
    expect(leagueOf('no-such-team')).toBe('neighborhood');
  });

  it('lets a team that names three starters be a home team', () => {
    const ids = homeTeamChoices().map((t) => t.id);
    expect(ids).toContain('xa');
    // one everyday player and no named starters: not a home team
    expect(ids).not.toContain('xb');
    expect(ids).toContain('comets');
    expect(starterIds('xa')).toEqual(['xa-2', 'xa-3', 'xa-4']);
    const s = startCareer(newSave(), 'xa');
    expect(s.homeTeam).toBe('xa');
    expect(s.squad).toEqual(['xa-2', 'xa-3', 'xa-4']);
    expect(Object.keys(s.owned).sort()).toEqual(['xa-2', 'xa-3', 'xa-4']);
  });

  it('gives the league its own tour, weakest team first, with the named star as the prize', () => {
    const tours = toursFor(null);
    expect(tours.map((t) => t.id)).toEqual(['neighborhood', 'extra']);
    const extra = tours[1];
    expect(extra.name).toBe('Extra League Tour');
    expect(extra.stages.map((s) => s.team.id)).toEqual(['xb', 'xa']);
    const prize = (stage: number) => extra.stages[stage].games.find((g) => g.unlock)?.unlock;
    // no star named: the best player who is not a Legend
    expect(prize(0)).toBe('xb-2');
    // the named star, Legend or not, leads the last game
    expect(prize(1)).toBe('xa-1');
    expect(extra.stages[1].games[2].opponents.map((p) => p.id)).toEqual(['xa-1', 'xa-2', 'xa-3']);
    // the neighborhood tour is the same as ever
    expect(tours[0].stages).toHaveLength(8);
  });

  it('opens on the home league’s tour while it has games left', () => {
    const tours = toursFor('xa');
    expect(preferredTour(tours, {}, 'extra').id).toBe('extra');
    expect(preferredTour(tours, {}, 'neighborhood').id).toBe('neighborhood');
    const done: Record<string, number> = {};
    tours[1].stages.forEach((s, i) => s.games.forEach((_, g) => (done[`extra/${i}/${g}`] = 3)));
    expect(preferredTour(tours, done, 'extra').id).toBe('neighborhood');
    tours[0].stages.forEach((s, i) => s.games.forEach((_, g) => (done[`neighborhood/${i}/${g}`] = 3)));
    expect(preferredTour(tours, done, 'extra').id).toBe('extra');
  });

  it('puts the extra players in shop packs and gives each team its own pack', () => {
    const rng = seededRng(11);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) for (const c of openPack(packById('legend'), {}, rng).cards) seen.add(mustPlayer(c.playerId).team);
    expect(seen.has('xa')).toBe(true);
    expect(seen.has('comets')).toBe(true);
    const pack = packById(teamPackId('xb'));
    expect(pack.name).toBe('XB Pack');
    for (let i = 0; i < 50; i++) for (const c of openPack(pack, {}, rng).cards) expect(mustPlayer(c.playerId).team).toBe('xb');
  });

  it('keeps a surprise quick game inside the league you are looking at', () => {
    const rng = seededRng(5);
    expect(playableTeams(3).map((t) => t.id)).toEqual(expect.arrayContaining(['xa', 'xb', 'comets']));
    for (let i = 0; i < 40; i++) {
      const extra = quickSetup(prefs(['dash-bennett', 'pippa-quinn', 'gus-moretti']), { perTeam: 3, difficulty: 1, opponent: null, court: null, league: 'extra' }, rng);
      expect(teamById(extra.away.kitTeam).league).toBe('extra');
      const home = quickSetup(prefs(['xa-2', 'xa-3', 'xa-4']), { perTeam: 2, difficulty: 0, opponent: null, court: null, league: 'neighborhood' }, rng);
      expect(teamById(home.away.kitTeam).league).toBe('neighborhood');
    }
    // a league this build does not have falls back to every team
    const any = quickSetup(prefs(['xa-2', 'xa-3', 'xa-4']), { perTeam: 3, difficulty: 2, opponent: null, court: null, league: 'gone' }, rng);
    expect(any.away.players).toHaveLength(3);
    // and you never face your own players
    const mirror = quickSetup(prefs(['xa-1', 'xa-2', 'xa-3']), { perTeam: 3, difficulty: 2, opponent: 'xa', court: null, league: 'extra' }, rng);
    expect(mirror.away.players.filter((p) => ['xa-1', 'xa-2', 'xa-3'].includes(p.id)).length).toBeLessThan(3);
  });
});

describe('named starters', () => {
  const comets = teamById('comets');
  const roster = PLAYERS.filter((p) => p.team === 'comets');
  const best = [...roster].sort((a, b) => playerOverall(b) - playerOverall(a));
  const ovr = (ids: string[] | null) => (ids ?? []).map((id) => playerOverall(mustPlayer(id)));

  it('uses the three players a team names, best first', () => {
    const named = [best[2].id, best[0].id, best[1].id];
    const got = startersOf({ ...comets, starters: named }, roster);
    expect([...(got ?? [])].sort()).toEqual([...named].sort());
    expect(ovr(got)).toEqual([...ovr(got)].sort((a, b) => b - a));
  });

  it('falls back to the everyday players when the list is short, repeats someone or names a stranger', () => {
    const usual = startersOf(comets, roster);
    expect(usual).toHaveLength(3);
    for (const id of usual ?? []) expect(mustPlayer(id).rarity).toBe('common');
    expect(startersOf({ ...comets, starters: [best[0].id, best[1].id] }, roster)).toEqual(usual);
    expect(startersOf({ ...comets, starters: [best[0].id, best[0].id, best[1].id] }, roster)).toEqual(usual);
    expect(startersOf({ ...comets, starters: [best[0].id, best[1].id, 'jax-monroe'] }, roster)).toEqual(usual);
  });

  it('says no for a team with neither', () => {
    const legends = teamById('legends');
    expect(startersOf(legends, PLAYERS.filter((p) => p.team === 'legends'))).toBeNull();
  });
});
