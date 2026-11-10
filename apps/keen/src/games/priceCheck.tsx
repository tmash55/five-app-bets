import type { BoardProps, GameModule, Rng } from '@five/game';
import { Text, useTheme } from '@five/shell';
import { View } from 'react-native';

import { ChoiceGrid } from './ChoiceGrid';

/**
 * Price Check (math). Work out a tip, a sale price or a shopping total in your
 * head and pick it from four amounts. Early levels use round numbers and wide
 * gaps between choices, so estimating is enough; later levels use cents and
 * choices close together.
 */
export type PriceKind = 'tip' | 'discount' | 'total';
export type PriceCheckQuestion = {
  kind: PriceKind;
  /** Bill, price or item prices, in cents. */
  amounts: number[];
  /** Tip or discount percent. 0 for totals. */
  percent: number;
  /** Four amounts in cents, one of them the answer. */
  choices: number[];
};
/** Picked amount, in cents. */
export type PriceCheckAnswer = number;

type Level = {
  tipPercents: number[];
  discountPercents: number[];
  /** Whole dollars per amount. */
  minDollars: number;
  maxDollars: number;
  /** Cents step in amounts: 100 = whole dollars, 1 = any cents. */
  centsStep: number;
  items: number;
  /** How far apart the choices are, as a fraction of the answer. */
  spread: number;
};

export const PRICE_LEVELS: Level[] = [
  { tipPercents: [10, 20], discountPercents: [10, 50], minDollars: 10, maxDollars: 90, centsStep: 1000, items: 2, spread: 0.5 },
  { tipPercents: [15, 20], discountPercents: [10, 20, 25, 50], minDollars: 8, maxDollars: 120, centsStep: 100, items: 2, spread: 0.4 },
  { tipPercents: [15, 18, 20], discountPercents: [20, 25, 30, 40], minDollars: 5, maxDollars: 150, centsStep: 25, items: 3, spread: 0.3 },
  { tipPercents: [15, 18, 20, 22], discountPercents: [15, 20, 30, 35, 40], minDollars: 3, maxDollars: 180, centsStep: 5, items: 3, spread: 0.2 },
  { tipPercents: [15, 18, 20, 22, 25], discountPercents: [15, 25, 30, 35, 40, 60], minDollars: 2, maxDollars: 220, centsStep: 1, items: 4, spread: 0.15 },
  { tipPercents: [12, 15, 18, 22, 25], discountPercents: [15, 25, 33, 35, 45, 60], minDollars: 2, maxDollars: 250, centsStep: 1, items: 4, spread: 0.1 },
];

const KINDS: PriceKind[] = ['tip', 'discount', 'total'];

export function answerCents(question: Pick<PriceCheckQuestion, 'kind' | 'amounts' | 'percent'>): number {
  const { kind, amounts, percent } = question;
  if (kind === 'total') return amounts.reduce((sum, cents) => sum + cents, 0);
  if (kind === 'tip') return Math.round((amounts[0] * percent) / 100);
  return Math.round((amounts[0] * (100 - percent)) / 100);
}

/** "$12.40", or "$12" for whole dollars. */
export function formatMoney(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? `$${dollars}` : `$${dollars}.${String(rest).padStart(2, '0')}`;
}

export function priceCheckPrompt(question: PriceCheckQuestion): { label: string; prompt: string } {
  const [first] = question.amounts;
  if (question.kind === 'tip') return { label: 'Tip', prompt: `${question.percent}% tip on ${formatMoney(first)}` };
  if (question.kind === 'discount') {
    return { label: 'Sale price', prompt: `${formatMoney(first)} with ${question.percent}% off` };
  }
  return { label: 'Total', prompt: question.amounts.map(formatMoney).join(' + ') };
}

function amount(level: Level, rng: Rng, maxDollars = level.maxDollars): number {
  const steps = Math.floor((maxDollars * 100 - level.minDollars * 100) / level.centsStep);
  return level.minDollars * 100 + rng.int(0, steps) * level.centsStep;
}

/** Round a wrong choice to the same precision as the answer, so the cents do not give it away. */
function roundLike(cents: number, answer: number): number {
  const step = answer % 100 === 0 ? 100 : answer % 5 === 0 ? 5 : 1;
  return Math.round(cents / step) * step;
}

export function createPriceCheckQuestion(levelNumber: number, rng: Rng): PriceCheckQuestion {
  const level = PRICE_LEVELS[levelNumber - 1];
  const kind = rng.pick(KINDS);
  let amounts: number[];
  let percent = 0;
  if (kind === 'total') {
    // Keep each item small enough that the total stays a shopping basket.
    const itemMax = Math.max(level.minDollars + 1, Math.round(level.maxDollars / (level.items * 2)));
    amounts = Array.from({ length: level.items }, () => amount(level, rng, itemMax));
  } else {
    amounts = [amount(level, rng)];
    percent = rng.pick(kind === 'tip' ? level.tipPercents : level.discountPercents);
  }
  const answer = answerCents({ kind, amounts, percent });

  // Wrong choices sit 1 and 2 spreads away, above or below the answer.
  const offsets = rng.shuffle([-2, -1, 1, 2]);
  const choices = [answer];
  for (const offset of offsets) {
    if (choices.length === 4) break;
    const wrong = roundLike(answer * (1 + offset * level.spread), answer);
    if (wrong > 0 && !choices.includes(wrong)) choices.push(wrong);
  }
  // Tiny answers can round onto each other; fill with plain steps above.
  for (let n = 1; choices.length < 4; n += 1) {
    const wrong = answer + n * Math.max(100, Math.round(answer * level.spread));
    if (!choices.includes(wrong)) choices.push(wrong);
  }
  return { kind, amounts, percent, choices: rng.shuffle(choices) };
}

function PriceCheckBoard({ question, onAnswer }: BoardProps<PriceCheckQuestion, PriceCheckAnswer>) {
  const theme = useTheme();
  const { label, prompt } = priceCheckPrompt(question);
  return (
    <View style={{ flex: 1, gap: theme.spacing.lg }}>
      <View style={{ alignItems: 'center', gap: theme.spacing.xs }}>
        <Text variant="label" color="textSecondary">
          {label}
        </Text>
        <Text variant="heading" style={{ textAlign: 'center' }}>
          {prompt}
        </Text>
      </View>
      <ChoiceGrid choices={question.choices} textFor={formatMoney} variant="heading" onPick={onAnswer} />
    </View>
  );
}

export const priceCheck: GameModule<PriceCheckQuestion, PriceCheckAnswer> = {
  id: 'price-check',
  title: 'Price Check',
  instructions: 'Estimate tips, sale prices and totals in your head, then tap the right amount.',
  levels: PRICE_LEVELS.length,
  round: {
    durationMs: 60_000,
    questionTimeLimitMs: (level) => 8000 + level * 1000,
  },
  targetResponseMs: (level) => 3500 + level * 500,
  createQuestion: createPriceCheckQuestion,
  isCorrect: (question, answer) => answer === answerCents(question),
  Board: PriceCheckBoard,
};
