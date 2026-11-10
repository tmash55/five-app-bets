import { Button, Notice, Screen, Text, useAuth, useTheme } from '@five/shell';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { Segmented } from '@/components/Segmented';
import { StandingsList } from '@/components/StandingsList';
import { fetchDisplayName, fetchLeaderboard } from '@/compete/api';
import type { LeaderboardPeriod, LeaderboardScope, StandingRow } from '@/compete/standings';
import { easternDate } from '../../../supabase/functions/_shared/slate/time.ts';

const SCOPES = [
  { value: 'global' as const, label: 'Global' },
  { value: 'friends' as const, label: 'Friends' },
];
const PERIODS = [
  { value: 'week' as const, label: 'This week' },
  { value: 'all' as const, label: 'All time' },
];

const EMPTY: Record<LeaderboardScope, string> = {
  global: 'Nobody has a graded pick yet. Make your picks on the Today tab.',
  friends: 'Friends are the people in your leagues. Create or join one on the Leagues tab.',
};

/** Global and friends leaderboards, this week or all time (UNJ-1424). */
export default function LeaderboardScreen() {
  const { client } = useAuth();
  const theme = useTheme();
  const [scope, setScope] = useState<LeaderboardScope>('global');
  const [period, setPeriod] = useState<LeaderboardPeriod>('week');
  const [rows, setRows] = useState<StandingRow[] | null>(null);
  const [hasName, setHasName] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!client) return;
      let active = true;
      setRows(null);
      Promise.all([fetchLeaderboard(client, scope, period, easternDate(new Date())), fetchDisplayName(client)]).then(
        ([result, name]) => {
          if (!active) return;
          setRows(result);
          setHasName(name !== null);
          setError(null);
        },
        (e: Error) => {
          if (active) setError(e.message);
        },
      );
      return () => {
        active = false;
      };
    }, [client, scope, period]),
  );

  const onlyMe = scope === 'friends' && rows !== null && rows.every((r) => r.is_me);

  return (
    <Screen>
      <Text variant="title">Leaderboard</Text>
      <View style={{ gap: theme.spacing.sm }}>
        <Segmented label="Who" options={SCOPES} value={scope} onChange={setScope} />
        <Segmented label="When" options={PERIODS} value={period} onChange={setPeriod} />
      </View>
      {period === 'week' ? (
        <Text variant="caption" color="textSecondary">
          Points from graded picks since Monday (US Eastern).
        </Text>
      ) : null}
      {!hasName ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Notice title="Pick a display name" body="Other players see you as “Player” plus a code until you do." />
          <Button title="Set your name" variant="secondary" onPress={() => router.push('/profile')} />
        </View>
      ) : null}
      {error ? <Notice tone="error" title="Couldn't load the leaderboard" body={error} /> : null}
      {rows === null && !error ? <Text color="textSecondary">Loading…</Text> : null}
      {rows !== null ? <StandingsList rows={onlyMe ? [] : rows} emptyText={EMPTY[scope]} /> : null}
      {onlyMe ? <Button title="Go to Leagues" variant="secondary" onPress={() => router.push('/leagues')} /> : null}
    </Screen>
  );
}
