import { nbaCandidates, nflCandidates } from './candidates.ts';
import { marketSpec } from './markets.ts';
import type {
  Candidate,
  GeneratedQuestion,
  GeneratedSlate,
  GradingRule,
  NbaPropRow,
  NflGameRow,
  NflPropRow,
} from './types.ts';

export const SLATE_MIN = 5;
export const SLATE_MAX = 10;
export const SLATE_TARGET = 8;

/** Questions too lopsided either way are no fun to answer. */
const MIN_YES_CHANCE = 0.3;
const MAX_YES_CHANCE = 0.7;
/** Fewer recent games than this and the stat line means little. */
const MIN_RECENT_GAMES = 5;

type Scored = Candidate & { score: number };

function score(candidates: Candidate[]): Scored[] {
  const usable = candidates.filter(
    (c) =>
      c.yesChance >= MIN_YES_CHANCE &&
      c.yesChance <= MAX_YES_CHANCE &&
      c.l10Games >= MIN_RECENT_GAMES,
  );

  // Rank star power within each sport, 0 (least known) to 1 (best known).
  const rank = new Map<string, number>();
  for (const sport of ['nba', 'nfl'] as const) {
    const players = new Map<string, number>();
    for (const c of usable) if (c.sport === sport) players.set(c.playerId, c.starPower);
    const sorted = [...players.entries()].sort((a, b) => a[1] - b[1]);
    sorted.forEach(([id], i) => rank.set(`${sport}:${id}`, sorted.length > 1 ? i / (sorted.length - 1) : 1));
  }

  return usable
    .map((c) => {
      const balance = 1 - Math.abs(c.yesChance - 0.5) * 2;
      const star = rank.get(`${c.sport}:${c.playerId}`) ?? 0;
      const appeal = marketSpec(c.sport, c.market)?.appeal ?? 0.5;
      return { ...c, score: 0.55 * star + 0.25 * balance + 0.2 * appeal };
    })
    .sort((a, b) => b.score - a.score || a.playerName.localeCompare(b.playerName));
}

/**
 * Picks the slate: best-known players on near coin-flip lines in the stats
 * fans follow most, one question
 * per player, spread across games and markets.
 */
export function pickQuestions(candidates: Candidate[], target = SLATE_TARGET): Scored[] {
  const scored = score(candidates);
  const byGame = new Map<string, Scored[]>();
  for (const c of scored) {
    const key = `${c.sport}:${c.gameId}`;
    byGame.set(key, [...(byGame.get(key) ?? []), c]);
  }
  // Games with the best questions go first in each round.
  const games = [...byGame.keys()];
  if (games.length === 0) return [];

  const maxPerGame = Math.max(2, Math.ceil(target / games.length));
  const maxPerMarket = Math.max(2, Math.ceil(target / 2));
  const chosen: Scored[] = [];
  const usedPlayers = new Set<string>();
  const perGame = new Map<string, number>();
  const perMarket = new Map<string, number>();

  let progress = true;
  while (chosen.length < target && progress) {
    progress = false;
    for (const game of games) {
      if (chosen.length >= target) break;
      if ((perGame.get(game) ?? 0) >= maxPerGame) continue;
      const next = byGame.get(game)!.find(
        (c) =>
          !usedPlayers.has(`${c.sport}:${c.playerId}`) &&
          (perMarket.get(`${c.sport}:${c.market}`) ?? 0) < maxPerMarket,
      );
      if (!next) continue;
      chosen.push(next);
      usedPlayers.add(`${next.sport}:${next.playerId}`);
      perGame.set(game, (perGame.get(game) ?? 0) + 1);
      perMarket.set(`${next.sport}:${next.market}`, (perMarket.get(`${next.sport}:${next.market}`) ?? 0) + 1);
      progress = true;
    }
  }
  return chosen;
}

export function promptFor(c: Candidate): string {
  const spec = marketSpec(c.sport, c.market)!;
  return `Will ${c.playerName} ${spec.ask(c.threshold)}?`;
}

/** The one-line hint Pro players see under a question. */
export function statLineFor(c: Candidate): string {
  const spec = marketSpec(c.sport, c.market)!;
  const label = spec.hitLabel?.(c.threshold) ?? `${c.threshold}+ ${spec.noun}`;
  const base = `${label} in ${c.l10Hits} of last ${c.l10Games} games`;
  return c.l10Avg === null ? base : `${base} · averaging ${c.l10Avg.toFixed(1)}`;
}

export function gradingRuleFor(c: Candidate): GradingRule {
  const spec = marketSpec(c.sport, c.market)!;
  return {
    version: 1,
    kind: 'player_stat_at_least',
    sport: c.sport,
    source_table: c.sport === 'nba' ? 'nba_player_box_scores' : 'nfl_player_game_logs',
    game_id: c.gameId,
    player_id: c.playerId,
    player_name: c.playerName,
    market: c.market,
    stats: spec.stats,
    threshold: c.threshold,
    line: c.line,
    void_if_player_inactive: true,
  };
}

export type SlateInput = {
  slateDate: string;
  now: Date;
  nba: NbaPropRow[];
  nfl: NflPropRow[];
  nflGames: NflGameRow[];
  target?: number;
};

export function generateSlate(input: SlateInput): GeneratedSlate {
  const target = Math.min(SLATE_MAX, Math.max(SLATE_MIN, input.target ?? SLATE_TARGET));
  const candidates = [
    ...nbaCandidates(
      input.nba.filter((r) => r.game_date === input.slateDate),
      input.now,
    ),
    ...nflCandidates(
      input.nfl.filter((r) => r.game_date === input.slateDate),
      input.nflGames,
      input.now,
    ),
  ];
  const picked = pickQuestions(candidates, target).sort(
    (a, b) => a.startsAt.localeCompare(b.startsAt) || b.score - a.score,
  );

  const questions: GeneratedQuestion[] = picked.map((c, i) => ({
    position: i + 1,
    sport: c.sport,
    game_id: c.gameId,
    game_label: c.gameLabel,
    starts_at: c.startsAt,
    lock_at: c.startsAt,
    prompt: promptFor(c),
    stat_line: statLineFor(c),
    grading_rule: gradingRuleFor(c),
    source: {
      line: c.line,
      yes_chance: Math.round(c.yesChance * 1000) / 1000,
      book_count: c.bookCount,
    },
  }));

  const notes: string[] = [];
  if (candidates.length === 0) {
    notes.push(`No NBA or NFL games with live props are left to play on ${input.slateDate}.`);
  } else if (questions.length < SLATE_MIN) {
    notes.push(
      `Only ${questions.length} questions met the bar for ${input.slateDate}. A slate needs at least ${SLATE_MIN} to publish.`,
    );
  }
  return { slate_date: input.slateDate, questions, notes };
}
