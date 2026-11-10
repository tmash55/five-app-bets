import { GameRunner, type RoundSummary } from '@five/game';
import { Screen, Text, Button } from '@five/shell';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect } from 'react';

import { preloadFeedback, releaseFeedback } from '@/feedback/feedback';
import { findGame } from '@/games';
import { recordRound } from '@/scores/bestScores';

/** Plays one game full screen: start, countdown, 60-second round, results. */
export default function PlayGame() {
  const { game: id } = useLocalSearchParams<{ game: string }>();
  const game = findGame(id ?? '');

  useEffect(() => {
    preloadFeedback();
    return releaseFeedback;
  }, []);

  const exit = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/')), []);
  const onFinish = useCallback(
    (summary: RoundSummary) => {
      if (game) recordRound(game.module.id, summary).catch(() => {});
    },
    [game],
  );

  if (!game) {
    return (
      <Screen centered>
        <Text variant="heading">That game is not here.</Text>
        <Button title="Back to games" onPress={exit} />
      </Screen>
    );
  }
  return <GameRunner game={game.module} onFinish={onFinish} onExit={exit} />;
}
