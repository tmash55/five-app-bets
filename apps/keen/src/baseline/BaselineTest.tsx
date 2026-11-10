import type { RoundSummary } from '@five/game';
import { Button, Screen, Text, useAnalytics, useTheme } from '@five/shell';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { preloadFeedback, releaseFeedback } from '@/feedback/feedback';
import {
  BASELINE_GAMES,
  BASELINE_SECONDS,
  saveBaseline,
  scoreBaseline,
  type BaselineResult,
  type BaselineRound,
} from './baseline';
import { BaselineGame } from './BaselineGame';

export const BASELINE_EVENTS = {
  started: 'baseline_started',
  gameFinished: 'baseline_game_finished',
  completed: 'baseline_completed',
} as const;

const perGameSeconds = BASELINE_SECONDS / BASELINE_GAMES.length;

/**
 * The 60-second baseline test: for each game a short "how to play" card, then
 * the timed round. When the last round ends it scores the test, saves the
 * starting scores and calls `onDone`.
 */
export function BaselineTest({ onDone }: { onDone: (result: BaselineResult) => void }) {
  const theme = useTheme();
  const { track } = useAnalytics();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rounds, setRounds] = useState<BaselineRound[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    preloadFeedback();
    return releaseFeedback;
  }, []);

  const game = BASELINE_GAMES[index];

  const begin = useCallback(() => {
    if (index === 0) track(BASELINE_EVENTS.started, { game_count: BASELINE_GAMES.length });
    setPlaying(true);
  }, [index, track]);

  const finishGame = useCallback(
    (summary: RoundSummary) => {
      const next = [...rounds, { gameId: game.module.id, summary }];
      track(BASELINE_EVENTS.gameFinished, {
        game_id: game.module.id,
        score: summary.score,
        accuracy: summary.accuracy,
        highest_level: summary.highestLevel,
      });
      setRounds(next);
      setPlaying(false);
      if (index + 1 < BASELINE_GAMES.length) {
        setIndex(index + 1);
        return;
      }
      const result = scoreBaseline(next);
      track(BASELINE_EVENTS.completed, {
        keen_score: result.keenScore,
        memory_score: result.scores.memory ?? null,
        math_score: result.scores.math ?? null,
        speed_score: result.scores.speed ?? null,
      });
      setSaving(true);
      saveBaseline(result)
        .catch(() => undefined)
        .finally(() => onDone(result));
    },
    [rounds, game, index, track, onDone],
  );

  if (saving) {
    return (
      <Screen centered>
        <Text variant="heading" style={{ textAlign: 'center' }}>
          Working out your scores…
        </Text>
      </Screen>
    );
  }
  if (playing) return <BaselineGame key={game.module.id} game={game} onFinish={finishGame} />;

  return (
    <Screen centered>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="label" color="textSecondary">
          {`Baseline test · game ${index + 1} of ${BASELINE_GAMES.length} · ${perGameSeconds} seconds`}
        </Text>
        <Text variant="title" accessibilityRole="header">
          {game.module.title}
        </Text>
      </View>
      <Text>{game.module.instructions}</Text>
      <Text color="textSecondary">
        {index === 0
          ? 'Do your best, but don’t worry: this only sets where your training starts.'
          : 'Nice. One more and you’re done.'}
      </Text>
      <Button title={index === 0 ? 'Start the test' : `Start ${game.module.title}`} onPress={begin} />
    </Screen>
  );
}
