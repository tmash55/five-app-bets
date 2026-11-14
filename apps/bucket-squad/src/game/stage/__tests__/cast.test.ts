import { mustPlayer, teamById } from '@/data/roster';
import { teamUniformId, uniformById } from '@/data/uniforms';

import { squadStage } from '../cast';

const SQUAD = ['dash-bennett', 'kai-nakoa', 'wren-kowalski'];

describe('the squad on the warm-up stage', () => {
  it('wears the captain’s team uniform when nothing is picked', () => {
    const group = squadStage(SQUAD).groups[0];
    const comets = teamById('comets');
    expect(group.kit).toBe(comets.kit);
    expect(group.color).toBe(comets.color);
    expect(group.court).toBe(comets.court);
    // the captain's own touches stay; a Waves player in the Comets' colours gets none
    expect(group.members[0].look.kit).toEqual({ ...comets.kit, ...(mustPlayer('dash-bennett').look.kit ?? {}) });
    expect(group.members[1].look.kit).toEqual(comets.kit);
    expect(squadStage(SQUAD, undefined, undefined, null).groups[0].kit).toBe(comets.kit);
  });

  it('wears the uniform the squad picked, on the captain’s home court', () => {
    const lava = uniformById('lava-flow');
    const group = squadStage(SQUAD, undefined, undefined, 'lava-flow').groups[0];
    expect(group.kit).toBe(lava?.kit);
    expect(group.color).toBe(lava?.color);
    expect(group.court).toBe(teamById('comets').court);
    for (const m of group.members) expect(m.look.kit).toEqual(lava?.kit);
  });

  it('gives the touches to the players whose team’s uniform it is', () => {
    const waves = teamById('waves');
    const group = squadStage(SQUAD, undefined, undefined, teamUniformId('waves')).groups[0];
    expect(group.kit).toBe(waves.kit);
    expect(group.members[1].look.kit).toEqual({ ...waves.kit, ...(mustPlayer('kai-nakoa').look.kit ?? {}) });
    expect(group.members[0].look.kit).toEqual(waves.kit);
  });

  it('falls back to the captain’s colours for a uniform this build does not have', () => {
    expect(squadStage(SQUAD, undefined, undefined, teamUniformId('a-pack-team')).groups[0].kit).toBe(teamById('comets').kit);
  });
});
