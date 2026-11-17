import { Button, Notice, Screen, Text, useAuth, useTheme } from '@five/shell';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { SlateProgress } from '@/components/SlateProgress';
import { TodayQuestionCard } from '@/components/TodayQuestionCard';
import { useIsAdmin } from '@/slate/useIsAdmin';
import { fetchToday, makePick, PickLockedError, type TodayData } from '@/today/api';
import { withPick } from '@/today/pickState';
import { isLocked, progress, slateSummary } from '@/today/todayState';
import { useSlateClock } from '@/today/useSlateClock';
import { easternDate } from '../../../supabase/functions/_shared/slate/time.ts';

/** Tonight's slate: answer each question Yes or No before its game starts (UNJ-1422). */
export default function TodayScreen() {
  const { client } = useAuth();
  const theme = useTheme();
  const isAdmin = useIsAdmin();
  const [data, setData] = useState<TodayData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  // Questions the server said are locked, in case the phone's clock disagrees.
  const [lockedByServer, setLockedByServer] = useState<Set<string>>(() => new Set());

  // Reload whenever the tab comes into view, so a slate published since, or a new day, shows up.
  useFocusEffect(
    useCallback(() => {
      if (!client) return;
      let active = true;
      fetchToday(client, easternDate(new Date())).then(
        (result) => {
          if (!active) return;
          setData(result);
          setLoadError(null);
          setLockedByServer(new Set());
        },
        (e: Error) => {
          if (active) setLoadError(e.message);
        },
      );
      return () => {
        active = false;
      };
    }, [client]),
  );

  const questions = data?.questions ?? [];
  const picks = data?.picks ?? {};
  const offset = data?.clockOffsetMs ?? 0;
  const now = useSlateClock(questions, offset);

  const pick = async (questionId: string, answer: boolean) => {
    if (!client || !data) return;
    const before = data.picks[questionId];
    setPickError(null);
    setSaving(questionId);
    setData((d) => d && { ...d, picks: withPick(d.picks, questionId, answer) });
    try {
      await makePick(client, questionId, answer);
    } catch (e) {
      setData((d) => d && { ...d, picks: withPick(d.picks, questionId, before) });
      if (e instanceof PickLockedError) setLockedByServer((s) => new Set(s).add(questionId));
      setPickError((e as Error).message);
    } finally {
      setSaving(null);
    }
  };

  const resultsButton = (
    <Button title="See your results" variant="secondary" onPress={() => router.push('/results')} />
  );

  const reviewButton = isAdmin ? (
    <Button title="Review tonight's slate" variant="secondary" onPress={() => router.push('/review')} />
  ) : null;

  if (!data) {
    return (
      <Screen centered>
        {loadError ? (
          <Notice tone="error" title="Couldn't load tonight's questions" body={loadError} />
        ) : (
          <Text color="textSecondary">Loading tonight&apos;s questions…</Text>
        )}
        {reviewButton}
      </Screen>
    );
  }

  if (!data.slate || questions.length === 0) {
    return (
      <Screen centered>
        <Text variant="title">Tonight</Text>
        <Notice
          title="No questions today"
          body="There's no slate for today yet. On game days, questions are posted before the first game, so check back later. On days with no games, there's no slate."
        />
        {resultsButton}
        {reviewButton}
      </Screen>
    );
  }

  const { picked, total } = progress(questions, picks);
  return (
    <Screen>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="title">Tonight</Text>
        <Text color="textSecondary">{slateSummary(questions, now)}</Text>
      </View>
      <SlateProgress picked={picked} total={total} />
      {loadError ? <Notice tone="error" title="Couldn't refresh" body={loadError} /> : null}
      {pickError ? <Notice tone="error" title="Pick not saved" body={pickError} /> : null}
      {questions.map((q) => (
        <TodayQuestionCard
          key={q.id}
          question={q}
          answer={picks[q.id]}
          locked={lockedByServer.has(q.id) || isLocked(q, now)}
          now={now}
          saving={saving === q.id}
          onPick={(answer) => pick(q.id, answer)}
        />
      ))}
      {picked === total ? (
        <Text color="textSecondary">All picked. Results land after the games end.</Text>
      ) : null}
      {resultsButton}
      {reviewButton}
    </Screen>
  );
}
