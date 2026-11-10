import { Button, Text, useTheme } from '@five/shell';
import { View } from 'react-native';

import { formatClock } from './format';
import { TimerBar } from './TimerBar';

/** Score, level, time left and the pause button, shown above the board. */
export function Hud({
  score,
  level,
  maxLevel,
  timeLeftMs,
  durationMs,
  questionTimeLeftMs,
  questionLimitMs,
  progress,
  onPause,
}: {
  score: number;
  level: number;
  maxLevel: number;
  timeLeftMs: number | null;
  durationMs?: number;
  questionTimeLeftMs: number | null;
  questionLimitMs?: number;
  /** "3 / 10" for rounds with a fixed number of questions. */
  progress?: string;
  onPause: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md }}>
        <View>
          <Text variant="caption" color="textSecondary">
            Score
          </Text>
          <Text variant="heading" accessibilityLabel={`Score ${score}`}>
            {score}
          </Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text variant="caption" color="textSecondary">
            {progress ? 'Question' : 'Time'}
          </Text>
          <Text variant="heading" accessibilityLabel={progress ? `Question ${progress}` : 'Time left'}>
            {progress ?? (timeLeftMs !== null ? formatClock(timeLeftMs) : '')}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="caption" color="textSecondary">
            Level
          </Text>
          <Text variant="heading" accessibilityLabel={`Level ${level} of ${maxLevel}`}>
            {level}
          </Text>
        </View>
      </View>
      {timeLeftMs !== null && durationMs ? (
        <TimerBar fraction={timeLeftMs / durationMs} label="Round time left" />
      ) : null}
      {questionTimeLeftMs !== null && questionLimitMs ? (
        <TimerBar fraction={questionTimeLeftMs / questionLimitMs} label="Question time left" />
      ) : null}
      <Button title="Pause" variant="secondary" onPress={onPause} />
    </View>
  );
}
