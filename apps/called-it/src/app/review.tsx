import { Button, Notice, Screen, Text, useAuth, useTheme } from '@five/shell';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';

import { ReviewQuestionCard } from '@/components/ReviewQuestionCard';
import { fetchSlate, publishSlate, regenerateSlate, saveEdits } from '@/slate/api';
import {
  current,
  edit,
  publishBlockers,
  type Draft,
  type ReviewQuestion,
  type ReviewSlate,
} from '@/slate/reviewState';
import { useIsAdmin } from '@/slate/useIsAdmin';
import { easternDate } from '../../supabase/functions/_shared/slate/time.ts';

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type Busy = null | 'save' | 'regenerate' | 'publish';

/** Admin screen: review, edit and publish the slate for one date (UNJ-1421). */
export default function ReviewSlateScreen() {
  const { client } = useAuth();
  const theme = useTheme();
  const isAdmin = useIsAdmin();
  const [date, setDate] = useState(() => easternDate(new Date()));
  const [reloads, setReloads] = useState(0);
  const [loaded, setLoaded] = useState<{
    key: string;
    slate: ReviewSlate | null;
    questions: ReviewQuestion[];
    error: string | null;
  } | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [busy, setBusy] = useState<Busy>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadKey = `${date}#${reloads}`;
  useEffect(() => {
    if (!client || !isAdmin) return;
    let active = true;
    fetchSlate(client, date)
      .then(
        (result) => ({ slate: result?.slate ?? null, questions: result?.questions ?? [], error: null }),
        (e: Error) => ({ slate: null, questions: [], error: e.message }),
      )
      .then((result) => {
        if (!active) return;
        setLoaded({ key: loadKey, ...result });
        setDraft({});
      });
    return () => {
      active = false;
    };
  }, [client, isAdmin, date, loadKey]);

  const loading = loaded?.key !== loadKey;
  const slate = loading ? null : (loaded?.slate ?? null);
  const questions = useMemo(() => (loading ? [] : (loaded?.questions ?? [])), [loading, loaded]);
  const error = actionError ?? (loading ? null : (loaded?.error ?? null));

  const run = async (kind: Exclude<Busy, null>, task: () => Promise<void>) => {
    setBusy(kind);
    setActionError(null);
    try {
      await task();
      setReloads((n) => n + 1);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const editable = slate?.status === 'draft';
  const shown = useMemo(() => questions.map((q) => current(q, draft)), [questions, draft]);
  const blockers = publishBlockers(questions, draft, new Date());
  const dirty = Object.keys(draft).length > 0;

  const regenerate = () => {
    const go = () => run('regenerate', () => regenerateSlate(client!, date));
    if (!slate) return go();
    Alert.alert('Regenerate this slate?', 'This replaces every question and drops your edits.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Regenerate', style: 'destructive', onPress: go },
    ]);
  };

  if (!isAdmin) {
    return (
      <Screen centered>
        <Notice title="Admins only" body="This screen is for Called It staff. An owner can add your account to the admins table." />
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text variant="title">Review slate</Text>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button title="Previous day" variant="secondary" onPress={() => {
              setActionError(null);
              setDate(shiftDate(date, -1));
            }} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Next day" variant="secondary" onPress={() => {
              setActionError(null);
              setDate(shiftDate(date, 1));
            }} />
        </View>
      </View>
      <Text variant="heading">
        {date}
        {slate ? ` · ${slate.status === 'draft' ? 'Draft' : 'Published'}` : ''}
      </Text>

      {error ? <Notice tone="error" title="Something went wrong" body={error} /> : null}
      {slate?.generator_notes.map((note) => <Notice key={note} title="Generator note" body={note} />)}

      {loading ? (
        <Text color="textSecondary">Loading…</Text>
      ) : !slate ? (
        <Notice title="No slate yet" body="Generate one from tonight's Unjuiced props." />
      ) : (
        shown.map((q) => (
          <ReviewQuestionCard
            key={q.id}
            question={q}
            editable={editable}
            onChangePrompt={(prompt) => setDraft((d) => edit(d, questions.find((x) => x.id === q.id)!, { prompt }))}
            onToggleIncluded={() =>
              setDraft((d) => edit(d, questions.find((x) => x.id === q.id)!, { included: !q.included }))
            }
          />
        ))
      )}

      {editable && dirty ? (
        <Button
          title="Save edits"
          loading={busy === 'save'}
          disabled={busy !== null}
          onPress={() => run('save', () => saveEdits(client!, draft))}
        />
      ) : null}
      {editable ? (
        <>
          {blockers.map((b) => (
            <Text key={b} variant="caption" color="danger">
              {b}
            </Text>
          ))}
          <Button
            title="Approve and publish"
            loading={busy === 'publish'}
            disabled={busy !== null || blockers.length > 0}
            onPress={() => run('publish', () => publishSlate(client!, slate!.id))}
          />
        </>
      ) : null}
      {!slate || editable ? (
        <Button
          title={slate ? 'Regenerate from Unjuiced' : 'Generate from Unjuiced'}
          variant="secondary"
          loading={busy === 'regenerate'}
          disabled={busy !== null}
          onPress={regenerate}
        />
      ) : null}
    </Screen>
  );
}
