import { ThemeProvider } from '@five/shell';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ReviewQuestionCard } from '../src/components/ReviewQuestionCard';
import type { ReviewQuestion } from '../src/slate/reviewState';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The shell's index pulls in RevenueCat, which ships ESM that Jest cannot load.
jest.mock('react-native-purchases', () => ({ __esModule: true, default: {}, LOG_LEVEL: {} }));

const question: ReviewQuestion = {
  id: 'q1',
  position: 1,
  sport: 'nba',
  game_label: 'MIL @ NYK',
  lock_at: '2026-11-11T00:30:00.000Z',
  prompt: 'Will Jalen Brunson score 27 or more points?',
  generated_prompt: 'Will Jalen Brunson score 27 or more points?',
  included: true,
  stat_line: '27+ points in 5 of last 10 games · averaging 28.1',
  grading_rule: {
    version: 1,
    kind: 'player_stat_at_least',
    sport: 'nba',
    source_table: 'nba_player_box_scores',
    game_id: '22600211',
    player_id: '1628973',
    player_name: 'Jalen Brunson',
    market: 'player_points',
    stats: ['pts'],
    threshold: 27,
    line: 26.5,
    void_if_player_inactive: true,
  },
};

async function renderCard(q: ReviewQuestion, editable = true) {
  const onChangePrompt = jest.fn();
  const onToggleIncluded = jest.fn();
  await render(
    <ThemeProvider>
      <ReviewQuestionCard
        question={q}
        editable={editable}
        onChangePrompt={onChangePrompt}
        onToggleIncluded={onToggleIncluded}
      />
    </ThemeProvider>,
  );
  return { onChangePrompt, onToggleIncluded };
}

describe('ReviewQuestionCard', () => {
  it('shows the question, stat line and grading rule', async () => {
    await renderCard(question);
    expect(screen.getByDisplayValue(question.prompt)).toBeOnTheScreen();
    expect(screen.getByText(`Pro stat line: ${question.stat_line}`)).toBeOnTheScreen();
    expect(screen.getByText(/Graded as Jalen Brunson: pts ≥ 27/)).toBeOnTheScreen();
  });

  it('lets an admin reword or drop the question', async () => {
    const { onChangePrompt, onToggleIncluded } = await renderCard(question);
    await fireEvent.changeText(screen.getByLabelText('Question'), 'Will Brunson drop 27?');
    expect(onChangePrompt).toHaveBeenCalledWith('Will Brunson drop 27?');
    await fireEvent.press(screen.getByRole('button', { name: 'Drop from slate' }));
    expect(onToggleIncluded).toHaveBeenCalled();
  });

  it('shows the generated wording after an edit', async () => {
    await renderCard({ ...question, prompt: 'Will Brunson drop 27 or more?' });
    expect(screen.getByText(`Generated: ${question.generated_prompt}`)).toBeOnTheScreen();
  });

  it('is read-only once published', async () => {
    await renderCard(question, false);
    expect(screen.getByText(question.prompt)).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
