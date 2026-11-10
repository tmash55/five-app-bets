import { useTheme } from '@five/shell';
import { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RoundSummary } from '../core/scoring';
import { useGameSession, type GameSessionOptions } from '../hooks/useGameSession';
import type { GameModule, RoundConfig } from '../types';
import { formatClock } from './format';
import { CountdownScreen, PauseScreen, ResultsScreen, StartScreen } from './GameScreens';
import { Hud } from './Hud';

export type GameRunnerProps<Q, A> = GameSessionOptions & {
  game: GameModule<Q, A>;
  /** Called once per finished round, for saving best scores or analytics. */
  onFinish?: (summary: RoundSummary) => void;
  /** Shows Back / Quit / Done buttons that call this. */
  onExit?: () => void;
};

function describeRound(round: RoundConfig): string {
  const parts: string[] = [];
  if (round.questions !== undefined) parts.push(`${round.questions} questions`);
  if (round.durationMs !== undefined) parts.push(`${formatClock(round.durationMs)} on the clock`);
  return `${parts.join(', ')}. Answer fast for bonus points. It gets harder as you get better.`;
}

/**
 * The whole game flow for one module: start screen, countdown, play with the
 * HUD, pause, and results. A game app renders `<GameRunner game={myGame} />`
 * on a route and gets everything else for free.
 */
export function GameRunner<Q, A>({ game, onFinish, onExit, ...options }: GameRunnerProps<Q, A>) {
  const theme = useTheme();
  const session = useGameSession(game, options);
  const { state } = session;

  const reported = useRef<RoundSummary | null>(null);
  useEffect(() => {
    if (state.phase === 'results' && state.summary && reported.current !== state.summary) {
      reported.current = state.summary;
      onFinish?.(state.summary);
    }
  }, [state.phase, state.summary, onFinish]);

  const questionIndex = state.answers.length;
  const { answer } = session;
  const onAnswer = useCallback((value: A) => answer(value, questionIndex), [answer, questionIndex]);

  const restart = useCallback(() => {
    session.reset();
    session.start();
  }, [session]);

  switch (state.phase) {
    case 'ready':
      return (
        <StartScreen
          title={game.title}
          instructions={game.instructions}
          roundDescription={describeRound(game.round)}
          onStart={session.start}
          onExit={onExit}
        />
      );
    case 'countdown':
      return <CountdownScreen seconds={session.countdown} />;
    case 'paused':
      return (
        <PauseScreen timeLeftMs={session.timeLeftMs} onResume={session.resume} onRestart={restart} onExit={onExit} />
      );
    case 'results':
      return state.summary ? (
        <ResultsScreen
          summary={state.summary}
          endedBy={state.endedBy}
          maxLevel={game.levels}
          onPlayAgain={session.start}
          onExit={onExit}
        />
      ) : null;
    case 'playing': {
      const limit = game.round.questionTimeLimitMs;
      const level = state.difficulty.level;
      const Board = game.Board;
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
          <View style={{ flex: 1, padding: theme.spacing.lg, gap: theme.spacing.lg }}>
            <Hud
              score={state.score}
              level={level}
              maxLevel={game.levels}
              timeLeftMs={session.timeLeftMs}
              durationMs={game.round.durationMs}
              questionTimeLeftMs={session.questionTimeLeftMs}
              questionLimitMs={typeof limit === 'function' ? limit(level) : limit}
              progress={
                game.round.questions !== undefined ? `${questionIndex + 1} / ${game.round.questions}` : undefined
              }
              onPause={session.pause}
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
  }
}
