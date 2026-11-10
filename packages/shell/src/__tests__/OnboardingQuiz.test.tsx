import { fireEvent, render, screen } from '@testing-library/react-native';

import { AnalyticsProvider } from '../analytics/AnalyticsProvider';
import { QUIZ_EVENTS } from '../onboarding/events';
import { OnboardingQuiz } from '../onboarding/OnboardingQuiz';
import { ThemeProvider } from '../theme/ThemeProvider';
import { makeQuiz } from '../test-utils/quizFixture';

async function renderQuiz(config = makeQuiz()) {
  const track = jest.fn();
  const onComplete = jest.fn();
  const view = await render(
    <AnalyticsProvider track={track}>
      <ThemeProvider>
        <OnboardingQuiz config={config} onComplete={onComplete} />
      </ThemeProvider>
    </AnalyticsProvider>,
  );
  const events = () => track.mock.calls.map(([name]) => name as string);
  return { track, onComplete, events, view };
}

const next = () => fireEvent.press(screen.getByRole('button', { name: 'Next' }));

describe('OnboardingQuiz', () => {
  it('runs the whole quiz from config and hands off to the paywall', async () => {
    const { track, onComplete, events } = await renderQuiz();

    expect(screen.getByText('Welcome')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Get started' }));

    // Single choice: Next stays disabled until something is picked.
    expect(screen.getByText('Question 1 of 8')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('radio', { name: 'Win' }));
    await next();

    // Multiple choice, capped at two.
    await fireEvent.press(screen.getByRole('checkbox', { name: 'NFL' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'NBA' }));
    expect(screen.getByRole('checkbox', { name: 'MLB' })).toBeDisabled();
    await next();

    // Slider starts on its default and can be adjusted by screen readers.
    const slider = screen.getByRole('adjustable');
    expect(screen.getByText('10 min')).toBeOnTheScreen();
    await fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(screen.getByText('15 min')).toBeOnTheScreen();
    await next();

    for (let n = 4; n <= 7; n++) {
      await fireEvent.press(screen.getByRole('radio', { name: `A${n}` }));
      await next();
    }
    await fireEvent.press(screen.getByRole('radio', { name: 'B8' }));
    await fireEvent.press(screen.getByRole('button', { name: 'See my results' }));

    // Personalized result.
    expect(screen.getByText('Built to win')).toBeOnTheScreen();
    expect(screen.getByText('15 min on NFL and NBA.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'See plans' }));

    expect(onComplete).toHaveBeenCalledWith(
      {
        goal: 'win',
        topics: ['nfl', 'nba'],
        minutes: 15,
        q4: 'a',
        q5: 'a',
        q6: 'a',
        q7: 'a',
        q8: 'b',
      },
      expect.objectContaining({ title: 'Built to win', variantIndex: 0 }),
    );

    expect(events()).toEqual([
      QUIZ_EVENTS.introViewed,
      QUIZ_EVENTS.started,
      ...Array.from({ length: 8 }, () => [
        QUIZ_EVENTS.questionViewed,
        QUIZ_EVENTS.questionAnswered,
      ]).flat(),
      QUIZ_EVENTS.completed,
      QUIZ_EVENTS.resultViewed,
      QUIZ_EVENTS.paywallHandoff,
    ]);
    expect(track).toHaveBeenCalledWith(
      QUIZ_EVENTS.questionAnswered,
      expect.objectContaining({
        quiz_id: 'test-quiz',
        quiz_version: 2,
        question_id: 'topics',
        question_number: 2,
        question_type: 'multiple',
        answer: ['nfl', 'nba'],
      }),
    );
  });

  it('goes back, keeps answers and tracks it', async () => {
    const { events } = await renderQuiz(makeQuiz({ intro: undefined }));
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: 'Have fun' }));
    await next();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('radio', { name: 'Have fun' })).toBeSelected();
    expect(events()).toContain(QUIZ_EVENTS.back);
  });

  it('tracks users who leave before the result', async () => {
    const { track, view } = await renderQuiz(makeQuiz({ intro: undefined }));
    await view.unmount();
    expect(track).toHaveBeenLastCalledWith(
      QUIZ_EVENTS.abandoned,
      expect.objectContaining({ last_step: 'question', question_id: 'goal' }),
    );
  });

  it('refuses an invalid config in development', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const quiz = makeQuiz();
    await expect(renderQuiz({ ...quiz, questions: quiz.questions.slice(0, 3) })).rejects.toThrow(
      /needs 8 to 15/,
    );
  });
});

describe('QuizSlider drag', () => {
  it('moves to the value under the finger, snapped to a step', async () => {
    await renderQuiz(
      makeQuiz({
        intro: undefined,
        questions: [
          makeQuiz().questions[2],
          ...makeQuiz().questions.filter((q) => q.id !== 'minutes'),
        ],
      }),
    );
    const slider = screen.getByRole('adjustable');
    await fireEvent(slider, 'layout', {
      nativeEvent: { layout: { width: 250, height: 40, x: 0, y: 0 } },
    });
    await fireEvent(slider, 'responderGrant', { nativeEvent: { locationX: 0, pageX: 100 } });
    expect(screen.getByText('5 min')).toBeOnTheScreen();
    await fireEvent(slider, 'responderMove', { nativeEvent: { locationX: 0, pageX: 290 } });
    // 190 / 250 of the 5–30 range is 24, which snaps to 25.
    expect(screen.getByText('25 min')).toBeOnTheScreen();
  });
});
