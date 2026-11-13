/**
 * Everything that changes the save file, as plain functions: old save in,
 * new save (and what happened) out. The store in `save.ts` is a thin wrapper,
 * which keeps all the rules easy to test.
 */

import { TEAMS, byValue, mustPlayer, playerById, playerOverall, teamPlayers } from '@/data/roster';
import type { TeamDef } from '@/data/types';
import { addCopy, levelOf, type Gain, type Owned } from '@/meta/collection';
import { TIERS, ladderResult, tierIndex, type Tier } from '@/meta/ladder';
import type { MatchSummary } from '@/meta/match';
import { ALL_DONE_PACK, currentMissions, missionDone, missionsAfterMatch, missionsAfterPack, type Mission, type MissionDay } from '@/meta/missions';
import { openPack, packById, type PackResult } from '@/meta/packs';
import { matchRewards, type Rewards } from '@/meta/rewards';
import type { Rng } from '@/meta/rng';
import { STARS_PER_GAME, gameKey, stageStars, starsFor, tourById, type TourProgress } from '@/meta/tour';

export const SAVE_VERSION = 1;

export interface Settings {
  sound: boolean;
  music: boolean;
  haptics: boolean;
  /** buttons on the left, stick on the right */
  lefty: boolean;
  /** 0 Rookie, 1 Pro, 2 All-Star (quick games) */
  difficulty: 0 | 1 | 2;
  quarterSeconds: 45 | 60 | 90;
  /** players per side in quick and ladder games */
  format: 2 | 3;
  /** extra-wide shot timing */
  easyShots: boolean;
}

export interface Stats {
  games: number;
  wins: number;
  points: number;
  dunks: number;
  threes: number;
  steals: number;
  blocks: number;
  perfects: number;
  packs: number;
  bestMargin: number;
}

export interface SaveData {
  version: number;
  onboarded: boolean;
  homeTeam: string | null;
  coins: number;
  owned: Owned;
  /** players won but not looked at yet */
  fresh: string[];
  /** three player ids, captain first */
  squad: string[];
  /** unopened packs by pack id */
  packs: Record<string, number>;
  ladder: { points: number; games: number; wins: number; bestTier: number };
  tour: TourProgress;
  /** stages whose all-stars pack has been collected, keyed "tour/stage" */
  starPacks: Record<string, true>;
  missions: MissionDay | null;
  freePackDay: string | null;
  firstWinDay: string | null;
  stats: Stats;
  settings: Settings;
  /** one-time hints already shown */
  tips: Record<string, true>;
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  music: true,
  haptics: true,
  lefty: false,
  difficulty: 0,
  quarterSeconds: 60,
  format: 2,
  easyShots: true,
};

export const STARTING_COINS = 300;
export const SQUAD_SIZE = 3;

export function newSave(): SaveData {
  return {
    version: SAVE_VERSION,
    onboarded: false,
    homeTeam: null,
    coins: 0,
    owned: {},
    fresh: [],
    squad: [],
    packs: {},
    ladder: { points: 0, games: 0, wins: 0, bestTier: 0 },
    tour: {},
    starPacks: {},
    missions: null,
    freePackDay: null,
    firstWinDay: null,
    stats: { games: 0, wins: 0, points: 0, dunks: 0, threes: 0, steals: 0, blocks: 0, perfects: 0, packs: 0, bestMargin: 0 },
    settings: { ...DEFAULT_SETTINGS },
    tips: {},
  };
}

/** Teams you can call home: the ones with enough everyday players to start a squad. */
export function homeTeamChoices(): TeamDef[] {
  return TEAMS.filter((t) => teamPlayers(t.id).filter((p) => p.rarity === 'common').length >= SQUAD_SIZE);
}

/** The three kids you start with: your home team's everyday players. */
export function starterIds(teamId: string): string[] {
  const roster = teamPlayers(teamId).sort((a, b) => playerOverall(a) - playerOverall(b));
  const commons = roster.filter((p) => p.rarity === 'common');
  const picks = (commons.length >= SQUAD_SIZE ? commons : roster).slice(0, SQUAD_SIZE);
  // best of the three leads the squad
  return picks.reverse().map((p) => p.id);
}

export function startCareer(data: SaveData, teamId: string): SaveData {
  const ids = starterIds(teamId);
  const owned: Owned = { ...data.owned };
  for (const id of ids) owned[id] = Math.max(1, owned[id] ?? 0);
  return {
    ...data,
    onboarded: true,
    homeTeam: teamId,
    owned,
    squad: ids,
    coins: data.coins + STARTING_COINS,
    packs: { ...data.packs, playground: (data.packs.playground ?? 0) + 1 },
  };
}

function withPack(packs: Record<string, number>, id: string, n = 1): Record<string, number> {
  return { ...packs, [id]: (packs[id] ?? 0) + n };
}

export function buyPack(data: SaveData, packId: string): SaveData | null {
  const def = packById(packId);
  if (def.price <= 0 || data.coins < def.price) return null;
  return { ...data, coins: data.coins - def.price, packs: withPack(data.packs, packId) };
}

export function claimFreePack(data: SaveData, day: string): SaveData | null {
  if (data.freePackDay === day) return null;
  return { ...data, freePackDay: day, packs: withPack(data.packs, 'playground') };
}

export function openOwnedPack(data: SaveData, packId: string, rng: Rng, day: string): { data: SaveData; result: PackResult } | null {
  if ((data.packs[packId] ?? 0) <= 0) return null;
  const result = openPack(packById(packId), data.owned, rng);
  const fresh = [...data.fresh];
  for (const c of result.cards) if (c.isNew && !fresh.includes(c.playerId)) fresh.push(c.playerId);
  const packs = { ...data.packs, [packId]: data.packs[packId] - 1 };
  if (packs[packId] <= 0) delete packs[packId];
  return {
    result,
    data: {
      ...data,
      packs,
      owned: result.owned,
      fresh,
      coins: data.coins + result.coins,
      stats: { ...data.stats, packs: data.stats.packs + 1 },
      missions: missionsAfterPack(currentMissions(data.missions, day)),
    },
  };
}

export function setSquad(data: SaveData, squad: string[]): SaveData {
  const clean = squad.filter((id, i) => (data.owned[id] ?? 0) > 0 && squad.indexOf(id) === i).slice(0, SQUAD_SIZE);
  if (clean.length < SQUAD_SIZE) return data;
  return { ...data, squad: clean };
}

export function markSeen(data: SaveData, playerId: string): SaveData {
  if (!data.fresh.includes(playerId)) return data;
  return { ...data, fresh: data.fresh.filter((id) => id !== playerId) };
}

export function squadLevels(data: SaveData): { id: string; level: number }[] {
  return data.squad.map((id) => ({ id, level: Math.max(1, levelOf(data.owned[id] ?? 1)) }));
}

// ---------------------------------------------------------------------------
// After a match
// ---------------------------------------------------------------------------

export interface TourOutcome {
  stars: number;
  /** stars this game already had before */
  starsBefore: number;
  firstClear: boolean;
  coins: number;
  pack?: string;
  /** the star player won on a first Showdown win */
  unlock?: Gain;
  /** pack for collecting every star on the stage */
  starPack?: string;
}

export interface LadderOutcome {
  before: number;
  after: number;
  /** set when a new tier was reached for the first time */
  promoted?: Tier;
}

export interface MatchOutcome {
  rewards: Rewards;
  ladder?: LadderOutcome;
  tour?: TourOutcome;
  /** missions that this match completed */
  missionsDone: Mission[];
}

export function finishMatch(data: SaveData, summary: MatchSummary, day: string): { data: SaveData; outcome: MatchOutcome } {
  const firstWin = summary.won && data.firstWinDay !== day;
  const rewards = matchRewards(summary, firstWin);
  let coins = data.coins + rewards.total;
  let packs = data.packs;
  let owned = data.owned;
  let fresh = data.fresh;
  const mine = summary.totals[0];
  const margin = summary.score[0] - summary.score[1];
  const stats: Stats = {
    ...data.stats,
    games: data.stats.games + 1,
    wins: data.stats.wins + (summary.won ? 1 : 0),
    points: data.stats.points + mine.points,
    dunks: data.stats.dunks + mine.dunks,
    threes: data.stats.threes + mine.threes,
    steals: data.stats.steals + mine.steals,
    blocks: data.stats.blocks + mine.blocks,
    perfects: data.stats.perfects + mine.perfects,
    bestMargin: Math.max(data.stats.bestMargin, margin),
  };

  const before = currentMissions(data.missions, day);
  const missions = missionsAfterMatch(before, summary);
  const missionsDone = missions.missions.filter((m, i) => missionDone(m) && !missionDone(before.missions[i]));

  let ladder = data.ladder;
  let ladderOutcome: LadderOutcome | undefined;
  if (summary.mode === 'ladder') {
    const after = ladderResult(ladder.points, summary.won, margin);
    const tier = tierIndex(after);
    ladderOutcome = { before: ladder.points, after };
    if (tier > ladder.bestTier) {
      // pay every tier passed on the way up
      for (let t = ladder.bestTier + 1; t <= tier; t++) {
        coins += TIERS[t].reward.coins;
        const pack = TIERS[t].reward.pack;
        if (pack) packs = withPack(packs, pack);
      }
      ladderOutcome.promoted = TIERS[tier];
    }
    ladder = { points: after, games: ladder.games + 1, wins: ladder.wins + (summary.won ? 1 : 0), bestTier: Math.max(ladder.bestTier, tier) };
  }

  let tour = data.tour;
  let starPacks = data.starPacks;
  let tourOutcome: TourOutcome | undefined;
  if (summary.mode === 'tour' && summary.tour) {
    const { tourId, stage, game } = summary.tour;
    const def = tourById(tourId, data.homeTeam);
    const g = def.stages[stage]?.games[game];
    if (g) {
      const key = gameKey(tourId, stage, game);
      const starsBefore = tour[key] ?? 0;
      const stars = starsFor(summary.won, margin);
      const firstClear = stars > 0 && starsBefore === 0;
      tourOutcome = { stars, starsBefore, firstClear, coins: 0 };
      if (stars > starsBefore) tour = { ...tour, [key]: stars };
      if (firstClear) {
        tourOutcome.coins = g.coins;
        coins += g.coins;
        if (g.pack) {
          packs = withPack(packs, g.pack);
          tourOutcome.pack = g.pack;
        }
        if (g.unlock) {
          const res = addCopy(owned, g.unlock, mustPlayer(g.unlock).rarity);
          owned = res.owned;
          coins += res.gain.coins;
          tourOutcome.unlock = res.gain;
          if (res.gain.isNew && !fresh.includes(g.unlock)) fresh = [...fresh, g.unlock];
        }
      }
      const stageKey = `${tourId}/${stage}`;
      if (!starPacks[stageKey] && stageStars(tour, def, stage) >= def.stages[stage].games.length * STARS_PER_GAME) {
        starPacks = { ...starPacks, [stageKey]: true };
        packs = withPack(packs, def.stages[stage].starPack);
        tourOutcome.starPack = def.stages[stage].starPack;
      }
    }
  }

  return {
    outcome: { rewards, ladder: ladderOutcome, tour: tourOutcome, missionsDone },
    data: {
      ...data,
      coins,
      packs,
      owned,
      fresh,
      stats,
      missions,
      ladder,
      tour,
      starPacks,
      firstWinDay: summary.won ? day : data.firstWinDay,
    },
  };
}

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------

export function claimMission(data: SaveData, index: number, day: string): SaveData | null {
  const today = currentMissions(data.missions, day);
  const m = today.missions[index];
  if (!m || m.claimed || !missionDone(m)) return null;
  const missions = today.missions.map((x, i) => (i === index ? { ...x, claimed: true } : x));
  return { ...data, coins: data.coins + m.coins, missions: { ...today, missions } };
}

export function claimMissionBonus(data: SaveData, day: string): SaveData | null {
  const today = currentMissions(data.missions, day);
  if (today.bonusClaimed || !today.missions.every((m) => m.claimed)) return null;
  return { ...data, packs: withPack(data.packs, ALL_DONE_PACK), missions: { ...today, bonusClaimed: true } };
}

function count(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function oneOf<T>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

function flag(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function validPack(id: string): boolean {
  try {
    packById(id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Bring an older or damaged save up to date without losing what can be kept.
 * Whatever comes out is safe to play with: every id in the squad is a player
 * this build knows, and every setting is one the menus offer.
 */
export function repairSave(raw: unknown): SaveData {
  const base = newSave();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<SaveData>;
  const owned: Owned = {};
  for (const [id, n] of Object.entries(r.owned ?? {})) {
    // players from a roster pack that is not on this build are kept out of play but not forgotten
    if (count(n) > 0) owned[id] = count(n);
  }
  const playable = (id: unknown): id is string => typeof id === 'string' && playerById(id) !== undefined && (owned[id] ?? 0) > 0;

  // three different players you own; a gap is filled with your best cards
  const squad: string[] = [];
  const seat = (id: unknown) => {
    if (squad.length < SQUAD_SIZE && playable(id) && !squad.includes(id)) squad.push(id);
  };
  if (Array.isArray(r.squad)) r.squad.forEach(seat);
  Object.keys(owned)
    .filter(playable)
    .map(mustPlayer)
    .sort(byValue)
    .forEach((p) => seat(p.id));
  const ready = squad.length === SQUAD_SIZE;

  const packs: Record<string, number> = {};
  for (const [id, n] of Object.entries(r.packs ?? {})) if (count(n) > 0 && validPack(id)) packs[id] = count(n);

  const tour: TourProgress = {};
  for (const [key, n] of Object.entries(r.tour ?? {})) if (count(n) > 0) tour[key] = Math.min(STARS_PER_GAME, count(n));

  const points = count(r.ladder?.points);
  const st = { ...base.settings, ...(r.settings ?? {}) };
  const stats: Stats = { ...base.stats };
  for (const key of Object.keys(stats) as (keyof Stats)[]) stats[key] = count(r.stats?.[key]);
  const missions = r.missions && typeof r.missions.day === 'string' && Array.isArray(r.missions.missions) ? r.missions : null;

  return {
    ...base,
    version: SAVE_VERSION,
    // without a full squad the game starts over at "pick your home team", keeping coins and cards
    onboarded: r.onboarded === true && ready,
    homeTeam: typeof r.homeTeam === 'string' && TEAMS.some((t) => t.id === r.homeTeam) ? r.homeTeam : null,
    coins: count(r.coins),
    owned,
    fresh: Array.isArray(r.fresh) ? r.fresh.filter(playable) : [],
    squad: ready ? squad : [],
    packs,
    ladder: {
      points,
      games: count(r.ladder?.games),
      wins: count(r.ladder?.wins),
      // a tier already reached is never paid for twice
      bestTier: Math.min(TIERS.length - 1, Math.max(count(r.ladder?.bestTier), tierIndex(points))),
    },
    tour,
    starPacks: { ...(r.starPacks ?? {}) },
    missions,
    freePackDay: typeof r.freePackDay === 'string' ? r.freePackDay : null,
    firstWinDay: typeof r.firstWinDay === 'string' ? r.firstWinDay : null,
    stats,
    settings: {
      sound: flag(st.sound, base.settings.sound),
      music: flag(st.music, base.settings.music),
      haptics: flag(st.haptics, base.settings.haptics),
      lefty: flag(st.lefty, base.settings.lefty),
      difficulty: oneOf(st.difficulty, [0, 1, 2] as const, base.settings.difficulty),
      quarterSeconds: oneOf(st.quarterSeconds, [45, 60, 90] as const, base.settings.quarterSeconds),
      format: oneOf(st.format, [2, 3] as const, base.settings.format),
      easyShots: flag(st.easyShots, base.settings.easyShots),
    },
    tips: { ...(r.tips ?? {}) },
  };
}
