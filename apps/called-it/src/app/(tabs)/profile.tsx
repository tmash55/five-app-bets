import { Button, Notice, Screen, Text, TextField, useAuth, useTheme } from '@five/shell';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { fetchDisplayName, setDisplayName } from '@/compete/api';
import { recordLabel } from '@/compete/standings';
import { badgeStates } from '@/profile/badges';
import { fetchProfile, type ProfileData } from '@/profile/api';
import { accuracyLine, SPORT_LABEL, totals } from '@/profile/profileState';
import { streakLabel } from '@/results/resultsState';
import { easternDate } from '../../../supabase/functions/_shared/slate/time.ts';

/** The player's name, record, accuracy by sport and badges (UNJ-1424). */
export default function ProfileScreen() {
  const { client, session } = useAuth();
  const theme = useTheme();
  const [data, setData] = useState<ProfileData | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!client) return;
      let active = true;
      Promise.all([fetchProfile(client, easternDate(new Date())), fetchDisplayName(client)]).then(
        ([profile, displayName]) => {
          if (!active) return;
          setData(profile);
          setName(displayName);
          setEditing(displayName === null);
          setError(null);
        },
        (e: Error) => {
          if (active) setError(e.message);
        },
      );
      return () => {
        active = false;
      };
    }, [client]),
  );

  const saveName = async () => {
    if (!client) return;
    setSaving(true);
    setNameError(null);
    try {
      const saved = await setDisplayName(client, draft);
      setName(saved);
      setEditing(false);
    } catch (e) {
      setNameError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!data) {
    return (
      <Screen centered>
        {error ? (
          <Notice tone="error" title="Couldn't load your profile" body={error} />
        ) : (
          <Text color="textSecondary">Loading your profile…</Text>
        )}
      </Screen>
    );
  }

  const all = totals(data.stats);
  const badges = badgeStates({ stats: data.stats, totals: all, streak: data.streak });
  const earned = badges.filter((b) => b.earned).length;

  return (
    <Screen>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="title">{name ?? 'Your profile'}</Text>
        {session?.user.email ? (
          <Text variant="caption" color="textSecondary">
            {session.user.email}
          </Text>
        ) : null}
      </View>

      {editing ? (
        <View style={{ gap: theme.spacing.sm }}>
          <TextField
            label="Display name"
            value={draft}
            onChangeText={setDraft}
            placeholder="How other players see you"
            maxLength={20}
            autoCorrect={false}
            error={nameError ?? undefined}
          />
          <Button title="Save name" onPress={saveName} loading={saving} disabled={draft.trim().length < 2} />
          {name ? <Button title="Cancel" variant="secondary" onPress={() => setEditing(false)} /> : null}
        </View>
      ) : (
        <Button
          title="Change display name"
          variant="secondary"
          onPress={() => {
            setDraft(name ?? '');
            setEditing(true);
          }}
        />
      )}

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <Stat label="Record" value={recordLabel(all.correct, all.graded)} />
        <Stat label="Points" value={String(all.points)} />
        <Stat label="Streak" value={String(data.streak)} />
      </View>
      <Text variant="caption" color="textSecondary">
        {`${streakLabel(data.streak)} · best ${data.stats.best_streak} · ${data.stats.slates_played} ${
          data.stats.slates_played === 1 ? 'slate' : 'slates'
        } played`}
      </Text>

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="heading">Accuracy by sport</Text>
        {data.stats.by_sport.length === 0 ? (
          <Text color="textSecondary">Your accuracy shows up after your first graded pick.</Text>
        ) : (
          data.stats.by_sport.map((s) => (
            <View
              key={s.sport}
              accessibilityLabel={`${SPORT_LABEL[s.sport]} ${accuracyLine(s.correct, s.graded)}`}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radius.md,
                padding: theme.spacing.md,
              }}>
              <Text variant="label">{SPORT_LABEL[s.sport]}</Text>
              <Text color="textSecondary">{accuracyLine(s.correct, s.graded)}</Text>
            </View>
          ))
        )}
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="heading">{`Badges · ${earned} of ${badges.length}`}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {badges.map(({ badge, earned: has }) => (
            <View
              key={badge.id}
              accessibilityLabel={`${badge.title}, ${has ? 'earned' : `not earned yet. ${badge.how}`}`}
              style={{
                width: '48%',
                flexGrow: 1,
                gap: theme.spacing.xxs,
                padding: theme.spacing.md,
                borderRadius: theme.radius.md,
                borderWidth: 1,
                borderColor: has ? theme.colors.success : theme.colors.border,
                backgroundColor: has ? theme.colors.surface : theme.colors.background,
              }}>
              <Text variant="label" color={has ? 'text' : 'textSecondary'}>
                {badge.title}
              </Text>
              <Text variant="caption" color="textSecondary">
                {has ? 'Earned' : badge.how}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        gap: theme.spacing.xxs,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.md,
        padding: theme.spacing.md,
      }}>
      <Text variant="heading">{value}</Text>
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
    </View>
  );
}
