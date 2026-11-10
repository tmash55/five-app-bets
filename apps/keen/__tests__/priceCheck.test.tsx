import { createRng, GameRunner } from '@five/game';
import { fireEvent, screen } from '@testing-library/react-native';

import { withAnswerFeedback } from '@/feedback/withAnswerFeedback';
import {
  answerCents,
  createPriceCheckQuestion,
  formatMoney,
  PRICE_LEVELS,
  priceCheck,
  priceCheckPrompt,
} from '@/games/priceCheck';

import { advance, renderThemed } from '../test/helpers';

jest.mock('react-native-purchases', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/feedback/feedback', () => ({ giveFeedback: jest.fn() }));

const feedback = jest.fn();
const game = withAnswerFeedback(priceCheck, feedback);

const cents = (money: string) => Math.round(Number(money.replace('$', '')) * 100);

/** Works out the answer from the prompt on screen, like a player would. */
function rightAmount(): string {
  if (screen.queryByText('Total')) {
    const prompt = screen.getByText(/^\$[\d.]+ \+ /).props.children as string;
    return formatMoney(prompt.split(' + ').reduce((sum, m) => sum + cents(m), 0));
  }
  const tip = screen.queryByText(/% tip on /);
  if (tip) {
    const [, percent, bill] = (tip.props.children as string).match(/^(\d+)% tip on (\$[\d.]+)$/)!;
    return formatMoney(Math.round((cents(bill) * Number(percent)) / 100));
  }
  const sale = screen.getByText(/% off$/).props.children as string;
  const [, price, percent] = sale.match(/^(\$[\d.]+) with (\d+)% off$/)!;
  return formatMoney(Math.round((cents(price) * (100 - Number(percent))) / 100));
}

function amounts(): string[] {
  return screen
    .getAllByRole('button')
    .map((node) => node.props.accessibilityLabel as string)
    .filter((label) => label?.startsWith('$'));
}

async function startRound(onFinish = jest.fn()) {
  await renderThemed(<GameRunner game={game} seed={33} onFinish={onFinish} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Start' }));
  await advance(3000);
  return onFinish;
}

beforeEach(() => {
  jest.useFakeTimers({ now: 0 });
  feedback.mockClear();
});
afterEach(() => jest.useRealTimers());

describe('Price Check money', () => {
  it('formats cents as dollars', () => {
    expect(formatMoney(1240)).toBe('$12.40');
    expect(formatMoney(705)).toBe('$7.05');
    expect(formatMoney(1200)).toBe('$12');
  });

  it('works out tips, sale prices and totals to the cent', () => {
    expect(answerCents({ kind: 'tip', amounts: [4250], percent: 18 })).toBe(765);
    expect(answerCents({ kind: 'discount', amounts: [8000], percent: 25 })).toBe(6000);
    expect(answerCents({ kind: 'total', amounts: [349, 525, 199], percent: 0 })).toBe(1073);
  });

  it('writes a prompt for each kind', () => {
    expect(priceCheckPrompt({ kind: 'tip', amounts: [4250], percent: 18, choices: [] }).prompt).toBe('18% tip on $42.50');
    expect(priceCheckPrompt({ kind: 'discount', amounts: [8000], percent: 25, choices: [] }).prompt).toBe('$80 with 25% off');
    expect(priceCheckPrompt({ kind: 'total', amounts: [349, 525], percent: 0, choices: [] }).prompt).toBe('$3.49 + $5.25');
  });
});

describe('Price Check questions', () => {
  it('has four different positive choices, one of them the answer, at every level', () => {
    const rng = createRng(6);
    const kinds = new Set<string>();
    for (let level = 1; level <= priceCheck.levels; level += 1) {
      const { tipPercents, discountPercents, items } = PRICE_LEVELS[level - 1];
      for (let i = 0; i < 300; i += 1) {
        const q = createPriceCheckQuestion(level, rng);
        kinds.add(q.kind);
        expect(new Set(q.choices).size).toBe(4);
        expect(q.choices).toContain(answerCents(q));
        q.choices.forEach((c) => expect(c).toBeGreaterThan(0));
        if (q.kind === 'tip') expect(tipPercents).toContain(q.percent);
        if (q.kind === 'discount') expect(discountPercents).toContain(q.percent);
        if (q.kind === 'total') expect(q.amounts).toHaveLength(items);
      }
    }
    expect([...kinds].sort()).toEqual(['discount', 'tip', 'total']);
  });

  it('uses whole dollars at level 1 and brings the choices closer together as levels go up', () => {
    const rng = createRng(1);
    for (let i = 0; i < 100; i += 1) {
      createPriceCheckQuestion(1, rng).amounts.forEach((a) => expect(a % 100).toBe(0));
    }
    for (let level = 2; level <= priceCheck.levels; level += 1) {
      expect(PRICE_LEVELS[level - 1].spread).toBeLessThan(PRICE_LEVELS[level - 2].spread);
    }
  });
});

describe('Price Check on the game framework', () => {
  it('takes the right amount and levels up on four quick right answers', async () => {
    await startRound();
    for (let i = 0; i < 4; i += 1) {
      expect(amounts()).toHaveLength(4);
      const right = rightAmount();
      expect(amounts()).toContain(right);
      await fireEvent.press(screen.getByRole('button', { name: right }));
      expect(feedback).toHaveBeenLastCalledWith('right');
    }
    expect(screen.getByLabelText('Level 2 of 6')).toBeOnTheScreen();
  });

  it('takes a wrong amount as wrong and ignores a second tap', async () => {
    await startRound();
    const wrong = amounts().find((a) => a !== rightAmount())!;
    const button = screen.getByRole('button', { name: wrong });
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(feedback).toHaveBeenCalledTimes(1);
    expect(feedback).toHaveBeenLastCalledWith('wrong');
  });

  it('reports a score after 60 seconds', async () => {
    const onFinish = await startRound();
    await fireEvent.press(screen.getByRole('button', { name: rightAmount() }));
    await advance(60_000);
    expect(screen.getByText("Time's up")).toBeOnTheScreen();
    expect(onFinish.mock.calls[0][0].correct).toBe(1);
    expect(onFinish.mock.calls[0][0].score).toBeGreaterThan(0);
  });
});
