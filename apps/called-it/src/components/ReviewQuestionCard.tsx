import { Button, Text, TextField, useTheme } from '@five/shell';
import { View } from 'react-native';

import { promptError, ruleSummary, type ReviewQuestion } from '../slate/reviewState';

type Props = {
  question: ReviewQuestion;
  editable: boolean;
  onChangePrompt: (prompt: string) => void;
  onToggleIncluded: () => void;
};

const timeFormat: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

export function ReviewQuestionCard({ question: q, editable, onChangePrompt, onToggleIncluded }: Props) {
  const theme = useTheme();
  const error = q.included ? promptError(q.prompt) : undefined;
  return (
    <View
      accessibilityLabel={`Question ${q.position}`}
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: error ? theme.colors.danger : theme.colors.border,
        borderWidth: 1,
        borderRadius: theme.radius.md,
        padding: theme.spacing.md,
        gap: theme.spacing.sm,
        opacity: q.included ? 1 : 0.5,
      }}>
      <Text variant="caption" color="textSecondary">
        {q.position}. {q.sport.toUpperCase()} · {q.game_label} · locks{' '}
        {new Date(q.lock_at).toLocaleTimeString([], timeFormat)}
        {q.included ? '' : ' · dropped'}
      </Text>
      {editable ? (
        <TextField
          label="Question"
          value={q.prompt}
          onChangeText={onChangePrompt}
          error={error}
          multiline
        />
      ) : (
        <Text variant="heading">{q.prompt}</Text>
      )}
      {q.prompt !== q.generated_prompt ? (
        <Text variant="caption" color="textSecondary">
          Generated: {q.generated_prompt}
        </Text>
      ) : null}
      {q.stat_line ? <Text variant="label">Pro stat line: {q.stat_line}</Text> : null}
      <Text variant="caption" color="textSecondary">
        Graded as {ruleSummary(q.grading_rule)}
      </Text>
      {editable ? (
        <Button
          title={q.included ? 'Drop from slate' : 'Add back to slate'}
          variant="secondary"
          onPress={onToggleIncluded}
        />
      ) : null}
    </View>
  );
}
