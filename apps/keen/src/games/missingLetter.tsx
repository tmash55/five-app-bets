import type { BoardProps, GameModule, Rng } from '@five/game';
import { Text, useTheme } from '@five/shell';
import { View } from 'react-native';

import { ChoiceGrid } from './ChoiceGrid';
import { WORDS } from './words';

/**
 * Missing Letter (words). A word with one letter blanked out and a clue. Pick
 * the letter that completes it. Higher levels use longer words and more
 * letters to choose from.
 */
export type MissingLetterQuestion = {
  word: string;
  clue: string;
  /** Position of the blank in `word`. */
  gap: number;
  choices: string[];
};
export type MissingLetterAnswer = string;

export const MISSING_LETTER_LEVELS = [
  { minLength: 3, maxLength: 3, choices: 3 },
  { minLength: 4, maxLength: 4, choices: 4 },
  { minLength: 5, maxLength: 5, choices: 4 },
  { minLength: 6, maxLength: 6, choices: 4 },
  { minLength: 7, maxLength: 7, choices: 6 },
  { minLength: 8, maxLength: 99, choices: 6 },
] as const;

const VOWELS = ['A', 'E', 'I', 'O', 'U', 'Y'];
const CONSONANTS = 'BCDFGHJKLMNPRSTVWZ'.split('');
const ALL_WORDS = new Set(WORDS.map((entry) => entry.word));

export function wordsForLevel(level: number) {
  const { minLength, maxLength } = MISSING_LETTER_LEVELS[level - 1];
  return WORDS.filter(({ word }) => word.length >= minLength && word.length <= maxLength);
}

export function fill(word: string, gap: number, letter: string): string {
  return word.slice(0, gap) + letter + word.slice(gap + 1);
}

export function createMissingLetterQuestion(level: number, rng: Rng): MissingLetterQuestion {
  const { word, clue } = rng.pick(wordsForLevel(level));
  const gap = rng.int(0, word.length - 1);
  const letter = word[gap];
  // Wrong letters of the same kind (vowel for vowel) so the shape of the word
  // does not give the answer away. Skip any that spell another listed word.
  const [same, other] = VOWELS.includes(letter) ? [VOWELS, CONSONANTS] : [CONSONANTS, VOWELS];
  const wrong = [...rng.shuffle(same), ...rng.shuffle(other)]
    .filter((l) => l !== letter && !ALL_WORDS.has(fill(word, gap, l)))
    .slice(0, MISSING_LETTER_LEVELS[level - 1].choices - 1);
  return { word, clue, gap, choices: rng.shuffle([letter, ...wrong]) };
}

function MissingLetterBoard({ question, onAnswer }: BoardProps<MissingLetterQuestion, MissingLetterAnswer>) {
  const theme = useTheme();
  const letters = question.word.split('');
  const columns = question.choices.length === 6 ? 3 : 2;
  const spoken = letters.map((l, i) => (i === question.gap ? 'blank' : l)).join(' ');

  return (
    <View style={{ flex: 1, gap: theme.spacing.lg }}>
      <Text variant="heading" style={{ textAlign: 'center' }}>
        {question.clue}
      </Text>
      <View
        accessible
        accessibilityLabel={`Word: ${spoken}`}
        style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: theme.spacing.xs }}>
        {letters.map((letter, i) => {
          const blank = i === question.gap;
          return (
            <View
              key={i}
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: theme.spacing.sm,
                paddingVertical: theme.spacing.xs,
                borderRadius: theme.radius.sm,
                backgroundColor: blank ? theme.colors.primary : theme.colors.surface,
              }}>
              <Text variant="heading" color={blank ? 'textOnPrimary' : 'text'}>
                {blank ? '?' : letter}
              </Text>
            </View>
          );
        })}
      </View>
      <ChoiceGrid
        choices={question.choices}
        textFor={(letter) => letter}
        labelFor={(letter) => `Letter ${letter}`}
        columns={columns}
        onPick={onAnswer}
      />
    </View>
  );
}

export const missingLetter: GameModule<MissingLetterQuestion, MissingLetterAnswer> = {
  id: 'missing-letter',
  title: 'Missing Letter',
  instructions: 'Read the clue and tap the letter that completes the word.',
  levels: MISSING_LETTER_LEVELS.length,
  round: {
    durationMs: 60_000,
    questionTimeLimitMs: (level) => 6000 + level * 1000,
  },
  targetResponseMs: (level) => 2500 + level * 400,
  createQuestion: createMissingLetterQuestion,
  isCorrect: (question, answer) => answer === question.word[question.gap],
  Board: MissingLetterBoard,
};
