import { Text, useTheme } from '@five/shell';
import { Pressable, View } from 'react-native';

import { answerLabel, cardKicker, cardStatus, type TodayQuestion } from '../today/todayState';

type Props = {
  question: TodayQuestion;
  answer: boolean | undefined;
  locked: boolean;
  now: Date;
  /** True while this card's pick is being saved. */
  saving?: boolean;
  onPick: (answer: boolean) => void;
};

/** One question on the Today screen: league, start time, points, prompt and Yes/No (UNJ-1422). */
export function TodayQuestionCard({ question: q, answer, locked, now, saving, onPick }: Props) {
  const theme = useTheme();
  const status = cardStatus(answer, locked);
  return (
    <View
      accessibilityLabel={`Question ${q.position}${locked ? ', locked' : ''}`}
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.lg,
        padding: theme.spacing.md,
        gap: theme.spacing.sm,
      }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
        <Text variant="caption" color="textSecondary">
          {cardKicker(q, now)}
        </Text>
        <Text variant="caption" color="textSecondary">
          +{q.points} PTS
        </Text>
      </View>
      <Text variant="heading">{q.prompt}</Text>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        {[true, false].map((value) => {
          const selected = answer === value;
          const label = answerLabel(value);
          return (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected, disabled: locked || saving }}
              disabled={locked || saving}
              onPress={() => {
                if (!selected) onPick(value);
              }}
              style={({ pressed }) => ({
                flex: 1,
                alignItems: 'center',
                paddingVertical: theme.spacing.md,
                borderRadius: theme.radius.md,
                backgroundColor: selected ? theme.colors.primary : theme.colors.surfaceSelected,
                opacity: locked && !selected ? 0.5 : pressed ? 0.8 : 1,
              })}>
              <Text variant="label" color={selected ? 'textOnPrimary' : 'text'}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {status ? (
        <Text variant="caption" color="textSecondary">
          {status}
        </Text>
      ) : null}
    </View>
  );
}
