import { Button, Notice, Screen, Text, useAuth, useTheme } from '@five/shell';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { InviteNotFoundError, joinLeague, LeagueLimitError, previewLeague } from '@/compete/api';
import type { LeaguePreview } from '@/compete/standings';
import { takePendingInvite } from '@/invite/pendingInvite';

/** Opened from an invite link (calledit://join/CODE) or a typed code: shows the league, then joins it (UNJ-1424). */
export default function JoinScreen() {
  const { client } = useAuth();
  const theme = useTheme();
  const { code } = useLocalSearchParams<{ code: string }>();
  const [preview, setPreview] = useState<LeaguePreview | null>(null);
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  const [joining, setJoining] = useState(false);

  // The link that opened this screen was also saved for after sign-in; it is handled now.
  useEffect(() => {
    takePendingInvite();
  }, []);

  useEffect(() => {
    if (!client || typeof code !== 'string') return;
    let active = true;
    previewLeague(client, code).then(
      (p) => {
        if (active) setPreview(p);
      },
      (e: Error) => {
        if (!active) return;
        setError(
          e instanceof InviteNotFoundError
            ? { title: 'Invite not found', body: 'Check the code, or ask for a new link. The league may have been deleted.' }
            : { title: "Couldn't open the invite", body: e.message },
        );
      },
    );
    return () => {
      active = false;
    };
  }, [client, code]);

  const openLeague = (id: string) => router.replace({ pathname: '/league/[id]', params: { id } });

  const join = async () => {
    if (!client || typeof code !== 'string') return;
    setJoining(true);
    setError(null);
    try {
      openLeague(await joinLeague(client, code));
    } catch (e) {
      setError(
        e instanceof LeagueLimitError
          ? { title: 'League limit reached', body: (e as Error).message }
          : { title: "Couldn't join", body: (e as Error).message },
      );
      setJoining(false);
    }
  };

  return (
    <Screen centered>
      {preview ? (
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="caption" color="textSecondary">
            {"YOU'RE INVITED TO"}
          </Text>
          <Text variant="title">{preview.name}</Text>
          <Text color="textSecondary">
            {`${preview.member_count} ${preview.member_count === 1 ? 'player' : 'players'} · Season-long table, points from your nightly picks`}
          </Text>
        </View>
      ) : !error ? (
        <Text color="textSecondary">Opening invite…</Text>
      ) : null}
      {error ? <Notice tone="error" title={error.title} body={error.body} /> : null}
      {preview?.is_member ? (
        <Button title="You're in. Open the league" onPress={() => openLeague(preview.id)} />
      ) : preview ? (
        <Button title="Join league" onPress={join} loading={joining} />
      ) : null}
      <Button title="Not now" variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </Screen>
  );
}
