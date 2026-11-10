import { current, edit, promptError, publishBlockers, ruleSummary, type ReviewQuestion } from '../src/slate/reviewState';

const rule = {
  version: 1 as const,
  kind: 'player_stat_at_least' as const,
  sport: 'nba' as const,
  source_table: 'nba_player_box_scores' as const,
  game_id: '22600211',
  player_id: '1628973',
  player_name: 'Jalen Brunson',
  market: 'player_points',
  stats: ['pts'],
  threshold: 27,
  line: 26.5,
  void_if_player_inactive: true as const,
};

const now = new Date('2026-11-10T21:30:00Z');

function question(i: number, over: Partial<ReviewQuestion> = {}): ReviewQuestion {
  return {
    id: `q${i}`,
    position: i,
    sport: 'nba',
    game_label: 'MIL @ NYK',
    lock_at: '2026-11-11T00:30:00.000Z',
    prompt: `Will player ${i} score 27 or more points?`,
    generated_prompt: `Will player ${i} score 27 or more points?`,
    included: true,
    grading_rule: rule,
    stat_line: '27+ points in 5 of last 10 games',
    ...over,
  };
}

const six = [1, 2, 3, 4, 5, 6].map((i) => question(i));

describe('review edits', () => {
  it('tracks an edit and forgets it when undone', () => {
    let draft = edit({}, six[0], { prompt: 'Will Brunson drop 27 or more?' });
    expect(current(six[0], draft).prompt).toBe('Will Brunson drop 27 or more?');
    draft = edit(draft, six[0], { prompt: six[0].prompt });
    expect(draft).toEqual({});
  });

  it('keeps wording and inclusion edits together', () => {
    let draft = edit({}, six[0], { included: false });
    draft = edit(draft, six[0], { prompt: 'Will Brunson drop 27 or more?' });
    expect(draft).toEqual({ q1: { included: false, prompt: 'Will Brunson drop 27 or more?' } });
  });
});

describe('promptError', () => {
  it('wants a real question', () => {
    expect(promptError('Will Brunson score 27 or more points?')).toBeUndefined();
    expect(promptError('Short?')).toMatch(/at least/);
    expect(promptError('Will Brunson score 27 or more points')).toMatch(/question mark/);
  });
});

describe('publishBlockers', () => {
  it('allows a saved slate of 5 to 10 open questions', () => {
    expect(publishBlockers(six, {}, now)).toEqual([]);
  });

  it('asks to save first', () => {
    expect(publishBlockers(six, edit({}, six[0], { included: false }), now)).toContain('Save your edits first.');
  });

  it('needs at least 5 included questions', () => {
    const qs = six.map((q, i) => (i < 2 ? { ...q, included: false } : q));
    expect(publishBlockers(qs, {}, now)).toEqual(['Keep 5 to 10 questions (now 4).']);
  });

  it('refuses locked questions', () => {
    const qs = six.map((q, i) => (i === 0 ? { ...q, lock_at: '2026-11-10T21:00:00.000Z' } : q));
    expect(publishBlockers(qs, {}, now)).toEqual(['1 included question has already locked.']);
  });

  it('ignores dropped questions that have locked', () => {
    const qs = [...six, question(7, { included: false, lock_at: '2026-11-10T21:00:00.000Z' })];
    expect(publishBlockers(qs, {}, now)).toEqual([]);
  });
});

it('summarizes the grading rule', () => {
  expect(ruleSummary(rule)).toBe('Jalen Brunson: pts ≥ 27 (line 26.5). Void if inactive.');
});
