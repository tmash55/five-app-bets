import { GameRunner, type RoundSummary } from '@five/game';
import { Button, Screen, Text } from '@five/shell';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect } from 'react';

import { preloadFeedback, releaseFeedback } from '@/feedback/feedback';
import { findGame } from '@/games';
import { recordRound } from '@/scores/bestScores';
import { recordSkillRound } from '@/skills/history';
import { usePremium } from '@/workout/premium';
import { useTodayState } from '@/workout/useTodayState';
import { canPlay, markWorkoutGameDone } from '@/workout/workout';

/**
 * Plays one game full screen: start, countdown, 60-second round, results.
 * Every finished round updates the best score and the skill scores; opened
 * from the Today screen (`from=workout`) it also ticks the game off today's
 * workout.
 */
export default function PlayGame() {
  const { game: id, from } = useLocalSearchParams<{ game: string; from?: string }>();
  const game = findGame(id ?? '');
  const premium = usePremium();
  const { workout, refresh } = useTodayState();

  useEffect(() => {
    preloadFeedback();
    refresh();
    return releaseFeedback;
  }, [refresh]);

  const exit = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/')), []);
  const onFinish = useCallback(
    (summary: RoundSummary) => {
      if (!game) return;
      const saves: Promise<unknown>[] = [
        recordRound(game.module.id, summary),
        recordSkillRound(game.module, game.skill, summary),
      ];
      if (from === 'workout') saves.push(markWorkoutGameDone(game.module.id));
      Promise.all(saves).catch(() => {});
    },
    [game, from],
  );

  if (!game) {
    return (
      <Screen centered>
        <Text variant="heading">That game is not here.</Text>
        <Button title="Back to games" onPress={exit} />
      </Screen>
    );
  }
  // Wait for today's workout before deciding whether a free player can play.
  if (!workout) return <Screen centered>{null}</Screen>;
  if (!canPlay(game.module.id, workout, premium)) {
    return (
      <Screen centered>
        <Text variant="heading">{game.module.title} is part of Keen Premium.</Text>
        <Text color="textSecondary">Free players get one game a day: the first game of today&apos;s workout.</Text>
        <Button title="Back" onPress={exit} />
      </Screen>
    );
  }
  return <GameRunner game={game.module} onFinish={onFinish} onExit={exit} />;
}
