import { CountdownScreen, Hud, PauseScreen, useGameSession, type RoundSummary } from '@five/game';
import { useTheme } from '@five/shell';
import { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { KeenGame } from '@/games';

/**
 * One timed game of the baseline test. Unlike GameRunner it has no start or
 * results screen: it counts down as soon as it shows and hands the round back
 * when the clock runs out, so the test flows straight into the next game.
 */
export function BaselineGame({ game, onFinish }: { game: KeenGame; onFinish: (summary: RoundSummary) => void }) {
  const theme = useTheme();
  const { module } = game;
  const session = useGameSession(module);
  const { state, start, answer, pause, resume, reset } = session;

  useEffect(() => {
    start();
    // Start once, when the game first shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reported = useRef(false);
  useEffect(() => {
    if (state.phase === 'results' && state.summary && !reported.current) {
      reported.current = true;
      onFinish(state.summary);
    }
  }, [state.phase, state.summary, onFinish]);

  const questionIndex = state.answers.length;
  const onAnswer = useCallback((value: unknown) => answer(value, questionIndex), [answer, questionIndex]);
  const restart = useCallback(() => {
    reset();
    start();
  }, [reset, start]);

  if (state.phase === 'countdown') return <CountdownScreen seconds={session.countdown} />;
  if (state.phase === 'paused') {
    return <PauseScreen timeLeftMs={session.timeLeftMs} onResume={resume} onRestart={restart} />;
  }
  if (state.phase !== 'playing') return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;

  const limit = module.round.questionTimeLimitMs;
  const level = state.difficulty.level;
  const Board = module.Board;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ flex: 1, padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <Hud
          score={state.score}
          level={level}
          maxLevel={module.levels}
          timeLeftMs={session.timeLeftMs}
          durationMs={module.round.durationMs}
          questionTimeLeftMs={session.questionTimeLeftMs}
          questionLimitMs={typeof limit === 'function' ? limit(level) : limit}
          onPause={pause}
        />
        <View style={{ flex: 1 }}>
          {state.question !== null ? (
            <Board
              key={questionIndex}
              question={state.question}
              level={level}
              onAnswer={onAnswer}
              lastFeedback={state.lastFeedback}
            />
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}
