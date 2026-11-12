import type { KitColors, Look } from '../game/kit/look';
import type { CourtId } from '../game/render/court';
import type { Ratings } from '../game/sim/ratings';

export type Rarity = 'common' | 'rare' | 'epic' | 'legend';

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
  kit: KitColors;
  court: CourtId;
  /** which set of teams this one belongs to (the neighborhood league, or a pack's own league) */
  league: string;
}

export interface PlayerDef {
  id: string;
  name: string;
  nickname?: string;
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
}
