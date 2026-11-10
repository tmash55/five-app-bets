import { Button, Screen, Text, useAuth } from '@five/shell';
import Constants from 'expo-constants';
import { router } from 'expo-router';

import { useIsAdmin } from '@/slate/useIsAdmin';

/** Placeholder home tab until the Today screen (UNJ-1422) replaces it. */
export default function Home() {
  const { session } = useAuth();
  const isAdmin = useIsAdmin();
  return (
    <Screen centered>
      <Text variant="title">{Constants.expoConfig?.name ?? 'Home'}</Text>
      <Text color="textSecondary">You are signed in as {session?.user.email}.</Text>
      {isAdmin ? <Button title="Review tonight's slate" onPress={() => router.push('/review')} /> : null}
    </Screen>
  );
}
