import { recordLabel, type LeagueSummary } from '../compete/standings';
import {
  crowdLine,
  rowStatus,
  slateDateLabel,
  streakLabel,
  summarize,
  type ResultPick,
  type ResultQuestion,
} from '../results/resultsState';

/** What the shareable results card shows (UNJ-1425). Built only from the player's own graded slate. */
export type ResultsCard = {
  dateLabel: string;
  headline: string;
  record: string;
  points: number;
  bonus: number;
  bestPick: { prompt: string; answer: 'Yes' | 'No'; points: number; crowd: string | null } | null;
  streak: string | null;
  displayName: string | null;
};

/**
 * Can this slate be shared? Only once every question has a result (a graded
 * slate), and only when the player picked at least one question that was not voided.
 */
export function canShareResults(questions: ResultQuestion[], picks: Record<string, ResultPick>): boolean {
  if (questions.length === 0) return false;
  const summary = summarize(questions, picks);
  return summary.allGraded && summary.graded > 0;
}

/** The share of all picks on a question that went the player's way, for breaking ties. */
function crowdShare(q: ResultQuestion, answer: boolean): number {
  if (q.yes_picks === null || q.no_picks === null) return 1;
  const total = q.yes_picks + q.no_picks;
  if (total === 0) return 1;
  return (answer ? q.yes_picks : q.no_picks) / total;
}

/**
 * The best pick of the night: the correct pick that earned the most points
 * (so a bonus for a less popular call wins), then the one the fewest players
 * shared, then the earliest question. Null when nothing was called right.
 */
export function bestPick(questions: ResultQuestion[], picks: Record<string, ResultPick>): ResultsCard['bestPick'] {
  let best: { q: ResultQuestion; pick: ResultPick; points: number; share: number } | null = null;
  for (const q of questions) {
    const pick = picks[q.id];
    if (!pick || rowStatus(q, pick) !== 'correct') continue;
    const points = (pick.base_points ?? 0) + (pick.bonus_points ?? 0);
    const share = crowdShare(q, pick.answer);
    if (
      !best ||
      points > best.points ||
      (points === best.points && share < best.share) ||
      (points === best.points && share === best.share && q.position < best.q.position)
    ) {
      best = { q, pick, points, share };
    }
  }
  if (!best) return null;
  return {
    prompt: best.q.prompt,
    answer: best.pick.answer ? 'Yes' : 'No',
    points: best.points,
    crowd: crowdLine(best.q, best.pick.answer),
  };
}

export function headline(correct: number, graded: number): string {
  if (graded > 0 && correct === graded) return graded === 1 ? 'Called it' : `Perfect ${graded} for ${graded}`;
  if (correct === 0) return 'Tough night';
  return `Called ${correct} of ${graded}`;
}

export function buildResultsCard(input: {
  slateDate: string;
  questions: ResultQuestion[];
  picks: Record<string, ResultPick>;
  streak: number;
  displayName: string | null;
}): ResultsCard {
  const summary = summarize(input.questions, input.picks);
  return {
    dateLabel: slateDateLabel(input.slateDate),
    headline: headline(summary.correct, summary.graded),
    record: recordLabel(summary.correct, summary.graded),
    points: summary.points,
    bonus: summary.bonus,
    bestPick: bestPick(input.questions, input.picks),
    // A streak of 0 or 1 says nothing worth sharing.
    streak: input.streak >= 2 ? streakLabel(input.streak) : null,
    displayName: input.displayName,
  };
}

/** The text that goes with the card and carries the league invite link. */
export function shareMessage(card: ResultsCard, leagueName: string, url: string): string {
  return `I went ${card.record} on Called It (${card.points} pts). Join my league "${leagueName}" and try to beat me: ${url}`;
}

/** A shorter line for X, where the link is added separately. */
export function shareMessageShort(card: ResultsCard, leagueName: string): string {
  return `I went ${card.record} on tonight's Called It slate (${card.points} pts). Think you can beat me? Join "${leagueName}":`;
}

/** The link as printed on the card image, without the scheme, for people who can only see the picture. */
export function printedLink(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

/**
 * The league the share link invites to by default: one the player owns
 * (the biggest, if several), otherwise the biggest league they are in.
 * Null when they are in no league yet.
 */
export function defaultShareLeague(leagues: LeagueSummary[]): LeagueSummary | null {
  const bySize = [...leagues].sort((a, b) => b.member_count - a.member_count || a.name.localeCompare(b.name));
  return bySize.find((l) => l.is_owner) ?? bySize[0] ?? null;
}

/** The name offered when the player has no league yet and sharing creates one. */
export function suggestedLeagueName(displayName: string | null): string {
  const name = displayName?.trim();
  const suggestion = name ? `${name}'s League` : 'My Called It League';
  return suggestion.length <= 30 ? suggestion : 'My Called It League';
}

/** X's post composer with the text and link filled in. Opens the X app where installed. */
export function xIntentUrl(text: string, url: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}
