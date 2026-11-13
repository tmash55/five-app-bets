/** Matches with the squad in a uniform it picked: what each side wears, and which colours stand for it. */

import { KIT_CLASH, colorGap, mustPlayer, teamById } from '@/data/roster';
import { teamUniformId, uniformById } from '@/data/uniforms';
import { prefsFrom } from '@/state/play';
import { newSave, startCareer } from '@/state/logic';

import { buildMatch, sideWear, type MatchSetup, type SidePlayer } from '../match';
import { seededRng } from '../rng';
import { homeSide, ladderSetup, quickSetup, teamSide, tourSetup, type Prefs } from '../setups';

// the save's store keeps itself on the device: an in-memory stand-in for the test
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

/** three Comets, the first of whom has shoes of his own */
const SQUAD: SidePlayer[] = [
  { id: 'dash-bennett', level: 1 },
  { id: 'wren-kowalski', level: 1 },
  { id: 'pippa-quinn', level: 1 },
];

const prefs = (uniform?: string | null): Prefs => ({ squad: SQUAD, quarterSeconds: 60, easyShots: true, homeTeam: 'comets', uniform });

function versus(opponent: string, uniform?: string): MatchSetup {
  return quickSetup(prefs(uniform), { perTeam: 3, difficulty: 0, opponent, court: null }, seededRng(4));
}

const kitOf = (id: string) => {
  const u = uniformById(id);
  if (!u) throw new Error(`no uniform ${id}`);
  return u.kit;
};

describe('picking the uniform for a match', () => {
  it('puts the saved uniform on your side in every kind of game', () => {
    expect(quickSetup(prefs('lava-flow'), { perTeam: 2, difficulty: 0, opponent: null, court: null }, seededRng(1)).home.uniform).toBe('lava-flow');
    expect(ladderSetup(prefs('lava-flow'), 0, 2, seededRng(1)).home.uniform).toBe('lava-flow');
    expect(tourSetup(prefs('lava-flow'), 'neighborhood', 0, 0, seededRng(1))?.home.uniform).toBe('lava-flow');
    // the opponents never wear it
    expect(versus('waves', 'lava-flow').away.uniform).toBeUndefined();
  });

  it('reads the uniform from the save', () => {
    const s = { ...startCareer(newSave(), 'comets'), uniforms: ['ice-pop'], uniform: 'ice-pop' };
    expect(prefsFrom(s).uniform).toBe('ice-pop');
    expect(prefsFrom(startCareer(newSave(), 'comets')).uniform).toBeNull();
  });

  it('leaves the captain’s colours on when nothing is picked', () => {
    expect(homeSide(SQUAD)).not.toHaveProperty('uniform');
    expect(homeSide(SQUAD, null)).not.toHaveProperty('uniform');
    expect(sideWear(homeSide(SQUAD)).kit).toBe(teamById('comets').kit);
    // a uniform this build does not have is the captain's colours too, not an error
    const missing = homeSide(SQUAD, teamUniformId('a-pack-team'));
    expect(sideWear(missing).kit).toBe(teamById('comets').kit);
    expect(() => buildMatch({ ...versus('waves'), home: missing })).not.toThrow();
  });
});

describe('a match in a uniform', () => {
  it('dresses the whole squad in it, with the HUD in its colour', () => {
    const m = buildMatch(versus('waves', 'lava-flow'));
    const lava = kitOf('lava-flow');
    const home = m.lineup.map((l, i) => ({ l, look: m.visuals.looks[i] })).filter((x) => x.l.team === 0);
    expect(home).toHaveLength(3);
    // a special is nobody's own team: no personal touches, every player exactly in its colours
    for (const { look } of home) expect(look.kit).toEqual(lava);
    expect(m.colors[0]).toBe(lava.jersey);
    expect(m.visuals.teamColors).toEqual(m.colors);
  });

  it('keeps personal touches only in the players’ own team’s uniform', () => {
    const dashLook = (uniform?: string) => {
      const m = buildMatch(versus('yetis', uniform));
      return m.visuals.looks[m.lineup.findIndex((l) => l.def.id === 'dash-bennett')];
    };
    const own = mustPlayer('dash-bennett').look.kit ?? {};
    expect(Object.keys(own).length).toBeGreaterThan(0);
    // the captain's colours, and the Comets uniform picked by hand: his own team, his own shoes
    expect(dashLook().kit).toEqual({ ...teamById('comets').kit, ...own });
    expect(dashLook(teamUniformId('comets')).kit).toEqual({ ...teamById('comets').kit, ...own });
    // another team's uniform: plain
    expect(dashLook(teamUniformId('stompers')).kit).toEqual(teamById('stompers').kit);
  });

  it('switches the visitors to their change strip when they look like the uniform', () => {
    // Comets players in the Waves' uniform, against the Waves: the same jersey
    const m = buildMatch(versus('waves', teamUniformId('waves')));
    const homeKit = teamById('waves').kit;
    const away = m.visuals.looks[m.lineup.findIndex((l) => l.team === 1)].kit;
    expect(m.visuals.looks[0].kit).toEqual(homeKit);
    expect(away?.jersey).not.toBe(homeKit.jersey);
    expect(colorGap(homeKit.jersey, away?.jersey ?? '')).toBeGreaterThanOrEqual(KIT_CLASH);
    expect(colorGap(m.colors[0], m.colors[1])).toBeGreaterThanOrEqual(0.35);
  });

  it('lets the visitors keep their own colours when the uniform does not clash', () => {
    // in their captain's colours the Comets would face the Comets in a change strip; in Lemon Zap they need not
    const plain = buildMatch({ ...versus('comets'), away: teamSide(teamById('comets'), 3, 0, 1) });
    const zap = buildMatch({ ...versus('comets', 'lemon-zap'), away: teamSide(teamById('comets'), 3, 0, 1) });
    const awayKit = (m: ReturnType<typeof buildMatch>) => m.visuals.looks[m.lineup.findIndex((l) => l.team === 1)].kit;
    expect(awayKit(plain)?.jersey).not.toBe(teamById('comets').kit.jersey);
    expect(awayKit(zap)?.jersey).toBe(teamById('comets').kit.jersey);
  });
});
