import { useState } from 'react';
import { View } from 'react-native';

import { useNotifications } from '../notifications/NotificationsProvider';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from './Button';
import { Text } from './Text';

export type PushPermissionPromptProps = {
  title?: string;
  body?: string;
  allowLabel?: string;
  laterLabel?: string;
  /** Called after the user answers, with whether notifications are now allowed. */
  onAnswered?: (granted: boolean) => void;
};

/**
 * A soft prompt that explains why before the system dialog appears. Each app
 * renders it at the moment it chooses (for example after the first completed
 * round). It renders nothing once the user has answered, while "Not now" is
 * snoozed, or when the system will no longer ask.
 */
export function PushPermissionPrompt({
  title = 'Get a daily reminder?',
  body = "We'll nudge you once a day at a time you pick, and tell you when results are in.",
  allowLabel = 'Turn on',
  laterLabel = 'Not now',
  onAnswered,
}: PushPermissionPromptProps) {
  const theme = useTheme();
  const notifications = useNotifications();
  const [busy, setBusy] = useState(false);

  if (!notifications.shouldShowPrompt) return null;

  async function allow() {
    setBusy(true);
    try {
      const granted = await notifications.requestPermission();
      onAnswered?.(granted);
    } finally {
      setBusy(false);
    }
  }

  async function later() {
    await notifications.snoozePrompt();
    onAnswered?.(false);
  }

  return (
    <View
      accessibilityRole="summary"
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.md,
        padding: theme.spacing.md,
        gap: theme.spacing.sm,
      }}>
      <Text variant="heading">{title}</Text>
      <Text color="textSecondary">{body}</Text>
      <View style={{ gap: theme.spacing.sm }}>
        <Button title={allowLabel} onPress={allow} loading={busy} />
        <Button title={laterLabel} onPress={later} variant="secondary" disabled={busy} />
      </View>
    </View>
  );
}
