import type { RoundSummary } from '@five/game';

import { readBest, recordRound } from '@/scores/bestScores';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const round = (score: number) => ({ score }) as RoundSummary;

it('keeps the best score per game', async () => {
  expect(await readBest('pairs')).toBeNull();
  expect(await recordRound('pairs', round(500))).toBe(true);
  expect(await recordRound('pairs', round(300))).toBe(false);
  expect(await recordRound('quick-sum', round(100))).toBe(true);
  expect(await readBest('pairs')).toBe(500);
  expect(await recordRound('pairs', round(800))).toBe(true);
  expect(await readBest('pairs')).toBe(800);
});
