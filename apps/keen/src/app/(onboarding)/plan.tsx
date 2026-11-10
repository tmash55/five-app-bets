import { Button, Screen, Text, useAnalytics, useOnboarding, useTheme } from '@five/shell';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { APP_NAME } from '@/appName';
import { readBaseline, type BaselineResult } from '@/baseline/baseline';
import { ShareCard, type ShareCardRef } from '@/baseline/ShareCard';
import { shareBaseline } from '@/baseline/shareBaseline';
import { buildPlan, PLAN_EVENTS } from '@/onboarding/plan';
import { skillLabel } from '@/skills/skills';

/** Starting scores, the share card and the personalized plan, then the paywall. */
export default function PlanRoute() {
  const theme = useTheme();
  const { track } = useAnalytics();
  const { answers } = useOnboarding();
  const [baseline, setBaseline] = useState<BaselineResult | null | undefined>(undefined);
  const [sharing, setSharing] = useState(false);
  const card = useRef<ShareCardRef>(null);

  useEffect(() => {
    readBaseline().then(setBaseline);
  }, []);

  const plan = useMemo(() => buildPlan(answers, baseline ?? null), [answers, baseline]);
  const unmeasured = plan.focusSkills.filter((id) => baseline?.scores[id] === undefined);

  useEffect(() => {
    if (baseline === undefined) return;
    track(PLAN_EVENTS.viewed, {
      keen_score: baseline?.keenScore ?? null,
      focus_skills: plan.focusSkills,
      start_skill: plan.startSkill,
    });
    // Once, when the baseline has loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseline]);

  const share = () => {
    if (!baseline) return;
    setSharing(true);
    shareBaseline(card, baseline, APP_NAME)
      .then((method) => track(PLAN_EVENTS.shared, { method, keen_score: baseline.keenScore }))
      .catch(() => undefined)
      .finally(() => setSharing(false));
  };

  if (baseline === undefined) return <Screen centered>{null}</Screen>;

  return (
    <Screen>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="label" color="textSecondary">
          Your starting point
        </Text>
        <Text variant="title" accessibilityRole="header">
          Your plan is ready
        </Text>
      </View>

      {baseline ? (
        <View style={{ gap: theme.spacing.sm }}>
          <ShareCard ref={card} result={baseline} appName={APP_NAME} />
          <Button title="Share my score" variant="secondary" loading={sharing} onPress={share} />
        </View>
      ) : null}

      <View
        style={{
          padding: theme.spacing.md,
          gap: theme.spacing.sm,
          borderRadius: theme.radius.lg,
          backgroundColor: theme.colors.surface,
        }}>
        <Text variant="heading">Your daily workout</Text>
        {plan.lines.map((line) => (
          <Text key={line}>{line}</Text>
        ))}
        {unmeasured.length > 0 ? (
          <Text color="textSecondary">
            {`${unmeasured.map((id) => skillLabel(id)).join(' and ')} get${unmeasured.length === 1 ? 's' : ''} a score in your first workout.`}
          </Text>
        ) : null}
      </View>

      <Button title="Continue" onPress={() => router.push('/paywall')} />
    </Screen>
  );
}
