import { defaultSliderValue } from './answers';
import type { AnswerValue, QuizAnswers, QuizConfig } from './types';

export type QuizStep = { kind: 'intro' } | { kind: 'question'; index: number } | { kind: 'result' };

export type QuizState = { step: QuizStep; answers: QuizAnswers };

export type QuizAction =
  | { type: 'start' }
  | { type: 'answer'; questionId: string; value: AnswerValue }
  | { type: 'next' }
  | { type: 'back' };

/** Moves to a question, pre-filling a slider so it can be accepted as it starts. */
function goToQuestion(config: QuizConfig, answers: QuizAnswers, index: number): QuizState {
  const q = config.questions[index];
  const filled =
    q?.type === 'slider' && answers[q.id] === undefined
      ? { ...answers, [q.id]: defaultSliderValue(q) }
      : answers;
  return { step: { kind: 'question', index }, answers: filled };
}

export function initialQuizState(config: QuizConfig): QuizState {
  return config.intro ? { step: { kind: 'intro' }, answers: {} } : goToQuestion(config, {}, 0);
}

export function quizReducer(config: QuizConfig) {
  return (state: QuizState, action: QuizAction): QuizState => {
    const { step } = state;
    switch (action.type) {
      case 'start':
        return step.kind === 'intro' ? goToQuestion(config, state.answers, 0) : state;
      case 'answer':
        return { ...state, answers: { ...state.answers, [action.questionId]: action.value } };
      case 'next': {
        if (step.kind !== 'question') return state;
        const index = step.index + 1;
        if (index >= config.questions.length) return { ...state, step: { kind: 'result' } };
        return goToQuestion(config, state.answers, index);
      }
      case 'back': {
        if (step.kind === 'result') {
          return { ...state, step: { kind: 'question', index: config.questions.length - 1 } };
        }
        if (step.kind !== 'question') return state;
        if (step.index === 0) return config.intro ? { ...state, step: { kind: 'intro' } } : state;
        return { ...state, step: { kind: 'question', index: step.index - 1 } };
      }
    }
  };
}

/** Fraction of the quiz done, from 0 to 1, for the progress bar. */
export function quizProgress(config: QuizConfig, step: QuizStep): number {
  if (step.kind === 'intro') return 0;
  if (step.kind === 'result') return 1;
  return (step.index + 1) / config.questions.length;
}
