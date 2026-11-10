import { createSession, questionTimeLeft, roundTimeLeft, type SessionAction, type SessionState } from '../core/session';
import type { GameModule } from '../types';

type Q = { value: number };
type A = number;

const game: GameModule<Q, A> = {
  id: 'echo',
  title: 'Echo',
  instructions: 'Type the number.',
  levels: 3,
  round: { durationMs: 10_000, questionTimeLimitMs: 2000 },
  targetResponseMs: () => 1000,
  createQuestion: (level, rng) => ({ value: level * 100 + rng.int(0, 99) }),
  isCorrect: (q, a) => q.value === a,
  Board: () => null,
};

function run(actions: SessionAction<A>[], target: GameModule<Q, A> = game, countdownSeconds = 3) {
  const session = createSession(target, { countdownSeconds, seed: 5 });
  return actions.reduce<SessionState<Q>>(session.reducer, session.initialState);
}

const answerCorrect = (state: SessionState<Q>, now: number): Extract<SessionAction<A>, { type: 'answer' }> => ({
  type: 'answer',
  answer: state.question!.value,
  now,
  questionIndex: state.answers.length,
});

describe('session', () => {
  it('counts down, then starts the round with a question', () => {
    const counting = run([{ type: 'start', now: 0 }, { type: 'tick', now: 2900 }]);
    expect(counting.phase).toBe('countdown');
    const playing = run([{ type: 'start', now: 0 }, { type: 'tick', now: 3000 }]);
    expect(playing.phase).toBe('playing');
    expect(playing.question).not.toBeNull();
  });

  it('scores answers by accuracy and speed and ends when time is up', () => {
    const session = createSession(game, { countdownSeconds: 0, seed: 5 });
    let state = session.reducer(session.initialState, { type: 'start', now: 0 });
    state = session.reducer(state, answerCorrect(state, 400)); // 100 + 30 speed
    state = session.reducer(state, { type: 'answer', answer: -1, now: 900, questionIndex: 1 });
    expect(state.score).toBe(130);
    expect(state.lastFeedback).toMatchObject({ id: 2, correct: false });
    expect(roundTimeLeft(state, game.round, 900)).toBe(9100);
    state = session.reducer(state, { type: 'tick', now: 10_000 });
    expect(state.phase).toBe('results');
    expect(state.endedBy).toBe('time');
    expect(state.summary).toMatchObject({ score: 130, answered: 2, correct: 1 });
  });

  it('ignores a double tap meant for the previous question', () => {
    const session = createSession(game, { countdownSeconds: 0, seed: 5 });
    let state = session.reducer(session.initialState, { type: 'start', now: 0 });
    const tap = answerCorrect(state, 300);
    state = session.reducer(state, tap);
    state = session.reducer(state, { ...tap, now: 320 });
    expect(state.answers).toHaveLength(1);
  });

  it('counts a question as missed when its time limit runs out', () => {
    const state = run([{ type: 'start', now: 0 }, { type: 'tick', now: 2000 }], game, 0);
    expect(state.answers).toEqual([expect.objectContaining({ correct: false, timedOut: true, responseMs: 2000 })]);
    expect(questionTimeLeft(state, game.round, 2000)).toBe(2000);
  });

  it('stops the clock while paused', () => {
    const session = createSession(game, { countdownSeconds: 0, seed: 5 });
    let state = session.reducer(session.initialState, { type: 'start', now: 0 });
    state = session.reducer(state, { type: 'pause', now: 1000 });
    state = session.reducer(state, { type: 'tick', now: 60_000 });
    expect(state.phase).toBe('paused');
    state = session.reducer(state, { type: 'resume', now: 60_000 });
    expect(roundTimeLeft(state, game.round, 60_500)).toBe(8500);
    state = session.reducer(state, answerCorrect(state, 60_500)); // 1.5s on this question
    expect(state.answers[0]).toMatchObject({ correct: true, responseMs: 1500 });
  });

  it('raises the level for a strong player and keeps questions on that level', () => {
    const session = createSession(game, { countdownSeconds: 0, seed: 5 });
    let state = session.reducer(session.initialState, { type: 'start', now: 0 });
    for (let i = 0; i < 4; i += 1) state = session.reducer(state, answerCorrect(state, (i + 1) * 200));
    expect(state.difficulty.level).toBe(2);
    expect(state.lastFeedback?.levelChange).toBe('up');
    expect(state.question!.value).toBeGreaterThanOrEqual(200);
  });

  it('ends after a fixed number of questions', () => {
    const quiz = { ...game, round: { questions: 2 } };
    const session = createSession(quiz, { countdownSeconds: 0, seed: 5 });
    let state = session.reducer(session.initialState, { type: 'start', now: 0 });
    state = session.reducer(state, answerCorrect(state, 100));
    state = session.reducer(state, answerCorrect(state, 200));
    expect(state).toMatchObject({ phase: 'results', endedBy: 'questions' });
  });

  it('replays the same questions from the same seed', () => {
    const a = run([{ type: 'start', now: 0, seed: 77 }], game, 0);
    const b = run([{ type: 'start', now: 0, seed: 77 }], game, 0);
    expect(a.question).toEqual(b.question);
  });

  it('rejects a game with no way to end a round', () => {
    expect(() => createSession({ ...game, round: {} })).toThrow(/must set round/);
  });
});
