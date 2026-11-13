/**
 * Uniforms the whole squad can wear. Every team has its own, which you earn by collecting its players, and a
 * few special designs are made up for the game and bought with coins. A uniform is a set of colours only:
 * the shapes (tank top, shorts, shoes) come from the kit renderer as they always have.
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

/** Every team's own uniform, in roster order (a family build's extra league included). */
export const TEAM_UNIFORMS: readonly UniformDef[] = TEAMS.map(teamUniform);

export const ALL_UNIFORMS: readonly UniformDef[] = [...SPECIAL_UNIFORMS, ...TEAM_UNIFORMS];

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
