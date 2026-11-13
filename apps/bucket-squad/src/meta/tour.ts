/**
 * The Tour: visit every court, beat the home team three times, and win their
 * star player. Each league (the neighborhood, plus any extra pack) gets its
 * own tour.
 */

import { ROSTER_PACKS, playerOverall, teamPlayers } from '@/data/roster';
import type { PlayerDef, TeamDef } from '@/data/types';
import type { SidePlayer } from './match';
import { teamPackId } from './packs';

export interface TourGame {
  title: string;
  perTeam: 2 | 3;
  opponents: SidePlayer[];
  difficulty: number;
  /** coins for the first win */
  coins: number;
  /** pack for the first win */
  pack?: string;
  /** player won with the first win */
  unlock?: string;
}

export interface TourStage {
  team: TeamDef;
  games: TourGame[];
  /** pack for earning every star on the stage */
  starPack: string;
}

export interface Tour {
  id: string;
  name: string;
  stages: TourStage[];
}

/** The road trip through the neighborhood, easiest court first. */
const NEIGHBORHOOD_ORDER = ['comets', 'stompers', 'waves', 'coyotes', 'yetis', 'skyhawks', 'throwbacks', 'legends'];

/** Who you win at each stop of the neighborhood tour. */
const NEIGHBORHOOD_STARS: Record<string, string> = {
  comets: 'teo-ramirez',
  stompers: 'jax-monroe',
  waves: 'kai-nakoa',
  coyotes: 'sage-yazzie',
  yetis: 'bjorn-iversen',
  skyhawks: 'ace-carter',
  throwbacks: 'leroy-banks',
  legends: 'imani-royce',
};

export const STARS_PER_GAME = 3;

function strength(team: TeamDef): number {
  return teamPlayers(team.id)
    .map((p) => playerOverall(p))
    .sort((a, b) => b - a)
    .slice(0, 3)
    .reduce((a, b) => a + b, 0);
}

function buildStage(team: TeamDef, index: number, count: number, starId: string | undefined): TourStage | null {
  const roster = teamPlayers(team.id).sort((a, b) => playerOverall(a) - playerOverall(b));
  if (roster.length < 2) return null;
  const u = count > 1 ? index / (count - 1) : 0;
  const base = 0.18 + 0.72 * u;
  const level = 1 + Math.min(3, Math.floor(u * 4));
  const three = roster.length >= 3;
  const star: PlayerDef = (starId && roster.find((p) => p.id === starId)) || [...roster].reverse().find((p) => p.rarity !== 'legend') || roster[roster.length - 1];
  const side = (players: PlayerDef[], lv: number): SidePlayer[] => players.map((p) => ({ id: p.id, level: lv }));
  const weakest = roster.slice(0, 2);
  const middle = three ? roster.slice(Math.max(0, Math.floor((roster.length - 3) / 2)), Math.max(0, Math.floor((roster.length - 3) / 2)) + 3) : roster.slice(-2);
  // the showdown is led by the star you are playing for
  const others = roster.filter((p) => p.id !== star.id).reverse();
  const best = [star, ...others.slice(0, three ? 2 : 1)];
  return {
    team,
    starPack: u < 0.5 ? 'allstar' : 'legend',
    games: [
      { title: 'Warm-Up', perTeam: 2, opponents: side(weakest.reverse(), level), difficulty: base, coins: 80 + index * 10 },
      { title: 'Rivalry', perTeam: three ? 3 : 2, opponents: side(middle.reverse(), level), difficulty: Math.min(1, base + 0.04), coins: 120 + index * 15, pack: teamPackId(team.id) },
      { title: 'Showdown', perTeam: three ? 3 : 2, opponents: side(best, Math.min(5, level + 1)), difficulty: Math.min(1, base + 0.08), coins: 200 + index * 25, unlock: star.id },
    ],
  };
}

/** How far along a tour your own home court comes, as a share of its length. */
const HOME_STOP = 0.6;

/**
 * Your home team's court is never an early stop: you start out with three of
 * its players, so the trip begins on other courts and comes home later.
 */
function placeHome(teams: TeamDef[], homeTeam: string | null): TeamDef[] {
  const at = teams.findIndex((t) => t.id === homeTeam);
  if (at < 0) return teams;
  const rest = teams.filter((_, i) => i !== at);
  const to = Math.min(rest.length, Math.max(at, Math.round(teams.length * HOME_STOP)));
  return [...rest.slice(0, to), teams[at], ...rest.slice(to)];
}

function buildTour(id: string, name: string, teams: TeamDef[], stars: Record<string, string>, homeTeam: string | null): Tour {
  const stages: TourStage[] = [];
  const order = placeHome(
    teams.filter((t) => teamPlayers(t.id).length >= 2),
    homeTeam,
  );
  order.forEach((team, i) => {
    const stage = buildStage(team, i, order.length, stars[team.id]);
    if (stage) stages.push(stage);
  });
  return { id, name, stages };
}

function buildTours(homeTeam: string | null): readonly Tour[] {
  return ROSTER_PACKS.map((pack) => {
    if (pack.id === 'neighborhood') {
      const teams = NEIGHBORHOOD_ORDER.map((id) => pack.teams.find((t) => t.id === id)).filter((t): t is TeamDef => !!t);
      return buildTour(pack.id, 'Neighborhood Tour', teams, NEIGHBORHOOD_STARS, homeTeam);
    }
    const teams = [...pack.teams].sort((a, b) => strength(a) - strength(b));
    const stars: Record<string, string> = {};
    for (const t of teams) if (t.star) stars[t.id] = t.star;
    return buildTour(pack.id, `${pack.name} Tour`, teams, stars, homeTeam);
  });
}

const built = new Map<string, readonly Tour[]>();

/** Every tour, laid out for a player whose home team is `homeTeam`. */
export function toursFor(homeTeam: string | null): readonly Tour[] {
  const key = homeTeam ?? '';
  let tours = built.get(key);
  if (!tours) {
    tours = buildTours(homeTeam);
    built.set(key, tours);
  }
  return tours;
}

export function tourById(id: string, homeTeam: string | null): Tour {
  const tours = toursFor(homeTeam);
  return tours.find((t) => t.id === id) ?? tours[0];
}

/** stars earned, keyed "tour/stage/game" */
export type TourProgress = Record<string, number>;

export function gameKey(tourId: string, stage: number, game: number): string {
  return `${tourId}/${stage}/${game}`;
}

export function starsFor(won: boolean, margin: number): number {
  if (!won) return 0;
  return margin >= 10 ? 3 : margin >= 5 ? 2 : 1;
}

export function stageStars(progress: TourProgress, tour: Tour, stage: number): number {
  let n = 0;
  tour.stages[stage].games.forEach((_, g) => {
    n += progress[gameKey(tour.id, stage, g)] ?? 0;
  });
  return n;
}

export function stageCleared(progress: TourProgress, tour: Tour, stage: number): boolean {
  const last = tour.stages[stage].games.length - 1;
  return (progress[gameKey(tour.id, stage, last)] ?? 0) > 0;
}

export function stageOpen(progress: TourProgress, tour: Tour, stage: number): boolean {
  return stage === 0 || stageCleared(progress, tour, stage - 1);
}

export function gameOpen(progress: TourProgress, tour: Tour, stage: number, game: number): boolean {
  if (!stageOpen(progress, tour, stage)) return false;
  return game === 0 || (progress[gameKey(tour.id, stage, game - 1)] ?? 0) > 0;
}

export function tourStars(progress: TourProgress, tour: Tour): { have: number; all: number } {
  let have = 0;
  let all = 0;
  tour.stages.forEach((s, i) => {
    have += stageStars(progress, tour, i);
    all += s.games.length * STARS_PER_GAME;
  });
  return { have, all };
}

/**
 * The tour to show first: one that still has a game to play, your home
 * league's own tour before any other.
 */
export function preferredTour(tours: readonly Tour[], progress: TourProgress, league: string): Tour {
  const open = tours.filter((t) => nextTourGame(progress, t) !== null);
  return open.find((t) => t.id === league) ?? open[0] ?? tours.find((t) => t.id === league) ?? tours[0];
}

/** The next game worth playing: the first one without a star. */
export function nextTourGame(progress: TourProgress, tour: Tour): { stage: number; game: number } | null {
  for (let s = 0; s < tour.stages.length; s++) {
    for (let g = 0; g < tour.stages[s].games.length; g++) {
      if ((progress[gameKey(tour.id, s, g)] ?? 0) === 0) return gameOpen(progress, tour, s, g) ? { stage: s, game: g } : null;
    }
  }
  return null;
}
