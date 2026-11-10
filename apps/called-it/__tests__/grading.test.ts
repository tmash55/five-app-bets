import {
  canSendResultsPush,
  gameKey,
  gradeQuestion,
  nbaGames,
  nflGames,
  planGrading,
  resultsPush,
  type OpenQuestion,
} from '../supabase/functions/_shared/grading/index.ts';
import type { GradingRule } from '../supabase/functions/_shared/slate/types.ts';

const START = '2026-11-11T00:30:00.000Z'; // 7:30 pm ET on Nov 10
const hoursAfter = (h: number) => new Date(Date.parse(START) + h * 3600_000);

function nbaRule(over: Partial<GradingRule> = {}): GradingRule {
  return {
    version: 1,
    kind: 'player_stat_at_least',
    sport: 'nba',
    source_table: 'nba_player_box_scores',
    game_id: '22600123',
    player_id: '1628973',
    player_name: 'Jalen Brunson',
    market: 'player_points',
    stats: ['pts'],
    threshold: 27,
    line: 26.5,
    void_if_player_inactive: true,
    ...over,
  };
}

function question(rule: GradingRule, id = 'q1'): OpenQuestion {
  return { id, slate_id: 's1', sport: rule.sport, game_id: rule.game_id, starts_at: START, grading_rule: rule };
}

const finalNba = (box: Record<string, unknown>[], status = 3, text = 'Final') =>
  nbaGames(
    [{ game_id: '0022600123', game_date: '2026-11-10', game_status: status, game_status_text: text }],
    box.map((b) => ({ game_id: 22600123, ...b })) as never,
  );

describe('gradeQuestion (NBA)', () => {
  const q = question(nbaRule());
  const g = (games: ReturnType<typeof nbaGames>) => games.get(gameKey(q));

  it('matches a zero-padded nba_games id to the rule id', () => {
    expect(gameKey(q)).toBe('22600123');
    expect(finalNba([]).has('22600123')).toBe(true);
  });

  it('grades Yes when the stat reaches the threshold and No below it', () => {
    const yes = gradeQuestion(q, g(finalNba([{ player_id: 1628973, minutes: 36, pts: 27 }])), hoursAfter(3));
    expect(yes).toEqual({ kind: 'settled', result: 'yes', value: 27, voidReason: null });
    const no = gradeQuestion(q, g(finalNba([{ player_id: 1628973, minutes: 36, pts: 26 }])), hoursAfter(3));
    expect(no).toMatchObject({ result: 'no', value: 26 });
  });

  it('sums every stat in the rule', () => {
    const pra = question(nbaRule({ stats: ['pts', 'reb', 'ast'], threshold: 40 }));
    const games = finalNba([{ player_id: 1628973, minutes: 38, pts: '25', reb: 6, ast: 9 }]);
    expect(gradeQuestion(pra, games.get(gameKey(pra)), hoursAfter(3))).toMatchObject({ result: 'yes', value: 40 });
  });

  it('waits while the game is live', () => {
    const live = finalNba([{ player_id: 1628973, minutes: 20, pts: 30 }], 2, 'Q3 3:10');
    expect(gradeQuestion(q, g(live), hoursAfter(2))).toEqual({ kind: 'pending', why: 'Game not final' });
  });

  it('voids postponed and cancelled games', () => {
    for (const text of ['Postponed', 'PPD', 'Cancelled']) {
      const games = finalNba([], 1, text);
      expect(gradeQuestion(q, g(games), hoursAfter(1))).toMatchObject({ kind: 'settled', result: 'void' });
    }
  });

  it('voids when the player did not play, but only after the grace period', () => {
    const dnp = finalNba([
      { player_id: 1628973, minutes: 0, pts: 0 },
      { player_id: 1, minutes: 30, pts: 12 },
    ]);
    expect(gradeQuestion(q, g(dnp), hoursAfter(3))).toMatchObject({ kind: 'pending' });
    expect(gradeQuestion(q, g(dnp), hoursAfter(6))).toEqual({
      kind: 'settled',
      result: 'void',
      value: null,
      voidReason: 'Jalen Brunson did not play',
    });
    const missing = finalNba([{ player_id: 1, minutes: 30, pts: 12 }]);
    expect(gradeQuestion(q, g(missing), hoursAfter(7))).toMatchObject({ result: 'void' });
  });

  it('does not void a final game whose box score has not arrived yet', () => {
    expect(gradeQuestion(q, g(finalNba([])), hoursAfter(8))).toEqual({ kind: 'pending', why: 'Waiting for stats' });
    expect(gradeQuestion(q, g(finalNba([])), hoursAfter(36))).toMatchObject({ result: 'void' });
  });

  it('voids a game that never goes final', () => {
    expect(gradeQuestion(q, undefined, hoursAfter(35))).toMatchObject({ kind: 'pending' });
    expect(gradeQuestion(q, undefined, hoursAfter(36))).toMatchObject({
      result: 'void',
      voidReason: 'No final result 36 hours after the start',
    });
  });

  it('refuses rules it does not understand instead of guessing', () => {
    const odd = question({ ...nbaRule(), kind: 'team_margin' } as unknown as GradingRule);
    expect(gradeQuestion(odd, undefined, hoursAfter(40))).toMatchObject({ kind: 'error' });
    const bad = finalNba([{ player_id: 1628973, minutes: 30, pts: 'n/a' }]);
    expect(gradeQuestion(q, g(bad), hoursAfter(3))).toMatchObject({ kind: 'error' });
  });
});

describe('gradeQuestion (NFL)', () => {
  const rule: GradingRule = {
    version: 1,
    kind: 'player_stat_at_least',
    sport: 'nfl',
    source_table: 'nfl_player_game_logs',
    game_id: '2026_10_KC_ATL',
    player_id: '00-0036389',
    player_name: 'Bijan Robinson',
    market: 'player_touchdowns',
    stats: ['rushing_touchdowns', 'receiving_touchdowns'],
    threshold: 1,
    line: 0.5,
    void_if_player_inactive: true,
  };
  const q = question(rule);
  const game = (status: string, completed: boolean, logs: Record<string, unknown>[]) =>
    nflGames(
      [{ game_id: rule.game_id, scheduled_at: START, home_team_abbr: 'ATL', away_team_abbr: 'KC', status, completed }],
      logs.map((l) => ({ game_id: rule.game_id, ...l })) as never,
    ).get(rule.game_id);

  it('counts a receiving touchdown for "score a touchdown"', () => {
    const g = game('final', true, [{ player_id: rule.player_id, played: true, rushing_touchdowns: 0, receiving_touchdowns: 1 }]);
    expect(gradeQuestion(q, g, hoursAfter(4))).toMatchObject({ result: 'yes', value: 1 });
  });

  it('treats a missing stat as zero for a player who played', () => {
    const g = game('final', true, [{ player_id: rule.player_id, played: true, rushing_touchdowns: null }]);
    expect(gradeQuestion(q, g, hoursAfter(4))).toMatchObject({ result: 'no', value: 0 });
  });

  it('voids when the log says the player did not play', () => {
    const g = game('final', true, [{ player_id: rule.player_id, played: false }]);
    expect(gradeQuestion(q, g, hoursAfter(7))).toMatchObject({ result: 'void' });
  });

  it('voids postponed games and waits on scheduled ones', () => {
    expect(gradeQuestion(q, game('postponed', false, []), hoursAfter(1))).toMatchObject({ result: 'void' });
    expect(gradeQuestion(q, game('in_progress', false, []), hoursAfter(1))).toMatchObject({ kind: 'pending' });
  });
});

describe('planGrading', () => {
  it('splits questions into settled, pending and errors', () => {
    const settled = question(nbaRule(), 'q1');
    const waiting = question(nbaRule({ game_id: '22600999' }), 'q2');
    const broken = question({ ...nbaRule(), version: 2 } as unknown as GradingRule, 'q3');
    const plan = planGrading(
      [settled, waiting, broken],
      { nba: finalNba([{ player_id: 1628973, minutes: 30, pts: 31 }]), nfl: new Map() },
      hoursAfter(3),
    );
    expect(plan.settle).toEqual([{ question_id: 'q1', result: 'yes', value: 31, void_reason: null }]);
    expect(plan.pending.map((p) => p.id)).toEqual(['q2']);
    expect(plan.errors.map((e) => e.id)).toEqual(['q3']);
  });
});

describe('results push', () => {
  it('holds overnight (11 pm to 9 am Eastern) and sends in the day', () => {
    expect(canSendResultsPush(new Date('2026-11-11T05:00:00Z'))).toBe(false); // midnight ET
    expect(canSendResultsPush(new Date('2026-11-11T04:30:00Z'))).toBe(false); // 11:30 pm ET
    expect(canSendResultsPush(new Date('2026-11-11T13:59:00Z'))).toBe(false); // 8:59 am ET
    expect(canSendResultsPush(new Date('2026-11-11T14:00:00Z'))).toBe(true); // 9:00 am ET
    expect(canSendResultsPush(new Date('2026-11-11T03:00:00Z'))).toBe(true); // 10 pm ET
  });

  it('opens the results for that slate', () => {
    expect(resultsPush('2026-11-10')).toEqual({
      title: 'Your results are in',
      body: 'See how your Tuesday picks did and how many points you earned.',
      data: { url: '/results?date=2026-11-10' },
    });
  });
});
