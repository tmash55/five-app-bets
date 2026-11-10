import {
  Button,
  PushPermissionPrompt,
  Screen,
  StreakBadge,
  Text,
  useAuth,
  useStreak,
} from '@five/shell';
import Constants from 'expo-constants';

/**
 * Placeholder home tab. Each app replaces this with its own main screen. It
 * shows how an app uses the habit loop: record the daily action, show the
 * streak, and ask for notifications once the user has done something.
 */
export default function Home() {
  const { session } = useAuth();
  const streak = useStreak();

  return (
    <Screen>
      <Text variant="title">{Constants.expoConfig?.name ?? 'Home'}</Text>
      <Text color="textSecondary">You are signed in as {session?.user.email}.</Text>
      <StreakBadge />
      <Button
        title={streak.status === 'done-today' ? 'Done for today' : "Complete today's round"}
        onPress={() => streak.recordActivity()}
        disabled={streak.status === 'done-today'}
      />
      {streak.status === 'done-today' && streak.rules.maxFreezes > streak.freezes ? (
        <Button title="Earn a streak freeze (demo)" variant="secondary" onPress={() => streak.grantFreezes()} />
      ) : null}
      {/* Ask after the first completed round, when a reminder makes sense to the user. */}
      {streak.status === 'done-today' ? <PushPermissionPrompt /> : null}
    </Screen>
  );
}
