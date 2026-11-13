import type { KitColors, Look } from '../game/kit/look';
import type { CourtId } from '../game/render/court';
import type { Ratings } from '../game/sim/ratings';

export type Rarity = 'common' | 'rare' | 'epic' | 'legend';

export const RARITIES: readonly Rarity[] = ['common', 'rare', 'epic', 'legend'];

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legend: 'Legend',
};

/** "now" for today's players, "classic" for old-school ones */
export type Era = 'now' | 'classic';

export type Role = 'Sharpshooter' | 'High Flyer' | 'Speedster' | 'Playmaker' | 'Lockdown' | 'Big' | 'All-Around';

export interface TeamDef {
  id: string;
  /** "Rockets" */
  name: string;
  /** "Pinecone Park" */
  place: string;
  /** three letters for the scoreboard */
  short: string;
  /** main colour for badges, rings and menus */
  color: string;
  /** second colour for badges and trims */
  color2: string;
  kit: KitColors;
  court: CourtId;
  /** which set of teams this one belongs to (the neighborhood league, or a pack's own league) */
  league: string;
  /** one line about the team */
  motto?: string;
}

export interface PlayerDef {
  id: string;
  name: string;
  nickname?: string;
  /** the name on the back of the jersey, used in match callouts (the first name when missing) */
  short?: string;
  team: string;
  number: number;
  rarity: Rarity;
  era: Era;
  role: Role;
  ratings: Ratings;
  /** everything but the uniform, which comes from the team */
  look: Look;
  /** one line for the back of the card */
  blurb: string;
}

export interface RosterPack {
  id: string;
  name: string;
  teams: TeamDef[];
  players: PlayerDef[];
  /** card pictures for this pack's players, keyed by player id */
  art?: Record<string, number>;
  /** head shots for this pack's players, keyed by player id */
  heads?: Record<string, number>;
}
