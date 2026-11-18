/**
 * Uniforms the whole squad can wear. Every team has its own, which you earn by collecting its players, and a
 * few special designs are made up for the game and bought with coins. A uniform is a set of colours (and maybe a
 * print): the shapes (tank top, shorts, shoes) come from the kit renderer as they always have.
 *
 * A few more are limited editions, sold only on the days the Daily Shop features them, and a few holiday ones the Daily
 * Shop sells only in their own month. Some designs carry a printed pattern (`KitColors.print`) over their colours.
 *
 * Team uniforms come from `TEAMS`, so a family build's extra league brings its teams' uniforms with it and
 * nothing about those teams is ever written here.
 */

import type { KitColors } from '../game/kit/look';
import { TEAMS, teamPlayers } from './roster';
import type { Rarity, TeamDef } from './types';

export type UniformKind = 'team' | 'special';

export interface UniformDef {
  /** `team:<team id>` for a team's own, a plain name for a special */
  id: string;
  name: string;
  kind: UniformKind;
  /** the team whose uniform it is (team uniforms only) */
  team?: string;
  /** the league it is listed under: the team's own, or `SPECIAL_LEAGUE` */
  league: string;
  rarity: Rarity;
  kit: KitColors;
  /** main colour for rings, the HUD and menus, and a second one */
  color: string;
  color2: string;
  /** coins, for the specials */
  price?: number;
  /** one line about it */
  blurb?: string;
  /** a limited edition: sold only on the days the Daily Shop features it, never on the Uniforms page */
  limited?: boolean;
  /** a holiday edition (limited too): the month it is sold in, 1 for January to 12 for December */
  month?: number;
  /** the holiday it is for, in words ("Halloween") */
  holiday?: string;
}

/** What a side wears: the colours, and the team it belongs to when it is a team's own uniform. */
export interface Wear {
  id: string;
  kit: KitColors;
  color: string;
  color2: string;
  team?: string;
}

/** the league the made-up designs are listed under */
export const SPECIAL_LEAGUE = 'special';

/** how many of a team's players unlock its uniform (all of them, for a team with fewer) */
export const UNIFORM_TEAM_NEED = 3;

/** what a special costs, by how rare it is */
export const UNIFORM_PRICE: Record<Exclude<Rarity, 'common'>, number> = { rare: 500, epic: 1000, legend: 2000 };

const TEAM_PREFIX = 'team:';

export function teamUniformId(teamId: string): string {
  return `${TEAM_PREFIX}${teamId}`;
}

/** A team's own uniform. */
export function teamUniform(team: TeamDef): UniformDef {
  return { id: teamUniformId(team.id), name: team.name, kind: 'team', team: team.id, league: team.league, rarity: 'common', kit: team.kit, color: team.color, color2: team.color2 };
}

function special(id: string, name: string, rarity: Exclude<Rarity, 'common'>, color: string, kit: KitColors, blurb: string): UniformDef {
  return { id, name, kind: 'special', league: SPECIAL_LEAGUE, rarity, kit, color, color2: kit.trim, price: UNIFORM_PRICE[rarity], blurb };
}

/**
 * The made-up designs, cheapest first. Each jersey is far enough from every neighborhood team's (and from the
 * others) to look new on the court, and every number stands out from its jersey (see the uniforms tests).
 */
export const SPECIAL_UNIFORMS: readonly UniformDef[] = [
  special(
    'cotton-candy',
    'Cotton Candy',
    'rare',
    '#FF6EB4',
    { jersey: '#FF6EB4', trim: '#7FD8FF', number: '#25398F', shorts: '#7FD8FF', shortsTrim: '#FF6EB4', shoe: '#FFFFFF', shoeAccent: '#FF6EB4', sole: '#F4F1EA', sock: '#FFFFFF', band: '#7FD8FF' },
    'Pink and sky blue, sweet as the fair.',
  ),
  special(
    'ice-pop',
    'Ice Pop',
    'rare',
    '#70F0FF',
    { jersey: '#70F0FF', trim: '#FFFFFF', number: '#12408F', shorts: '#12408F', shortsTrim: '#70F0FF', shoe: '#FFFFFF', shoeAccent: '#12408F', sole: '#F4F1EA', sock: '#FFFFFF', band: '#70F0FF' },
    'Cool as a freezer treat on a hot day.',
  ),
  special(
    'lemon-zap',
    'Lemon Zap',
    'rare',
    '#FFE600',
    { jersey: '#FFE600', trim: '#16140A', number: '#16140A', shorts: '#16140A', shortsTrim: '#FFE600', shoe: '#FFE600', shoeAccent: '#16140A', sole: '#F4F1EA', sock: '#FFFFFF', band: '#16140A' },
    'Bright yellow and black. Nobody misses you.',
  ),
  special(
    'glow-stick',
    'Glow Stick',
    'epic',
    '#73FF1A',
    { jersey: '#73FF1A', trim: '#101410', number: '#101410', shorts: '#101410', shortsTrim: '#73FF1A', shoe: '#101410', shoeAccent: '#73FF1A', sole: '#73FF1A', sock: '#101410', band: '#73FF1A' },
    'Glow-in-the-dark green. Lights up any court.',
  ),
  special(
    'jungle-patrol',
    'Jungle Patrol',
    'epic',
    '#8DB31A',
    { jersey: '#668500', trim: '#D4C384', number: '#FFFFFF', shorts: '#3D2B12', shortsTrim: '#D4C384', shoe: '#3D2B12', shoeAccent: '#D4C384', sole: '#D4C384', sock: '#3D2B12', band: '#D4C384' },
    'Olive and sand, for sneaking past defenders.',
  ),
  special(
    'dragon-fruit',
    'Dragon Fruit',
    'epic',
    '#CC0099',
    { jersey: '#CC0099', trim: '#9CFF4A', number: '#FFFFFF', shorts: '#CC0099', shortsTrim: '#9CFF4A', shoe: '#FFFFFF', shoeAccent: '#9CFF4A', sole: '#F4F1EA', sock: '#FFFFFF', band: '#9CFF4A' },
    'Wild pink with a green bite.',
  ),
  special(
    'lava-flow',
    'Lava Flow',
    'legend',
    '#FF5A1F',
    { jersey: '#960000', trim: '#FF6A00', number: '#FFC83D', shorts: '#1C1210', shortsTrim: '#FF6A00', shoe: '#1C1210', shoeAccent: '#FF6A00', sole: '#3A2A24', sock: '#1C1210', band: '#FF6A00' },
    'Red hot and black as rock. It melts the rim.',
  ),
  special(
    'pixel-party',
    'Pixel Party',
    'legend',
    '#E000FF',
    { jersey: '#E000FF', trim: '#00F0D0', number: '#FFFFFF', shorts: '#1A0B3A', shortsTrim: '#00F0D0', shoe: '#1A0B3A', shoeAccent: '#00F0D0', sole: '#00F0D0', sock: '#FFFFFF', band: '#00F0D0' },
    'Purple and teal, straight out of an old arcade.',
  ),
];

/** what a limited edition costs on the day the Daily Shop features it */
export const LIMITED_UNIFORM_PRICE = 1500;

function limited(id: string, name: string, color: string, kit: KitColors, blurb: string): UniformDef {
  return { id, name, kind: 'special', league: SPECIAL_LEAGUE, rarity: 'epic', kit, color, color2: kit.trim, price: LIMITED_UNIFORM_PRICE, blurb, limited: true };
}

/**
 * Limited editions: made-up designs sold only in the Daily Shop, one at a time, each coming back only after all the
 * others have had their turn (see meta/shop). Once bought they are worn like any special. The colour wheel is crowded
 * by now, so each one is also told apart from its nearest neighbours by its shorts (see the uniforms tests).
 */
export const LIMITED_UNIFORMS: readonly UniformDef[] = [
  limited(
    'space-cadet',
    'Space Cadet',
    '#4D6BFF',
    { jersey: '#0000B3', trim: '#FFD24A', number: '#FFFFFF', shorts: '#FFD24A', shortsTrim: '#0000B3', shoe: '#FFFFFF', shoeAccent: '#FFD24A', sole: '#F4F1EA', sock: '#FFFFFF', band: '#FFD24A' },
    'Deep space blue and rocket gold. Ready for lift-off.',
  ),
  limited(
    'peach-fizz',
    'Peach Fizz',
    '#FFCC80',
    { jersey: '#FFCC80', trim: '#1FB5C9', number: '#0B5560', shorts: '#1FB5C9', shortsTrim: '#FFCC80', shoe: '#FFFFFF', shoeAccent: '#1FB5C9', sole: '#F4F1EA', sock: '#FFFFFF', band: '#1FB5C9' },
    'Peach soda with a fizzy blue splash.',
  ),
  limited(
    'slime-time',
    'Slime Time',
    '#00FF00',
    { jersey: '#00FF00', trim: '#6A1FB8', number: '#3A0A70', shorts: '#6A1FB8', shortsTrim: '#00FF00', shoe: '#6A1FB8', shoeAccent: '#00FF00', sole: '#00FF00', sock: '#FFFFFF', band: '#6A1FB8' },
    'Gooey green and grape purple. Totally slimy.',
  ),
  limited(
    'mint-chip',
    'Mint Chip',
    '#80FF99',
    { jersey: '#80FF99', trim: '#4A2C1A', number: '#4A2C1A', shorts: '#4A2C1A', shortsTrim: '#80FF99', shoe: '#FFFFFF', shoeAccent: '#4A2C1A', sole: '#F4F1EA', sock: '#FFFFFF', band: '#80FF99' },
    'Cool mint with chocolate chips. Scoop it up.',
  ),
  limited(
    'dino-bones',
    'Dino Bones',
    '#ADAD94',
    { jersey: '#ADAD94', trim: '#F4EBD0', number: '#3B2A1E', shorts: '#F4EBD0', shortsTrim: '#3B2A1E', shoe: '#3B2A1E', shoeAccent: '#F4EBD0', sole: '#F4EBD0', sock: '#F4EBD0', band: '#3B2A1E' },
    'Fossil grey and bone white. Stomp and roar.',
  ),
  limited(
    'sour-apple',
    'Sour Apple',
    '#BFFF4D',
    { jersey: '#BFFF4D', trim: '#E0115F', number: '#1F4D00', shorts: '#E0115F', shortsTrim: '#BFFF4D', shoe: '#FFFFFF', shoeAccent: '#E0115F', sole: '#F4F1EA', sock: '#FFFFFF', band: '#E0115F' },
    'Super sour green with a red apple bite.',
  ),
];

/**
 * Printed specials: bought with coins on the Uniforms page like the others, priced by rarity. The colour wheel was full
 * before them, so each is told apart by its print (no other design has that print in those colours), and every
 * number stands out from its jersey and from the print, which calms down behind it (see the uniforms tests).
 */
export const PRINTED_UNIFORMS: readonly UniformDef[] = [
  special(
    'tie-dye-swirl',
    'Tie-Dye Swirl',
    'rare',
    '#FF2D95',
    {
      jersey: '#FF2D95',
      trim: '#FFE600',
      number: '#1A0B3A',
      shorts: '#FF2D95',
      shortsTrim: '#FFE600',
      shoe: '#FFFFFF',
      shoeAccent: '#00C8FF',
      sole: '#F4F1EA',
      sock: '#FFFFFF',
      band: '#00C8FF',
      print: { style: 'tieDye', colors: ['#FFE600', '#00C8FF', '#8A2BFF'] },
    },
    'Pink, yellow, blue and purple, swirled like a summer camp shirt.',
  ),
  special(
    'sugar-stripes',
    'Sugar Stripes',
    'rare',
    '#FF3D8B',
    {
      jersey: '#FFF4F8',
      trim: '#FF3D8B',
      number: '#8A0040',
      shorts: '#FF3D8B',
      shortsTrim: '#FFF4F8',
      shoe: '#FFFFFF',
      shoeAccent: '#2ED3B7',
      sole: '#F4F1EA',
      sock: '#FFFFFF',
      band: '#2ED3B7',
      print: { style: 'candy', colors: ['#FF3D8B', '#2ED3B7', '#FF3D8B'] },
    },
    'Candy stripes in bubblegum pink and mint.',
  ),
  special(
    'lightning-strike',
    'Lightning Strike',
    'epic',
    '#3D6BFF',
    {
      jersey: '#1238FF',
      trim: '#FFE600',
      number: '#FFFFFF',
      shorts: '#0A1A66',
      shortsTrim: '#FFE600',
      shoe: '#0A1A66',
      shoeAccent: '#FFE600',
      sole: '#FFE600',
      sock: '#FFFFFF',
      band: '#FFE600',
      print: { style: 'lightning', colors: ['#FFE600', '#8CF6FF'] },
    },
    'Electric blue with bolts of yellow lightning. Zap!',
  ),
  special(
    'starry-galaxy',
    'Starry Galaxy',
    'legend',
    '#9B3DFF',
    {
      jersey: '#1C0B4A',
      trim: '#4DF0FF',
      number: '#FFFFFF',
      shorts: '#1C0B4A',
      shortsTrim: '#FF3DB8',
      shoe: '#1C0B4A',
      shoeAccent: '#4DF0FF',
      sole: '#9B3DFF',
      sock: '#FFFFFF',
      band: '#FF3DB8',
      print: { style: 'galaxy', colors: ['#9B3DFF', '#FF3DB8', '#4DF0FF'] },
    },
    'Purple and pink star clouds with stars all over. Out of this world.',
  ),
];

function holiday(id: string, name: string, month: number, day: string, color: string, kit: KitColors, blurb: string): UniformDef {
  return { ...limited(id, name, color, kit, blurb), month, holiday: day };
}

/**
 * Holiday editions: limited, sold only in the Daily Shop and only in their own month, where they take every other
 * limited-uniform day (see meta/shop). Each one wears a print, which tells it apart on the full colour wheel.
 */
export const HOLIDAY_UNIFORMS: readonly UniformDef[] = [
  holiday(
    'haunted-hoops',
    'Haunted Hoops',
    10,
    'Halloween',
    '#FF7A00',
    {
      jersey: '#FF7A00',
      trim: '#1A1024',
      number: '#1A1024',
      shorts: '#3D1466',
      shortsTrim: '#7CFF3B',
      shoe: '#1A1024',
      shoeAccent: '#FF7A00',
      sole: '#7CFF3B',
      sock: '#1A1024',
      band: '#7CFF3B',
      print: { style: 'web', colors: ['#1A1024', '#FFD23D'], shorts: false },
    },
    'Pumpkin orange with spooky spider webs. Boo!',
  ),
  holiday(
    'holly-jolly',
    'Holly Jolly',
    12,
    'Christmas',
    '#D4102B',
    {
      jersey: '#D4102B',
      trim: '#FFFFFF',
      number: '#FFFFFF',
      shorts: '#0E7A3A',
      shortsTrim: '#FFFFFF',
      shoe: '#FFFFFF',
      shoeAccent: '#D4102B',
      sole: '#F4F1EA',
      sock: '#FFFFFF',
      band: '#0E7A3A',
      print: { style: 'snow', colors: ['#FFFFFF', '#3DDC6B'] },
    },
    'Holiday red and green with snowflakes falling all over.',
  ),
  holiday(
    'snow-day',
    'Snow Day',
    1,
    'Winter',
    '#5EC8FF',
    {
      jersey: '#5EC8FF',
      trim: '#FFFFFF',
      number: '#0B2A6B',
      shorts: '#1E3A8A',
      shortsTrim: '#FFFFFF',
      shoe: '#FFFFFF',
      shoeAccent: '#1E3A8A',
      sole: '#F4F1EA',
      sock: '#FFFFFF',
      band: '#1E3A8A',
      print: { style: 'snow', colors: ['#FFFFFF', '#1E3A8A'] },
    },
    'Icy blue with big white flakes. No school today!',
  ),
];

/** Every team's own uniform, in roster order (a family build's extra league included). */
export const TEAM_UNIFORMS: readonly UniformDef[] = TEAMS.map(teamUniform);

/** Everything bought with coins on the Uniforms page: the plain specials, then the printed ones. */
export const COIN_UNIFORMS: readonly UniformDef[] = [...SPECIAL_UNIFORMS, ...PRINTED_UNIFORMS];

/** Everything only the Daily Shop sells: the limited editions, then the holiday ones. */
export const SHOP_ONLY_UNIFORMS: readonly UniformDef[] = [...LIMITED_UNIFORMS, ...HOLIDAY_UNIFORMS];

export const ALL_UNIFORMS: readonly UniformDef[] = [...COIN_UNIFORMS, ...SHOP_ONLY_UNIFORMS, ...TEAM_UNIFORMS];

const BY_ID = new Map(ALL_UNIFORMS.map((u) => [u.id, u]));

/** A uniform by id, or undefined for one this build does not have (a team from a pack that is not here). */
export function uniformById(id: string | null | undefined): UniformDef | undefined {
  return typeof id === 'string' ? BY_ID.get(id) : undefined;
}

/** How many players a team's uniform needs collected; 0 for a special. */
export function uniformNeed(def: UniformDef): number {
  return def.team !== undefined ? Math.min(UNIFORM_TEAM_NEED, teamPlayers(def.team).length) : 0;
}

export function wearOf(def: UniformDef): Wear {
  return { id: def.id, kit: def.kit, color: def.color, color2: def.color2, ...(def.team !== undefined ? { team: def.team } : {}) };
}

/** A team's own colours as something to wear: what a squad wears by default (its captain's team's). */
export function teamWear(team: TeamDef): Wear {
  return wearOf(teamUniform(team));
}
