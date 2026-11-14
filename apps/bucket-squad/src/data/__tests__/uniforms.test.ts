import { PRINT_STYLES, PRINT_UNDER_NUMBER, hexToRgb, mix, printId, type KitColors } from '@/game/kit/look';

import { KIT_CLASH, TEAMS, awayKit, colorGap, kitAgainst, teamPlayers } from '../roster';
import {
  ALL_UNIFORMS,
  COIN_UNIFORMS,
  HOLIDAY_UNIFORMS,
  LIMITED_UNIFORMS,
  LIMITED_UNIFORM_PRICE,
  PRINTED_UNIFORMS,
  SHOP_ONLY_UNIFORMS,
  SPECIAL_LEAGUE,
  SPECIAL_UNIFORMS,
  TEAM_UNIFORMS,
  UNIFORM_PRICE,
  type UniformDef,
  UNIFORM_TEAM_NEED,
  teamUniformId,
  teamWear,
  uniformById,
  uniformNeed,
  wearOf,
} from '../uniforms';

/** how far apart two special jerseys are at least, so no two look like the same uniform */
const SPECIAL_GAP = 0.4;
/**
 * The colour wheel is full by the time the limited editions come in: a limited one may sit a little nearer another
 * design's jersey than SPECIAL_GAP, but never nearer than this, and then its shorts must be far from that one's
 */
const LIMITED_GAP = 0.33;
const SHORTS_GAP = 0.5;

/** the plain designs (no print): the specials and the limited editions, told apart by their colours alone */
const PLAIN: readonly UniformDef[] = [...SPECIAL_UNIFORMS, ...LIMITED_UNIFORMS];
/** the printed designs: specials bought with coins, and the holiday editions */
const PRINTED: readonly UniformDef[] = [...PRINTED_UNIFORMS, ...HOLIDAY_UNIFORMS];
/** every design that is not a team's own */
const DESIGNS: readonly UniformDef[] = [...PLAIN, ...PRINTED];

/** every colour a kit names, its print's included */
function kitColors(kit: KitColors): string[] {
  const { print, ...plain } = kit;
  return [...Object.values(plain), ...(print?.colors ?? [])];
}

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

  it('has six to eight limited editions, sold only through the Daily Shop', () => {
    expect(LIMITED_UNIFORMS.length).toBeGreaterThanOrEqual(6);
    expect(LIMITED_UNIFORMS.length).toBeLessThanOrEqual(8);
    for (const u of LIMITED_UNIFORMS) {
      expect(u).toMatchObject({ kind: 'special', league: SPECIAL_LEAGUE, limited: true, price: LIMITED_UNIFORM_PRICE });
      expect(u.team).toBeUndefined();
      expect(u.blurb?.length).toBeGreaterThan(0);
      expect(uniformById(u.id)).toBe(u);
      for (const c of [...Object.values(u.kit), u.color, u.color2]) expect(c).toMatch(/^#[0-9A-F]{6}$/);
    }
    // the specials on the Uniforms page's buy list are never limited
    for (const u of SPECIAL_UNIFORMS) expect(u.limited).toBeUndefined();
  });

  it('never names a special or a limited edition like a team', () => {
    const teamWords = TEAMS.flatMap((t) => [t.name, t.place, t.short]).map((w) => w.toLowerCase());
    for (const u of DESIGNS) {
      expect(teamWords).not.toContain(u.name.toLowerCase());
      for (const word of u.name.toLowerCase().split(' ')) expect(TEAMS.map((t) => t.name.toLowerCase())).not.toContain(word);
    }
    const names = DESIGNS.map((u) => u.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it('makes every plain special look new: far from every team jersey and from each other', () => {
    for (const u of SPECIAL_UNIFORMS) {
      for (const team of TEAMS.filter((t) => t.league === 'neighborhood')) expect(colorGap(u.kit.jersey, team.kit.jersey)).toBeGreaterThanOrEqual(KIT_CLASH);
      for (const other of SPECIAL_UNIFORMS) if (other !== u) expect(colorGap(u.kit.jersey, other.kit.jersey)).toBeGreaterThanOrEqual(SPECIAL_GAP);
    }
  });

  it('makes every limited edition look new: far from every team jersey, and from every other plain design by its jersey or else its shorts too', () => {
    for (const u of LIMITED_UNIFORMS) {
      for (const team of TEAMS.filter((t) => t.league === 'neighborhood')) expect(colorGap(u.kit.jersey, team.kit.jersey)).toBeGreaterThanOrEqual(KIT_CLASH);
      for (const other of PLAIN) {
        if (other === u) continue;
        const jersey = colorGap(u.kit.jersey, other.kit.jersey);
        expect(jersey).toBeGreaterThanOrEqual(LIMITED_GAP);
        if (jersey < SPECIAL_GAP) expect(colorGap(u.kit.shorts, other.kit.shorts)).toBeGreaterThanOrEqual(SHORTS_GAP);
      }
    }
  });

  it('puts a number on every jersey that stands out from it', () => {
    const designs = ALL_UNIFORMS.filter((x) => x.kind === 'special');
    expect(designs).toHaveLength(DESIGNS.length);
    for (const u of designs) expect(contrast(u.kit.jersey, u.kit.number)).toBeGreaterThanOrEqual(3);
  });

  it('keeps every team easy to tell apart from a squad in any special or limited edition', () => {
    for (const u of DESIGNS) {
      for (const team of TEAMS) expect(colorGap(u.kit.jersey, kitAgainst(wearOf(u), team).jersey)).toBeGreaterThanOrEqual(KIT_CLASH);
    }
  });
});

describe('the printed uniforms', () => {
  it('prints tie-dye, galaxy, lightning and candy stripes on four specials bought with coins, priced by rarity', () => {
    expect(PRINTED_UNIFORMS.map((u) => u.kit.print?.style).sort()).toEqual(['candy', 'galaxy', 'lightning', 'tieDye']);
    for (const u of PRINTED_UNIFORMS) {
      expect(u).toMatchObject({ kind: 'special', league: SPECIAL_LEAGUE });
      expect(u.team).toBeUndefined();
      expect(u.limited).toBeUndefined();
      expect(u.month).toBeUndefined();
      expect(u.rarity).not.toBe('common');
      expect(u.price).toBe(UNIFORM_PRICE[u.rarity as keyof typeof UNIFORM_PRICE]);
      expect(u.blurb?.length).toBeGreaterThan(0);
      expect(uniformNeed(u)).toBe(0);
      expect(uniformById(u.id)).toBe(u);
      for (const c of [...kitColors(u.kit), u.color, u.color2]) expect(c).toMatch(/^#[0-9A-F]{6}$/);
    }
    // the Uniforms page sells the plain specials and the printed ones
    expect(COIN_UNIFORMS).toEqual([...SPECIAL_UNIFORMS, ...PRINTED_UNIFORMS]);
  });

  it('has a Halloween uniform for October and a Christmas one for December, limited and sold like the limited editions', () => {
    expect(HOLIDAY_UNIFORMS.find((u) => u.holiday === 'Halloween')?.month).toBe(10);
    expect(HOLIDAY_UNIFORMS.find((u) => u.holiday === 'Christmas')?.month).toBe(12);
    expect(HOLIDAY_UNIFORMS.length).toBeLessThanOrEqual(4);
    for (const u of HOLIDAY_UNIFORMS) {
      expect(u).toMatchObject({ kind: 'special', league: SPECIAL_LEAGUE, limited: true, price: LIMITED_UNIFORM_PRICE });
      expect(u.team).toBeUndefined();
      expect(Number.isInteger(u.month) && (u.month ?? 0) >= 1 && (u.month ?? 0) <= 12).toBe(true);
      expect(u.holiday?.length).toBeGreaterThan(0);
      expect(u.blurb?.length).toBeGreaterThan(0);
      expect(u.kit.print).toBeDefined();
      for (const c of [...kitColors(u.kit), u.color, u.color2]) expect(c).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(SHOP_ONLY_UNIFORMS).toEqual([...LIMITED_UNIFORMS, ...HOLIDAY_UNIFORMS]);
  });

  it('prints only the printed designs: every one of them, and never a plain design or a team uniform', () => {
    for (const u of PRINTED) expect(PRINT_STYLES).toContain(u.kit.print?.style);
    for (const u of [...PLAIN, ...TEAM_UNIFORMS]) expect(u.kit.print).toBeUndefined();
    for (const team of TEAMS) expect(team.kit.print).toBeUndefined();
  });

  it('tells every printed design apart: by its print, or by its jersey when two share a print', () => {
    for (const u of PRINTED) {
      for (const other of PRINTED) {
        if (other === u || other.kit.print?.style !== u.kit.print?.style) continue;
        expect(colorGap(u.kit.jersey, other.kit.jersey)).toBeGreaterThanOrEqual(SPECIAL_GAP);
      }
      // and each print shows: its first colour stands off the jersey
      expect(colorGap(u.kit.jersey, u.kit.print?.colors[0] ?? u.kit.jersey)).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('keeps the number easy to read over every print: the print calms down behind it', () => {
    expect(PRINT_UNDER_NUMBER).toBeGreaterThan(0);
    expect(PRINT_UNDER_NUMBER).toBeLessThanOrEqual(0.25);
    for (const u of PRINTED) {
      const print = u.kit.print;
      if (!print) throw new Error(`${u.id} has no print`);
      expect(contrast(u.kit.jersey, u.kit.number)).toBeGreaterThanOrEqual(3);
      // what is left of each print colour behind the number still leaves the number standing out
      for (const c of print.colors) expect(contrast(mix(u.kit.jersey, c, PRINT_UNDER_NUMBER), u.kit.number)).toBeGreaterThanOrEqual(3);
    }
  });

  it('never carries a print onto a change strip', () => {
    for (const u of PRINTED) {
      expect(awayKit(u.kit).print).toBeUndefined();
      for (const team of TEAMS) expect(kitAgainst(wearOf(u), team).print).toBeUndefined();
    }
  });

  it('numbers the prints for the shader: 0 for plain, one each from 1', () => {
    expect(printId(undefined)).toBe(0);
    const ids = PRINT_STYLES.map((style) => printId({ style, colors: ['#FFFFFF', '#000000'] }));
    expect(ids).toEqual(PRINT_STYLES.map((_, i) => i + 1));
  });
});
