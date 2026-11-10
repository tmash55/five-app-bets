import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RoundSummary } from '@five/game';
import { useCallback, useState } from 'react';

/**
 * Best score per game, kept on the device. Daily workouts and skill scores
 * (UNJ-1434) will build on the round summaries the games report.
 */
const key = (gameId: string) => `keen.best.${gameId}`;

export async function readBest(gameId: string): Promise<number | null> {
  const value = await AsyncStorage.getItem(key(gameId));
  const best = value === null ? NaN : Number(value);
  return Number.isFinite(best) ? best : null;
}

/** Saves the round if it beat the best score. Returns true for a new best. */
export async function recordRound(gameId: string, summary: RoundSummary): Promise<boolean> {
  const best = await readBest(gameId);
  if (best !== null && summary.score <= best) return false;
  await AsyncStorage.setItem(key(gameId), String(summary.score));
  return true;
}

/** Best scores for the given games; `refresh` reads them; call it when the screen gains focus. */
export function useBestScores(gameIds: string[]) {
  const [scores, setScores] = useState<Record<string, number | null>>({});
  const ids = gameIds.join(',');
  const refresh = useCallback(async () => {
    const entries = await Promise.all(
      ids.split(',').map(async (id) => [id, await readBest(id).catch(() => null)] as const),
    );
    setScores(Object.fromEntries(entries));
  }, [ids]);
  return { scores, refresh };
}
