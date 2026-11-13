/**
 * Everyone you can collect: the neighborhood league that ships with the game,
 * plus an optional extra pack that only exists on a family build machine
 * (see metro.config.js).
 */

import { EXTRA_ROSTER } from '@roster-extra';

import { hexToRgb, luminance, type KitColors, type Look } from '../game/kit/look';
import { overall, type Ratings } from '../game/sim/ratings';
import { CARD_ART, HEAD_ART } from './cardArt';
import raw from './roster.json';
import type { PlayerDef, Rarity, RosterPack, TeamDef } from './types';

const NEIGHBORHOOD = raw as unknown as RosterPack;

export const ROSTER_PACKS: readonly RosterPack[] = EXTRA_ROSTER ? [NEIGHBORHOOD, EXTRA_ROSTER] : [NEIGHBORHOOD];

/** True on a family build that carries the extra pack. */
export const HAS_EXTRA_ROSTER = EXTRA_ROSTER !== null;

export const TEAMS: readonly TeamDef[] = ROSTER_PACKS.flatMap((p) => p.teams);
export const PLAYERS: readonly PlayerDef[] = ROSTER_PACKS.flatMap((p) => p.players);

const TEAM_BY_ID = new Map(TEAMS.map((t) => [t.id, t]));
const PLAYER_BY_ID = new Map(PLAYERS.map((p) => [p.id, p]));
const CARDS: Record<string, number> = { ...CARD_ART, ...(EXTRA_ROSTER?.art ?? {}) };
const HEADS: Record<string, number> = { ...HEAD_ART, ...(EXTRA_ROSTER?.heads ?? {}) };

export function teamById(id: string): TeamDef {
  const t = TEAM_BY_ID.get(id);
  if (!t) throw new Error(`Unknown team ${id}`);
  return t;
}

export function playerById(id: string): PlayerDef | undefined {
  return PLAYER_BY_ID.get(id);
}

export function mustPlayer(id: string): PlayerDef {
  const p = PLAYER_BY_ID.get(id);
  if (!p) throw new Error(`Unknown player ${id}`);
  return p;
}

/** The short name shouted in a match: "Dash" for Dash Bennett. */
export function shortName(p: PlayerDef): string {
  return p.short ?? p.name.split(' ')[0];
}

export function teamPlayers(teamId: string): PlayerDef[] {
  return PLAYERS.filter((p) => p.team === teamId);
}

export function leagueTeams(league: string): TeamDef[] {
  return TEAMS.filter((t) => t.league === league);
}

export const LEAGUES: readonly { id: string; name: string }[] = ROSTER_PACKS.map((p) => ({ id: p.id, name: p.name }));

/** The league a team plays in: the first league for no team, or one this build does not know. */
export function leagueOf(teamId: string | null): string {
  return (teamId !== null ? TEAM_BY_ID.get(teamId)?.league : undefined) ?? LEAGUES[0].id;
}

export function cardArt(id: string): number | undefined {
  return CARDS[id];
}

export function headArt(id: string): number | undefined {
  return HEADS[id];
}

/** Rating points a player gains for each level above the first. */
export const LEVEL_BONUS = 2;
export const MAX_LEVEL = 5;

export function levelBonus(level: number): number {
  return (Math.max(1, Math.min(MAX_LEVEL, level)) - 1) * LEVEL_BONUS;
}

export function boosted(r: Ratings, bonus: number): Ratings {
  const up = (v: number) => Math.min(99, v + bonus);
  return { speed: up(r.speed), shot: up(r.shot), dunk: up(r.dunk), handle: up(r.handle), steal: up(r.steal), block: up(r.block) };
}

export function playerOverall(p: PlayerDef, level = 1): number {
  return overall(boosted(p.ratings, levelBonus(level)));
}

const RARITY_ORDER: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legend: 3 };

/** Best first: rarity, then overall, then name. */
export function byValue(a: PlayerDef, b: PlayerDef): number {
  return RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity] || overall(b.ratings) - overall(a.ratings) || a.name.localeCompare(b.name);
}

// ---------------------------------------------------------------------------
// Uniforms
// ---------------------------------------------------------------------------

const WHITE = '#FFFFFF';
/** jerseys closer than this are too alike to tell two teams apart */
const CLASH = 0.42;

/** How different two colours are: 0 for the same colour, about 1.7 for black against white. */
export function colorGap(a: string, b: string): number {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/** The change strip a team wears when both teams would look alike. */
export function awayKit(kit: KitColors): KitColors {
  const jersey = kit.trim;
  const light = luminance(jersey) > 0.55;
  const dark = [kit.jersey, kit.shorts, kit.number].reduce((best, c) => (luminance(c) < luminance(best) ? c : best));
  const number = colorGap(kit.jersey, jersey) > 0.5 ? kit.jersey : light ? dark : WHITE;
  return {
    ...kit,
    jersey,
    trim: kit.jersey,
    number,
    shorts: jersey,
    shortsTrim: kit.jersey,
    shoeAccent: kit.jersey,
    band: kit.jersey,
  };
}

export function kitsClash(home: TeamDef, away: TeamDef): boolean {
  return colorGap(home.kit.jersey, away.kit.jersey) < CLASH;
}

/** A plain white strip with the team's darkest colour for trim and numbers. */
function whiteKit(kit: KitColors): KitColors {
  const dark = [kit.jersey, kit.trim, kit.shorts].reduce((best, c) => (luminance(c) < luminance(best) ? c : best));
  return { ...kit, jersey: WHITE, trim: dark, number: dark, shorts: WHITE, shortsTrim: dark, shoeAccent: dark, band: dark };
}

/**
 * What the visitors wear: their own uniform when the two teams are easy to
 * tell apart, otherwise their change strip, or a plain white one when that
 * looks like the home team as well.
 */
export function kitAgainst(home: TeamDef, away: TeamDef): KitColors {
  if (home.id !== away.id && !kitsClash(home, away)) return away.kit;
  const gap = (kit: KitColors) => colorGap(home.kit.jersey, kit.jersey);
  const options = [awayKit(away.kit), whiteKit(away.kit)];
  return options.find((kit) => gap(kit) >= CLASH) ?? options.reduce((best, kit) => (gap(kit) > gap(best) ? kit : best));
}

/** The colour that stands for a team on the court (rings, arrows) and in the HUD. */
export function matchColors(home: TeamDef, away: TeamDef): [string, string] {
  const a = home.color;
  let b = away.color;
  if (colorGap(a, b) < 0.4) b = colorGap(a, away.color2) > 0.4 ? away.color2 : WHITE;
  return [a, b];
}

/** A player dressed in any uniform (your squad wears its captain's colours). */
export function lookInKit(player: PlayerDef, kit: KitColors): Look {
  return { ...player.look, number: String(player.number), kit };
}

/** A player's full look: their own face and hair, their team's uniform, their number. */
export function lookFor(player: PlayerDef, useAwayKit = false): Look {
  const team = teamById(player.team);
  const base = useAwayKit ? awayKit(team.kit) : team.kit;
  // personal touches (favourite shoes) only apply to the home strip
  const kit = useAwayKit ? base : { ...base, ...(player.look.kit ?? {}) };
  return { ...player.look, number: String(player.number), kit };
}
