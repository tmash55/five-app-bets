import nba from './fixtures/nba-2026-11-10.json';
import nfl from './fixtures/nfl-2026-11-15.json';
import {
  easternDate,
  easternTipoff,
  generateSlate,
  noVigOver,
  thresholdFor,
  type NbaPropRow,
  type NflGameRow,
  type NflPropRow,
} from '../supabase/functions/_shared/slate/index.ts';

// Fixtures are a snapshot of real Unjuiced rows: three NBA games on
// 2026-11-10 and five NFL games on 2026-11-15.
const nbaRows = nba as unknown as NbaPropRow[];
const nflRows = nfl.rows as unknown as NflPropRow[];
const nflGames = nfl.games as unknown as NflGameRow[];

const afternoon = new Date('2026-11-10T21:30:00Z');

describe('time helpers', () => {
  it('turns an NBA tip-off into UTC in winter and summer', () => {
    expect(easternTipoff('2026-11-10', '7:30 pm ET')).toBe('2026-11-11T00:30:00.000Z');
    expect(easternTipoff('2026-11-10', '11:00 pm ET')).toBe('2026-11-11T04:00:00.000Z');
    expect(easternTipoff('2026-06-10', '8:00 pm ET')).toBe('2026-06-11T00:00:00.000Z');
    expect(easternTipoff('2026-11-10', '12:00 pm ET')).toBe('2026-11-10T17:00:00.000Z');
  });

  it('returns null once a game has started', () => {
    expect(easternTipoff('2026-11-10', 'Final')).toBeNull();
    expect(easternTipoff('2026-11-10', 'Q3 3:10')).toBeNull();
    expect(easternTipoff('2026-11-10', null)).toBeNull();
  });

  it('uses the Eastern date, not the UTC date', () => {
    expect(easternDate(new Date('2026-11-11T03:00:00Z'))).toBe('2026-11-10');
    expect(easternDate(new Date('2026-11-11T05:30:00Z'))).toBe('2026-11-11');
  });
});

describe('odds helpers', () => {
  it('removes the vig', () => {
    expect(noVigOver(-110, -110)).toBeCloseTo(0.5);
    expect(noVigOver('+150', '-180')).toBeCloseTo(0.4 / (0.4 + 0.642857), 4);
    expect(noVigOver(null, -110)).toBeNull();
  });

  it('asks for the next whole number above a half-point line', () => {
    expect(thresholdFor(26.5)).toBe(27);
    expect(thresholdFor(0.5)).toBe(1);
    expect(thresholdFor(25)).toBeNull();
  });
});

describe('generateSlate', () => {
  const slate = generateSlate({ slateDate: '2026-11-10', now: afternoon, nba: nbaRows, nfl: [], nflGames: [] });

  it('builds 5 to 10 questions with no notes', () => {
    expect(slate.questions.length).toBeGreaterThanOrEqual(5);
    expect(slate.questions.length).toBeLessThanOrEqual(10);
    expect(slate.notes).toEqual([]);
  });

  it('asks plain yes/no questions about real players', () => {
    for (const q of slate.questions) {
      expect(q.prompt).toMatch(/^Will .+ (or more .+|a three|a touchdown)\?$/);
    }
    expect(slate.questions.map((q) => q.prompt)).toContain('Will Jalen Brunson score 27 or more points?');
  });

  it('uses each player once and spreads questions across games', () => {
    const players = slate.questions.map((q) => q.grading_rule.player_id);
    expect(new Set(players).size).toBe(players.length);
    expect(new Set(slate.questions.map((q) => q.game_id)).size).toBe(3);
  });

  it('locks each question at its game start, in order', () => {
    const locks = slate.questions.map((q) => q.lock_at);
    expect([...locks].sort()).toEqual(locks);
    for (const q of slate.questions) {
      expect(q.lock_at).toBe(q.starts_at);
      expect(Date.parse(q.lock_at)).toBeGreaterThan(afternoon.getTime());
    }
    expect(slate.questions.map((q) => q.position)).toEqual(slate.questions.map((_, i) => i + 1));
  });

  it('stores a grading rule that matches the prompt and line', () => {
    for (const q of slate.questions) {
      const rule = q.grading_rule;
      expect(rule.threshold).toBe(Math.ceil(rule.line));
      expect(q.prompt).toContain(rule.player_name);
      expect(rule.source_table).toBe('nba_player_box_scores');
      expect(rule.stats.length).toBeGreaterThan(0);
      expect(rule.void_if_player_inactive).toBe(true);
    }
  });

  it('attaches one stat line from the last 10 games', () => {
    const brunson = slate.questions.find((q) => q.prompt.includes('Brunson'))!;
    expect(brunson.stat_line).toBe('27+ points in 5 of last 10 games · averaging 28.1');
  });

  it('leaves out injured players and lopsided lines', () => {
    const injured = new Set(
      nbaRows
        .filter((r) => ['out', 'doubtful', 'questionable'].includes(r.injury_status ?? ''))
        .map((r) => String(r.player_id)),
    );
    expect(injured.size).toBeGreaterThan(0);
    for (const q of slate.questions) {
      expect(injured.has(q.grading_rule.player_id)).toBe(false);
      expect(q.source.yes_chance).toBeGreaterThanOrEqual(0.3);
      expect(q.source.yes_chance).toBeLessThanOrEqual(0.7);
    }
  });

  it('skips games that have already started', () => {
    const late = new Date('2026-11-11T01:30:00Z'); // NYK and PHI games are under way
    const later = generateSlate({ slateDate: '2026-11-10', now: late, nba: nbaRows, nfl: [], nflGames: [] });
    expect(later.questions.length).toBeGreaterThan(0);
    expect(later.questions.every((q) => q.game_label === 'OKC @ POR')).toBe(true);
  });

  it('says so when too few questions meet the bar', () => {
    const thin = generateSlate({
      slateDate: '2026-11-10',
      now: afternoon,
      nba: nbaRows.filter((r) => r.market === 'player_points' && r.game_id === 22600211),
      nfl: [],
      nflGames: [],
    });
    expect(thin.questions.length).toBeLessThan(5);
    expect(thin.notes[0]).toMatch(/^Only \d questions met the bar for 2026-11-10\./);
  });

  it('says so when there is nothing to play', () => {
    const empty = generateSlate({ slateDate: '2026-11-12', now: afternoon, nba: nbaRows, nfl: [], nflGames: [] });
    expect(empty.questions).toEqual([]);
    expect(empty.notes).toEqual(['No NBA or NFL games with live props are left to play on 2026-11-12.']);
  });

  it('builds an NFL slate with kickoff lock times', () => {
    const sunday = generateSlate({ slateDate: '2026-11-15', now: afternoon, nba: [], nfl: nflRows, nflGames });
    expect(sunday.questions.length).toBeGreaterThanOrEqual(5);
    for (const q of sunday.questions) {
      const game = nflGames.find((g) => g.game_id === q.game_id)!;
      expect(q.lock_at).toBe(new Date(game.scheduled_at!).toISOString());
      expect(q.grading_rule.source_table).toBe('nfl_player_game_logs');
    }
    const td = sunday.questions.find((q) => q.grading_rule.market === 'player_touchdowns');
    if (td) {
      expect(td.prompt).toMatch(/score a touchdown\?$/);
      expect(td.grading_rule.stats).toEqual(['rushing_touchdowns', 'receiving_touchdowns']);
    }
  });

  it('is deterministic', () => {
    const again = generateSlate({ slateDate: '2026-11-10', now: afternoon, nba: nbaRows, nfl: [], nflGames: [] });
    expect(again).toEqual(slate);
  });
});
