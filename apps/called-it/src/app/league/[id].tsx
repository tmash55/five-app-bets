import { Button, Notice, Screen, Text, TextField, useAuth, useTheme } from '@five/shell';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Share, View } from 'react-native';

import { StandingsList } from '@/components/StandingsList';
import { fetchLeague, leaveLeague, renameLeague, type LeagueDetail } from '@/compete/api';
import { inviteMessage, seasonLabel } from '@/compete/standings';
import { inviteUrl } from '@/invite/inviteUrl';
import { easternDate } from '../../../supabase/functions/_shared/slate/time.ts';

/** One league's season table, its invite link, and rename / leave (UNJ-1424). */
export default function LeagueScreen() {
  const { client } = useAuth();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<LeagueDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!client || typeof id !== 'string') return () => {};
    let active = true;
    fetchLeague(client, id, easternDate(new Date())).then(
      (result) => {
        if (!active) return;
        setData(result);
        setError(null);
      },
      (e: Error) => {
        if (active) setError(e.message);
      },
    );
    return () => {
      active = false;
    };
  }, [client, id]);

  useFocusEffect(load);

  if (!data || !data.league) {
    return (
      <Screen centered>
        {error ? (
          <Notice tone="error" title="Couldn't load this league" body={error} />
        ) : data ? (
          <Notice title="League not found" body="You may have left it." />
        ) : (
          <Text color="textSecondary">Loading…</Text>
        )}
      </Screen>
    );
  }

  const league = data.league;

  const share = async () => {
    const url = inviteUrl(league.invite_code);
    await Share.share({ message: inviteMessage(league.name, url) });
  };

  const saveName = async () => {
    if (!client) return;
    setBusy(true);
    setActionError(null);
    try {
      await renameLeague(client, league.id, newName);
      setRenaming(false);
      load();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const leave = () => {
    const last = league.member_count <= 1;
    Alert.alert(
      `Leave ${league.name}?`,
      last
        ? 'You are the only player, so the league will be deleted.'
        : league.is_owner
          ? 'The player who joined first after you becomes the owner.'
          : 'You can join again with the invite link.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            if (!client) return;
            setBusy(true);
            try {
              await leaveLeague(client, league.id);
              router.back();
            } catch (e) {
              setActionError((e as Error).message);
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: league.name }} />
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="title">{league.name}</Text>
        <Text color="textSecondary">
          {`${seasonLabel(league.season_start)} · ${league.member_count} ${league.member_count === 1 ? 'player' : 'players'}`}
        </Text>
      </View>
      <Button title="Invite friends" onPress={share} />
      <Text variant="caption" color="textSecondary">
        {`Or share the code ${league.invite_code}`}
      </Text>
      {error ? <Notice tone="error" title="Couldn't refresh" body={error} /> : null}
      <StandingsList rows={data.table} emptyText="No players yet." />
      {data.table.every((r) => r.graded === 0) ? (
        <Text variant="caption" color="textSecondary">
          {"Points show up here once tonight's games are graded."}
        </Text>
      ) : null}
      {actionError ? <Notice tone="error" title="That didn't work" body={actionError} /> : null}
      {league.is_owner && renaming ? (
        <View style={{ gap: theme.spacing.sm }}>
          <TextField label="New name" value={newName} onChangeText={setNewName} maxLength={30} autoFocus />
          <Button title="Save name" onPress={saveName} loading={busy} disabled={newName.trim().length < 3} />
          <Button title="Cancel" variant="secondary" onPress={() => setRenaming(false)} />
        </View>
      ) : league.is_owner ? (
        <Button
          title="Rename league"
          variant="secondary"
          onPress={() => {
            setNewName(league.name);
            setRenaming(true);
          }}
        />
      ) : null}
      <Button title="Leave league" variant="danger" onPress={leave} loading={busy && !renaming} />
    </Screen>
  );
}
