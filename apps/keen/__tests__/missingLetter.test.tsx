import { createRng, GameRunner } from '@five/game';
import { fireEvent, screen } from '@testing-library/react-native';

import { withAnswerFeedback } from '@/feedback/withAnswerFeedback';
import {
  createMissingLetterQuestion,
  fill,
  MISSING_LETTER_LEVELS,
  missingLetter,
  wordsForLevel,
} from '@/games/missingLetter';
import { WORDS } from '@/games/words';

import { advance, renderThemed } from '../test/helpers';

jest.mock('react-native-purchases', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/feedback/feedback', () => ({ giveFeedback: jest.fn() }));

const feedback = jest.fn();
const game = withAnswerFeedback(missingLetter, feedback);
const byClue = new Map(WORDS.map((entry) => [entry.clue, entry.word]));

/** The right letter for the question on screen, worked out from the clue. */
function rightLetter(): string {
  const clue = WORDS.find((entry) => screen.queryByText(entry.clue))!.clue;
  const spoken = (screen.getByLabelText(/^Word: /).props.accessibilityLabel as string).replace('Word: ', '');
  const gap = spoken.split(' ').indexOf('blank');
  return byClue.get(clue)![gap];
}

function letters(): string[] {
  return screen
    .getAllByRole('button')
    .map((node) => node.props.accessibilityLabel as string)
    .filter((label) => label?.startsWith('Letter '))
    .map((label) => label.replace('Letter ', ''));
}

const letter = (l: string) => screen.getByRole('button', { name: `Letter ${l}` });

async function startRound(onFinish = jest.fn()) {
  await renderThemed(<GameRunner game={game} seed={21} onFinish={onFinish} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Start' }));
  await advance(3000);
  return onFinish;
}

beforeEach(() => {
  jest.useFakeTimers({ now: 0 });
  feedback.mockClear();
});
afterEach(() => jest.useRealTimers());

describe('Missing Letter word list', () => {
  it('has only capital letters, no repeats, and clues that do not give the word away', () => {
    const seen = new Set<string>();
    for (const { word, clue } of WORDS) {
      expect(word).toMatch(/^[A-Z]{3,}$/);
      expect(seen.has(word)).toBe(false);
      seen.add(word);
      expect(clue.toUpperCase()).not.toContain(word);
      expect(clue.length).toBeGreaterThan(3);
    }
    expect(new Set(WORDS.map((w) => w.clue)).size).toBe(WORDS.length);
  });

  it('has at least 18 words for every level', () => {
    for (let level = 1; level <= missingLetter.levels; level += 1) {
      expect(wordsForLevel(level).length).toBeGreaterThanOrEqual(18);
    }
  });
});

describe('Missing Letter questions', () => {
  it('blanks one letter and offers it among distinct choices that spell no other listed word', () => {
    const rng = createRng(5);
    const listed = new Set(WORDS.map((w) => w.word));
    for (let level = 1; level <= missingLetter.levels; level += 1) {
      const { minLength, maxLength, choices } = MISSING_LETTER_LEVELS[level - 1];
      for (let i = 0; i < 300; i += 1) {
        const q = createMissingLetterQuestion(level, rng);
        expect(q.word.length).toBeGreaterThanOrEqual(minLength);
        expect(q.word.length).toBeLessThanOrEqual(maxLength);
        expect(q.choices).toHaveLength(choices);
        expect(new Set(q.choices).size).toBe(choices);
        expect(q.choices).toContain(q.word[q.gap]);
        for (const c of q.choices) {
          if (c !== q.word[q.gap]) expect(listed.has(fill(q.word, q.gap, c))).toBe(false);
        }
      }
    }
  });
});

describe('Missing Letter on the game framework', () => {
  it('shows the clue and the word with a blank, and levels up on four quick right letters', async () => {
    await startRound();
    for (let i = 0; i < 4; i += 1) {
      expect(letters()).toHaveLength(3);
      await fireEvent.press(letter(rightLetter()));
      expect(feedback).toHaveBeenLastCalledWith('right');
    }
    expect(screen.getByLabelText('Level 2 of 6')).toBeOnTheScreen();
  });

  it('takes a wrong letter as wrong and ignores a second tap', async () => {
    await startRound();
    const wrong = letters().find((l) => l !== rightLetter())!;
    const button = letter(wrong);
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(feedback).toHaveBeenCalledTimes(1);
    expect(feedback).toHaveBeenLastCalledWith('wrong');
  });

  it('reports a score after 60 seconds', async () => {
    const onFinish = await startRound();
    await fireEvent.press(letter(rightLetter()));
    await advance(60_000);
    expect(screen.getByText("Time's up")).toBeOnTheScreen();
    expect(onFinish.mock.calls[0][0].correct).toBe(1);
    expect(onFinish.mock.calls[0][0].score).toBeGreaterThan(0);
  });
});
