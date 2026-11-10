import {
  formatAnswer,
  isAnswerComplete,
  resolveResult,
  snapSliderValue,
  toggleMultiple,
} from '../onboarding/answers';
import { initialQuizState, quizProgress, quizReducer } from '../onboarding/quizState';
import type { MultipleChoiceQuestion, SliderQuestion } from '../onboarding/types';
import { assertValidQuizConfig, validateQuizConfig } from '../onboarding/validate';
import { makeQuiz } from '../test-utils/quizFixture';

describe('validateQuizConfig', () => {
  it('accepts a valid quiz', () => {
    expect(validateQuizConfig(makeQuiz())).toEqual([]);
  });

  it('rejects fewer than 8 or more than 15 questions', () => {
    const quiz = makeQuiz();
    expect(validateQuizConfig({ ...quiz, questions: quiz.questions.slice(0, 7) })).toContainEqual(
      expect.stringContaining('needs 8 to 15'),
    );
    const many = Array.from({ length: 16 }, (_, i) => ({ ...quiz.questions[3], id: `x${i}` }));
    expect(validateQuizConfig({ ...quiz, questions: many })).toContainEqual(
      expect.stringContaining('has 16 questions'),
    );
  });

  it('catches duplicate ids, bad sliders and unknown references', () => {
    const quiz = makeQuiz();
    const questions = [...quiz.questions];
    questions[4] = { ...questions[4], id: 'goal' };
    questions[2] = { ...(questions[2] as SliderQuestion), min: 5, max: 31, step: 5 };
    const errors = validateQuizConfig({
      ...quiz,
      questions,
      result: {
        ...quiz.result,
        body: '{{nope}}',
        variants: [{ when: [{ question: 'goal', equals: 'lose' }] }],
      },
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('repeats an id'),
        expect.stringContaining('whole number of steps'),
        expect.stringContaining('unknown question "nope"'),
        expect.stringContaining('unknown option "lose"'),
      ]),
    );
    expect(() => assertValidQuizConfig({ ...quiz, questions })).toThrow(/Invalid onboarding quiz/);
  });
});

describe('answers', () => {
  const quiz = makeQuiz();
  const topics = quiz.questions[1] as MultipleChoiceQuestion;
  const minutes = quiz.questions[2] as SliderQuestion;

  it('snaps slider values to the step and range', () => {
    expect(snapSliderValue(minutes, 12)).toBe(10);
    expect(snapSliderValue(minutes, 13)).toBe(15);
    expect(snapSliderValue(minutes, 99)).toBe(30);
    expect(snapSliderValue(minutes, -4)).toBe(5);
  });

  it('caps multiple choice at maxSelections and keeps config order', () => {
    let answer = toggleMultiple(topics, undefined, 'mlb');
    answer = toggleMultiple(topics, answer, 'nfl');
    expect(answer).toEqual(['nfl', 'mlb']);
    expect(toggleMultiple(topics, answer, 'nba')).toEqual(['nfl', 'mlb']);
    expect(toggleMultiple(topics, answer, 'nfl')).toEqual(['mlb']);
  });

  it('knows when an answer is complete', () => {
    expect(isAnswerComplete(topics, [])).toBe(false);
    expect(isAnswerComplete(topics, ['nba'])).toBe(true);
    expect(isAnswerComplete(quiz.questions[0], 'fun')).toBe(true);
    expect(isAnswerComplete(quiz.questions[0], 'other')).toBe(false);
    expect(isAnswerComplete(minutes, 15)).toBe(true);
  });

  it('formats answers with labels and units', () => {
    expect(formatAnswer(topics, ['nfl', 'nba'])).toBe('NFL and NBA');
    expect(formatAnswer(minutes, 20)).toBe('20 min');
  });

  it('personalizes the result from answers and variants', () => {
    const answers = { goal: 'fun', topics: ['nfl', 'mlb'], minutes: 15 };
    expect(resolveResult(quiz, answers)).toEqual({
      title: 'Plan for Have fun',
      body: '15 min on NFL and MLB.',
      highlights: [{ label: 'Topics', value: 'NFL and MLB' }],
      ctaLabel: 'See plans',
      variantIndex: null,
    });
    const winner = resolveResult(quiz, { ...answers, goal: 'win' });
    expect(winner.title).toBe('Built to win');
    expect(winner.body).toBe('15 min on NFL and MLB.');
    expect(winner.variantIndex).toBe(0);
  });
});

describe('quizReducer', () => {
  const quiz = makeQuiz();
  const reduce = quizReducer(quiz);

  it('walks intro, questions and result, filling slider defaults', () => {
    let state = initialQuizState(quiz);
    expect(state.step).toEqual({ kind: 'intro' });
    state = reduce(state, { type: 'start' });
    expect(state.step).toEqual({ kind: 'question', index: 0 });
    state = reduce(state, { type: 'next' });
    state = reduce(state, { type: 'next' });
    expect(state.answers.minutes).toBe(10);
    expect(quizProgress(quiz, state.step)).toBeCloseTo(3 / 8);
    for (let i = 0; i < 6; i++) state = reduce(state, { type: 'next' });
    expect(state.step).toEqual({ kind: 'result' });
    state = reduce(state, { type: 'back' });
    expect(state.step).toEqual({ kind: 'question', index: 7 });
  });

  it('starts on the first question when there is no intro', () => {
    expect(initialQuizState(makeQuiz({ intro: undefined })).step).toEqual({
      kind: 'question',
      index: 0,
    });
  });
});
