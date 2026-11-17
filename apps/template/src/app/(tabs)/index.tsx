import { Screen, Text, useAuth } from '@five/shell';
import Constants from 'expo-constants';

/** Placeholder home tab. Each app replaces this with its own main screen. */
export default function Home() {
  const { session } = useAuth();
  return (
    <Screen centered>
      <Text variant="title">{Constants.expoConfig?.name ?? 'Home'}</Text>
      <Text color="textSecondary">You are signed in as {session?.user.email}.</Text>
    </Screen>
  );
}
