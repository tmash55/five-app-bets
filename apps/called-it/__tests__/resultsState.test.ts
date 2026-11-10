import {
  crowdLine,
  rowDetail,
  rowStatus,
  slateDateLabel,
  streakLabel,
  summarize,
  type ResultPick,
  type ResultQuestion,
} from '../src/results/resultsState';

const q = (id: string, over: Partial<ResultQuestion> = {}): ResultQuestion => ({
  id,
  position: 1,
  sport: 'nba',
  game_label: 'MIL @ NYK',
  prompt: 'Will Jalen Brunson score 27 or more points?',
  points: 10,
  result: 'yes',
  result_value: 31,
  void_reason: null,
  yes_picks: 2,
  no_picks: 8,
  ...over,
});
const pick = (question_id: string, over: Partial<ResultPick> = {}): ResultPick => ({
  question_id,
  answer: true,
  correct: true,
  base_points: 10,
  bonus_points: 10,
  ...over,
});

it('gives each row a status', () => {
  expect(rowStatus(q('a'), pick('a'))).toBe('correct');
  expect(rowStatus(q('a', { result: 'no' }), pick('a', { correct: false }))).toBe('wrong');
  expect(rowStatus(q('a', { result: 'void' }), pick('a'))).toBe('void');
  expect(rowStatus(q('a', { result: null }), pick('a', { correct: null }))).toBe('pending');
  expect(rowStatus(q('a', { result: null }), undefined)).toBe('pending');
  expect(rowStatus(q('a'), undefined)).toBe('no_pick');
});

it('adds up points, bonus and correct picks', () => {
  const questions = [q('a'), q('b', { result: 'no' }), q('c', { result: 'void' }), q('d', { result: null })];
  const picks = {
    a: pick('a'),
    b: pick('b', { correct: false, base_points: 0, bonus_points: 0 }),
    c: pick('c', { correct: null, base_points: 0, bonus_points: 0 }),
    d: pick('d', { correct: null, base_points: null, bonus_points: null }),
  };
  expect(summarize(questions, picks)).toEqual({
    points: 20,
    correct: 1,
    graded: 2,
    pending: 1,
    bonus: 10,
    allGraded: false,
  });
});

it('says how the crowd picked', () => {
  expect(crowdLine(q('a'), true)).toBe('Only 20% picked Yes');
  expect(crowdLine(q('a'), false)).toBe('80% picked No');
  expect(crowdLine(q('a', { yes_picks: null, no_picks: null }), true)).toBeNull();
  expect(crowdLine(q('a'), undefined)).toBeNull();
});

it('explains each row', () => {
  expect(rowDetail(q('a'), pick('a'))).toBe('You picked Yes · +20 pts (+10 bonus) · Final: 31');
  expect(rowDetail(q('a', { result: 'no', result_value: 22.5 }), pick('a', { correct: false }))).toBe(
    'You picked Yes · 0 pts · Final: 22.5',
  );
  expect(rowDetail(q('a', { result: 'void', result_value: null, void_reason: 'Game postponed' }), pick('a'))).toBe(
    'Game postponed · No points either way',
  );
  expect(rowDetail(q('a', { result: null, result_value: null }), pick('a', { answer: false }))).toBe(
    'You picked No · Waiting for the final',
  );
});

it('formats the date and streak', () => {
  expect(slateDateLabel('2026-11-10')).toBe('Tuesday, Nov 10');
  expect(streakLabel(1)).toBe('1-day streak');
  expect(streakLabel(6)).toBe('6-day streak');
});
