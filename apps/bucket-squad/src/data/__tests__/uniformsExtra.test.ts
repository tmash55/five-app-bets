/**
 * A family build's extra league brings its teams' uniforms with it, without a word about those teams in the
 * code. These tests plug in a made-up pack (no real pack is ever committed) with a full team and a small one.
 */

import { buyUniform, newSave, uniformProgress, wearUniform } from '@/state/logic';

import { TEAMS } from '../roster';
import { TEAM_UNIFORMS, teamUniformId, uniformById } from '../uniforms';

jest.mock('@roster-extra', () => {
  const raw = jest.requireActual('../roster.json');
  const kit = { ...raw.teams[0].kit, jersey: '#123456' };
  const look = raw.players[0].look;
  const team = (id: string) => ({ id, name: `Team ${id}`, place: 'Somewhere', short: id.toUpperCase(), color: '#123456', color2: '#ABCDEF', kit, court: 'park', league: 'extra' });
  const player = (id: string, teamId: string) => ({ id, name: `Extra ${id}`, team: teamId, number: 9, rarity: 'common', era: 'now', role: 'All-Around', ratings: { speed: 60, shot: 60, dunk: 60, handle: 60, steal: 60, block: 60 }, look, blurb: '' });
  return {
    EXTRA_ROSTER: {
      id: 'extra',
      name: 'Extra League',
      teams: [team('xa'), team('xs')],
      players: [player('xa-1', 'xa'), player('xa-2', 'xa'), player('xa-3', 'xa'), player('xa-4', 'xa'), player('xs-1', 'xs'), player('xs-2', 'xs')],
    },
  };
});

describe('uniforms with an extra league', () => {
  it('lists every team of the pack, under its league', () => {
    expect(TEAM_UNIFORMS).toHaveLength(TEAMS.length);
    expect(uniformById(teamUniformId('xa'))).toMatchObject({ kind: 'team', team: 'xa', league: 'extra', name: 'Team xa', color: '#123456' });
    expect(uniformById(teamUniformId('comets'))?.league).toBe('neighborhood');
  });

  it('asks a team with fewer than three players for all of them', () => {
    const small = uniformById(teamUniformId('xs'));
    const full = uniformById(teamUniformId('xa'));
    if (!small || !full) throw new Error('missing uniforms');
    const save = (ids: string[]) => ({ ...newSave(), owned: Object.fromEntries(ids.map((id) => [id, 1])) });
    expect(uniformProgress(save(['xs-1']), small)).toEqual({ have: 1, need: 2, unlocked: false });
    expect(uniformProgress(save(['xs-1', 'xs-2']), small)).toEqual({ have: 2, need: 2, unlocked: true });
    expect(uniformProgress(save(['xa-1', 'xa-2']), full)).toEqual({ have: 2, need: 3, unlocked: false });
    const dressed = wearUniform(save(['xs-1', 'xs-2']), small.id);
    expect(dressed?.uniform).toBe(small.id);
    // a team uniform is earned, never bought
    expect(buyUniform({ ...save([]), coins: 99999 }, small.id)).toBeNull();
  });
});
