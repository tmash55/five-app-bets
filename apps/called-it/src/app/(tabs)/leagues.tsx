import { Button, Notice, Screen, SettingsRow, SettingsSection, Text, TextField, useAuth, useTheme } from '@five/shell';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { createLeague, fetchAllowance, fetchMyLeagues, LeagueLimitError } from '@/compete/api';
import {
  allowanceLine,
  canCreateLeague,
  looksLikeInviteCode,
  normalizeInviteCode,
  ordinal,
  type LeagueAllowance,
  type LeagueSummary,
} from '@/compete/standings';
import { easternDate } from '../../../supabase/functions/_shared/slate/time.ts';

/** Private leagues: the ones you are in, create one, or join with a code (UNJ-1424). */
export default function LeaguesScreen() {
  const { client } = useAuth();
  const theme = useTheme();
  const [leagues, setLeagues] = useState<LeagueSummary[] | null>(null);
  const [allowance, setAllowance] = useState<LeagueAllowance | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [limitHit, setLimitHit] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!client) return () => {};
    let active = true;
    Promise.all([fetchMyLeagues(client, easternDate(new Date())), fetchAllowance(client)]).then(
      ([list, allow]) => {
        if (!active) return;
        setLeagues(list);
        setAllowance(allow);
        setLoadError(null);
      },
      (e: Error) => {
        if (active) setLoadError(e.message);
      },
    );
    return () => {
      active = false;
    };
  }, [client]);

  useFocusEffect(load);

  const create = async () => {
    if (!client) return;
    setCreating(true);
    setCreateError(null);
    setLimitHit(null);
    try {
      const league = await createLeague(client, name);
      setName('');
      router.push({ pathname: '/league/[id]', params: { id: league.id } });
    } catch (e) {
      if (e instanceof LeagueLimitError) setLimitHit(e.message);
      else setCreateError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const join = () => {
    router.push({ pathname: '/join/[code]', params: { code: normalizeInviteCode(code) } });
    setCode('');
  };

  if (!leagues || !allowance) {
    return (
      <Screen centered>
        {loadError ? (
          <Notice tone="error" title="Couldn't load your leagues" body={loadError} />
        ) : (
          <Text color="textSecondary">Loading your leagues…</Text>
        )}
      </Screen>
    );
  }

  const nameOk = name.trim().length >= 3 && name.trim().length <= 30;
  const canCreate = canCreateLeague(allowance);

  return (
    <Screen>
      <Text variant="title">Leagues</Text>
      {loadError ? <Notice tone="error" title="Couldn't refresh" body={loadError} /> : null}

      {leagues.length === 0 ? (
        <Notice
          title="No leagues yet"
          body="Start one and send the link to friends, or join with a code someone sent you. Everyone in a league is on your Friends leaderboard."
        />
      ) : (
        <SettingsSection title="Your leagues">
          {leagues.map((l) => (
            <SettingsRow
              key={l.id}
              label={l.name}
              detail={`${l.member_count} ${l.member_count === 1 ? 'player' : 'players'} · ${
                l.my_rank ? `You're ${ordinal(l.my_rank)}` : 'Not ranked yet'
              } · ${l.my_points ?? 0} pts`}
              onPress={() => router.push({ pathname: '/league/[id]', params: { id: l.id } })}
            />
          ))}
        </SettingsSection>
      )}

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="heading">Create a league</Text>
        <Text variant="caption" color="textSecondary">
          {allowanceLine(allowance)}
        </Text>
        {canCreate ? (
          <>
            <TextField
              label="League name"
              value={name}
              onChangeText={setName}
              placeholder="Sunday Crew"
              maxLength={30}
              autoCapitalize="words"
              error={createError ?? undefined}
            />
            <Button title="Create league" onPress={create} loading={creating} disabled={!nameOk} />
          </>
        ) : (
          <Notice
            title="League limit reached"
            body={
              allowance.max_joined === null
                ? 'Pro removes the limit. You can still join as many leagues as you like.'
                : 'Pro removes the limit.'
            }
          />
        )}
        {limitHit ? <Notice title="League limit reached" body={limitHit} /> : null}
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="heading">Join with a code</Text>
        <TextField
          label="Invite code"
          value={code}
          onChangeText={setCode}
          placeholder="ABCD2345"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
        />
        <Button title="Find league" variant="secondary" onPress={join} disabled={!looksLikeInviteCode(code)} />
      </View>
    </Screen>
  );
}
