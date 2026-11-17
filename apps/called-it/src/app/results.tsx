import { Button, Notice, Screen, Text, useAuth, useTheme } from '@five/shell';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { ResultRow } from '@/components/ResultRow';
import { fetchResults, type ResultsData } from '@/results/api';
import { slateDateLabel, streakLabel, summarize } from '@/results/resultsState';
import { canShareResults } from '@/share/resultsCard';
import { easternDate } from '../../supabase/functions/_shared/slate/time.ts';

/** Graded picks, points earned and the streak for one slate (UNJ-1423). Opened from Today or the results push. */
export default function ResultsScreen() {
  const { client } = useAuth();
  const theme = useTheme();
  const { date } = useLocalSearchParams<{ date?: string }>();
  const [data, setData] = useState<ResultsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!client) return;
      let active = true;
      const slateDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
      fetchResults(client, easternDate(new Date()), slateDate).then(
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
    }, [client, date]),
  );

  if (!data) {
    return (
      <Screen centered>
        {error ? (
          <Notice tone="error" title="Couldn't load your results" body={error} />
        ) : (
          <Text color="textSecondary">Loading your results…</Text>
        )}
      </Screen>
    );
  }

  if (!data.slate || data.questions.length === 0) {
    return (
      <Screen centered>
        <Notice title="No results yet" body="Make your picks on the Today tab. Results show up here after the games end." />
        <Button title="Go to Today" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const summary = summarize(data.questions, data.picks);
  const picked = data.questions.filter((q) => q.id in data.picks).length;
  return (
    <Screen>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="caption" color="textSecondary">
          {slateDateLabel(data.slate.slate_date).toUpperCase()}
        </Text>
        <Text variant="title" accessibilityLabel={`${summary.points} points`}>
          {`${summary.points} pts`}
        </Text>
        <Text color="textSecondary">
          {picked === 0
            ? 'You did not pick on this slate.'
            : `${summary.correct} of ${summary.graded} correct${summary.bonus ? ` · ${summary.bonus} bonus pts` : ''}`}
        </Text>
        <Text variant="label" color="primary">
          {streakLabel(data.streak)}
        </Text>
      </View>
      {canShareResults(data.questions, data.picks) ? (
        <Button
          title="Share your results"
          onPress={() => router.push({ pathname: '/share-results', params: { date: data.slate!.slate_date } })}
        />
      ) : null}
      {summary.pending > 0 ? (
        <Notice
          title={`${summary.pending} still to be graded`}
          body="Questions are graded automatically once their game is final. Check back later."
        />
      ) : null}
      {error ? <Notice tone="error" title="Couldn't refresh" body={error} /> : null}
      {data.questions.map((q) => (
        <ResultRow key={q.id} question={q} pick={data.picks[q.id]} />
      ))}
    </Screen>
  );
}
