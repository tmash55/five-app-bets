import { Button, Screen, Text, useTheme } from '@five/shell';
import { StyleSheet, View } from 'react-native';

import type { EndReason } from '../core/session';
import type { RoundSummary } from '../core/scoring';
import { formatClock, formatPercent, formatSeconds } from './format';

export function StartScreen({
  title,
  instructions,
  roundDescription,
  onStart,
  onExit,
}: {
  title: string;
  instructions: string;
  roundDescription: string;
  onStart: () => void;
  onExit?: () => void;
}) {
  return (
    <Screen centered>
      <Text variant="title" accessibilityRole="header">
        {title}
      </Text>
      <Text>{instructions}</Text>
      <Text variant="caption" color="textSecondary">
        {roundDescription}
      </Text>
      <Button title="Start" onPress={onStart} />
      {onExit ? <Button title="Back" variant="secondary" onPress={onExit} /> : null}
    </Screen>
  );
}

export function CountdownScreen({ seconds }: { seconds: number }) {
  return (
    <Screen centered>
      <View accessibilityLiveRegion="assertive" style={{ alignItems: 'center' }}>
        <Text variant="caption" color="textSecondary">
          Get ready
        </Text>
        <Text variant="title" accessibilityLabel={`Starting in ${seconds}`}>
          {seconds}
        </Text>
      </View>
    </Screen>
  );
}

/** Replaces the board while paused so the question cannot be studied for free. */
export function PauseScreen({
  timeLeftMs,
  onResume,
  onRestart,
  onExit,
}: {
  timeLeftMs: number | null;
  onResume: () => void;
  onRestart: () => void;
  onExit?: () => void;
}) {
  return (
    <Screen centered>
      <Text variant="title" accessibilityRole="header">
        Paused
      </Text>
      {timeLeftMs !== null ? (
        <Text color="textSecondary">{formatClock(timeLeftMs)} left in this round</Text>
      ) : null}
      <Button title="Resume" onPress={onResume} />
      <Button title="Restart" variant="secondary" onPress={onRestart} />
      {onExit ? <Button title="Quit" variant="secondary" onPress={onExit} /> : null}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: theme.spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.border,
      }}>
      <Text color="textSecondary">{label}</Text>
      <Text variant="label">{value}</Text>
    </View>
  );
}

export function ResultsScreen({
  summary,
  endedBy,
  maxLevel,
  onPlayAgain,
  onExit,
}: {
  summary: RoundSummary;
  endedBy: EndReason | null;
  maxLevel: number;
  onPlayAgain: () => void;
  onExit?: () => void;
}) {
  const levelLine =
    summary.finalLevel > summary.startLevel
      ? `Up to level ${summary.finalLevel}`
      : summary.finalLevel < summary.startLevel
        ? `Down to level ${summary.finalLevel}`
        : `Level ${summary.finalLevel}`;
  return (
    <Screen>
      <Text variant="caption" color="textSecondary">
        {endedBy === 'time' ? "Time's up" : 'Round complete'}
      </Text>
      <Text variant="title" accessibilityRole="header" accessibilityLabel={`Final score ${summary.score}`}>
        {summary.score}
      </Text>
      <Text color="textSecondary">
        {levelLine} of {maxLevel}
      </Text>
      <View>
        <Stat label="Accuracy" value={`${formatPercent(summary.accuracy)} (${summary.correct} of ${summary.answered})`} />
        <Stat
          label="Average speed"
          value={summary.averageCorrectMs === null ? '-' : formatSeconds(summary.averageCorrectMs)}
        />
        <Stat label="Accuracy points" value={String(summary.accuracyPoints)} />
        <Stat label="Speed bonus" value={String(summary.speedPoints)} />
        <Stat label="Best streak" value={String(summary.longestStreak)} />
        <Stat label="Highest level" value={String(summary.highestLevel)} />
      </View>
      <Button title="Play again" onPress={onPlayAgain} />
      {onExit ? <Button title="Done" variant="secondary" onPress={onExit} /> : null}
    </Screen>
  );
}
