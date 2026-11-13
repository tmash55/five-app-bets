import { hexToRgb } from '@/game/kit/look';

import { KIT_CLASH, TEAMS, colorGap, kitAgainst, teamPlayers } from '../roster';
import { ALL_UNIFORMS, SPECIAL_LEAGUE, SPECIAL_UNIFORMS, TEAM_UNIFORMS, UNIFORM_PRICE, UNIFORM_TEAM_NEED, teamUniformId, teamWear, uniformById, uniformNeed, wearOf } from '../uniforms';

/** how far apart two special jerseys are at least, so no two look like the same uniform */
const SPECIAL_GAP = 0.4;

/** WCAG contrast between two colours: 1 for the same colour, 21 for black on white */
function contrast(a: string, b: string): number {
  const lum = (h: string) => {
    const [r, g, bl] = hexToRgb(h).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => m - n);
  return (y + 0.05) / (x + 0.05);
}

describe('the uniforms', () => {
  it('has one id for each uniform', () => {
    const ids = ALL_UNIFORMS.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const u of ALL_UNIFORMS) expect(uniformById(u.id)).toBe(u);
    expect(uniformById('no-such-uniform')).toBeUndefined();
    expect(uniformById(null)).toBeUndefined();
    expect(uniformById(teamUniformId('gone'))).toBeUndefined();
  });

  it('gives every team its own uniform in its own colours', () => {
    expect(TEAM_UNIFORMS).toHaveLength(TEAMS.length);
    for (const team of TEAMS) {
      const u = uniformById(teamUniformId(team.id));
      expect(u).toMatchObject({ kind: 'team', team: team.id, league: team.league, rarity: 'common', name: team.name, color: team.color, color2: team.color2 });
      expect(u?.kit).toBe(team.kit);
      expect(u?.price).toBeUndefined();
      expect(u && uniformNeed(u)).toBe(Math.min(UNIFORM_TEAM_NEED, teamPlayers(team.id).length));
      expect(teamWear(team)).toEqual({ id: teamUniformId(team.id), kit: team.kit, color: team.color, color2: team.color2, team: team.id });
    }
  });

  it('has eight to ten specials with a price by rarity and a line about each', () => {
    expect(SPECIAL_UNIFORMS.length).toBeGreaterThanOrEqual(8);
    expect(SPECIAL_UNIFORMS.length).toBeLessThanOrEqual(10);
    for (const u of SPECIAL_UNIFORMS) {
      expect(u.kind).toBe('special');
      expect(u.team).toBeUndefined();
      expect(u.league).toBe(SPECIAL_LEAGUE);
      expect(u.rarity).not.toBe('common');
      expect(u.price).toBe(UNIFORM_PRICE[u.rarity as keyof typeof UNIFORM_PRICE]);
      expect(u.blurb?.length).toBeGreaterThan(0);
      expect(uniformNeed(u)).toBe(0);
      expect(wearOf(u).team).toBeUndefined();
      for (const c of [...Object.values(u.kit), u.color, u.color2]) expect(c).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('never names a special like a team', () => {
    const teamWords = TEAMS.flatMap((t) => [t.name, t.place, t.short]).map((w) => w.toLowerCase());
    for (const u of SPECIAL_UNIFORMS) {
      expect(teamWords).not.toContain(u.name.toLowerCase());
      for (const word of u.name.toLowerCase().split(' ')) expect(TEAMS.map((t) => t.name.toLowerCase())).not.toContain(word);
    }
    const names = SPECIAL_UNIFORMS.map((u) => u.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it('makes every special look new: far from every team jersey and from each other', () => {
    for (const u of SPECIAL_UNIFORMS) {
      for (const team of TEAMS.filter((t) => t.league === 'neighborhood')) expect(colorGap(u.kit.jersey, team.kit.jersey)).toBeGreaterThanOrEqual(KIT_CLASH);
      for (const other of SPECIAL_UNIFORMS) if (other !== u) expect(colorGap(u.kit.jersey, other.kit.jersey)).toBeGreaterThanOrEqual(SPECIAL_GAP);
    }
  });

  it('puts a number on every jersey that stands out from it', () => {
    for (const u of ALL_UNIFORMS.filter((x) => x.kind === 'special')) expect(contrast(u.kit.jersey, u.kit.number)).toBeGreaterThanOrEqual(3);
  });

  it('keeps every team easy to tell apart from a squad in any special', () => {
    for (const u of SPECIAL_UNIFORMS) {
      for (const team of TEAMS) expect(colorGap(u.kit.jersey, kitAgainst(wearOf(u), team).jersey)).toBeGreaterThanOrEqual(KIT_CLASH);
    }
  });
});
