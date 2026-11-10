import type { LeagueSummary } from '../src/compete/standings';
import type { ResultPick, ResultQuestion } from '../src/results/resultsState';
import {
  bestPick,
  buildResultsCard,
  canShareResults,
  defaultShareLeague,
  headline,
  printedLink,
  shareMessage,
  shareMessageShort,
  suggestedLeagueName,
  xIntentUrl,
} from '../src/share/resultsCard';
import { readShareConfig } from '../src/share/shareConfig';

jest.mock('expo-linking', () => ({ createURL: (path: string) => `calledit://${path.replace(/^\//, '')}` }));

function q(id: string, position: number, over: Partial<ResultQuestion> = {}): ResultQuestion {
  return {
    id,
    position,
    sport: 'nba',
    game_label: 'MIL @ NYK',
    prompt: `Question ${id}?`,
    points: 10,
    result: 'yes',
    result_value: 30,
    void_reason: null,
    yes_picks: 10,
    no_picks: 10,
    ...over,
  };
}
function pick(id: string, answer: boolean, correct: boolean | null, base: number | null, bonus: number | null): ResultPick {
  return { question_id: id, answer, correct, base_points: base, bonus_points: bonus };
}

const questions = [
  q('a', 1, { yes_picks: 15, no_picks: 5 }),
  q('b', 2, { yes_picks: 2, no_picks: 18 }),
  q('c', 3, { result: 'no' }),
  q('d', 4, { result: 'void', void_reason: 'Did not play', result_value: null }),
];
const picks = {
  a: pick('a', true, true, 10, 0),
  b: pick('b', true, true, 10, 10),
  c: pick('c', true, false, 0, 0),
  d: pick('d', true, null, 0, 0),
};

describe('results card', () => {
  it('is shareable only when the whole slate is graded and the player has a graded pick', () => {
    expect(canShareResults(questions, picks)).toBe(true);
    expect(canShareResults([...questions, q('e', 5, { result: null })], picks)).toBe(false);
    expect(canShareResults(questions, {})).toBe(false);
    expect(canShareResults([questions[3]], { d: picks.d })).toBe(false);
    expect(canShareResults([], {})).toBe(false);
  });

  it('picks the correct call that earned the most, and says how few made it', () => {
    expect(bestPick(questions, picks)).toEqual({
      prompt: 'Question b?',
      answer: 'Yes',
      points: 20,
      crowd: 'Only 10% picked Yes',
    });
  });

  it('breaks a points tie with the less popular call, then the earlier question', () => {
    const qs = [q('a', 1, { yes_picks: 15, no_picks: 5 }), q('b', 2, { yes_picks: 8, no_picks: 12 }), q('c', 3, { yes_picks: 8, no_picks: 12 })];
    const ps = { a: pick('a', true, true, 10, 0), b: pick('b', true, true, 10, 0), c: pick('c', true, true, 10, 0) };
    expect(bestPick(qs, ps)?.prompt).toBe('Question b?');
  });

  it('has no best call on a night with nothing right', () => {
    expect(bestPick([q('c', 1, { result: 'no' })], { c: pick('c', true, false, 0, 0) })).toBeNull();
  });

  it('builds the card from the graded slate', () => {
    expect(buildResultsCard({ slateDate: '2026-11-10', questions, picks, streak: 6, displayName: 'Ana' })).toEqual({
      dateLabel: 'Tuesday, Nov 10',
      headline: 'Called 2 of 3',
      record: '2-1',
      points: 30,
      bonus: 10,
      bestPick: expect.objectContaining({ prompt: 'Question b?' }),
      streak: '6-day streak',
      displayName: 'Ana',
    });
  });

  it('leaves out a streak too short to brag about', () => {
    expect(buildResultsCard({ slateDate: '2026-11-10', questions, picks, streak: 1, displayName: null }).streak).toBeNull();
  });

  it('words the headline for perfect, mixed and empty nights', () => {
    expect(headline(5, 5)).toBe('Perfect 5 for 5');
    expect(headline(1, 1)).toBe('Called it');
    expect(headline(3, 5)).toBe('Called 3 of 5');
    expect(headline(0, 4)).toBe('Tough night');
  });

  it('puts the league invite link in the shared text', () => {
    const card = buildResultsCard({ slateDate: '2026-11-10', questions, picks, streak: 6, displayName: 'Ana' });
    expect(shareMessage(card, 'Sunday Crew', 'https://calledit.app/join/ABCD2345')).toBe(
      'I went 2-1 on Called It (30 pts). Join my league "Sunday Crew" and try to beat me: https://calledit.app/join/ABCD2345',
    );
    expect(shareMessageShort(card, 'Sunday Crew')).toContain('Join "Sunday Crew"');
    expect(printedLink('https://calledit.app/join/ABCD2345')).toBe('calledit.app/join/ABCD2345');
  });

  it('builds the X composer link with text and url encoded', () => {
    expect(xIntentUrl('I went 2-1 & won', 'https://calledit.app/join/ABCD2345')).toBe(
      'https://x.com/intent/post?text=I%20went%202-1%20%26%20won&url=https%3A%2F%2Fcalledit.app%2Fjoin%2FABCD2345',
    );
  });
});

describe('which league the link invites to', () => {
  const league = (id: string, over: Partial<LeagueSummary>): LeagueSummary => ({
    id,
    name: id,
    invite_code: 'ABCD2345',
    season_start: '2026-11-10',
    member_count: 1,
    is_owner: false,
    my_rank: null,
    my_points: null,
    ...over,
  });

  it('prefers a league the player owns, then the biggest', () => {
    expect(defaultShareLeague([league('big', { member_count: 9 }), league('mine', { is_owner: true, member_count: 2 })])?.id).toBe('mine');
    expect(defaultShareLeague([league('small', { member_count: 2 }), league('big', { member_count: 9 })])?.id).toBe('big');
    expect(defaultShareLeague([])).toBeNull();
  });

  it('suggests a first league name that fits the 30-character limit', () => {
    expect(suggestedLeagueName('Ana')).toBe("Ana's League");
    expect(suggestedLeagueName(null)).toBe('My Called It League');
    expect(suggestedLeagueName('A'.repeat(25))).toBe('My Called It League');
  });
});

describe('share config', () => {
  it('turns features off when values are missing', () => {
    expect(readShareConfig({})).toEqual({ inviteHost: null, metaAppId: null });
  });

  it('reads a host and Meta app ID', () => {
    expect(readShareConfig({ EXPO_PUBLIC_INVITE_LINK_HOST: ' CalledIt.app ', EXPO_PUBLIC_META_APP_ID: '1234567890' })).toEqual({
      inviteHost: 'calledit.app',
      metaAppId: '1234567890',
    });
  });

  it('refuses a host with a scheme or path, and a non-numeric app ID', () => {
    expect(() => readShareConfig({ EXPO_PUBLIC_INVITE_LINK_HOST: 'https://calledit.app' })).toThrow(/bare host name/);
    expect(() => readShareConfig({ EXPO_PUBLIC_INVITE_LINK_HOST: 'calledit.app/join' })).toThrow(/bare host name/);
    expect(() => readShareConfig({ EXPO_PUBLIC_META_APP_ID: 'abc' })).toThrow(/numeric/);
  });
});

describe('invite link', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { inviteUrl } = require('../src/invite/inviteUrl') as typeof import('../src/invite/inviteUrl');

  it('uses the web host when one is set, so it works without the app', () => {
    expect(inviteUrl('ABCD2345', 'calledit.app')).toBe('https://calledit.app/join/ABCD2345');
  });

  it('falls back to the app scheme without a host', () => {
    expect(inviteUrl('ABCD2345', null)).toBe('calledit://join/ABCD2345');
  });
});
