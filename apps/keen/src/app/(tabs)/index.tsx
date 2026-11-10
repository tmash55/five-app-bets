import { Button, Notice, Screen, Text, useTheme } from '@five/shell';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { View } from 'react-native';

import { findGame } from '@/games';
import { SkillBars } from '@/progress/SkillBars';
import { changeSinceLastWeek, currentScores } from '@/skills/history';
import { skillLabel } from '@/skills/skills';
import { usePremium } from '@/workout/premium';
import { useTodayState } from '@/workout/useTodayState';
import { canPlay, isWorkoutComplete, nextWorkoutGame, type Workout } from '@/workout/workout';

function startLabel(workout: Workout, next: string | null): string {
  if (!next) return 'Workout done';
  if (workout.done.length === 0) return 'Start workout';
  return `Next: ${findGame(next)?.module.title ?? next}`;
}

/** Today: three games for the player's skills, then the skill scores. */
export default function Today() {
  const theme = useTheme();
  const premium = usePremium();
  const { workout, history, today, refresh } = useTodayState();
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const scores = useMemo(() => currentScores(history), [history]);
  const changes = useMemo(() => changeSinceLastWeek(history, today), [history, today]);
  const next = workout ? nextWorkoutGame(workout) : null;
  const locked = workout !== null && next !== null && !canPlay(next, workout, premium);

  return (
    <Screen>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="label" color="textSecondary">
          Today · about 5 min
        </Text>
        <Text variant="title">Your daily workout</Text>
      </View>

      <View
        style={{
          padding: theme.spacing.md,
          gap: theme.spacing.sm,
          borderRadius: theme.radius.lg,
          backgroundColor: theme.colors.surface,
        }}>
        {workout?.games.map((id) => {
          const game = findGame(id);
          if (!game) return null;
          const done = workout.done.includes(id);
          const open = canPlay(id, workout, premium);
          return (
            <View
              key={id}
              accessible
              accessibilityLabel={`${game.module.title}, ${skillLabel(game.skill)}, ${done ? 'done' : open ? '60 seconds' : 'part of Premium'}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, minHeight: theme.spacing.xxl }}>
              <View style={{ flex: 1, gap: theme.spacing.xxs }}>
                <Text variant="heading" color={open || done ? 'text' : 'textSecondary'}>
                  {game.module.title}
                </Text>
                <Text variant="caption" color="textSecondary">
                  {skillLabel(game.skill)}
                </Text>
              </View>
              <Text variant="label" color={done ? 'success' : 'textSecondary'}>
                {done ? 'Done' : open ? '60 sec' : 'Premium'}
              </Text>
            </View>
          );
        })}
        {workout && locked ? (
          <Notice
            title="That's today's free game"
            body="The rest of the workout is part of Keen Premium."
          />
        ) : null}
        {workout ? (
          <Button
            title={startLabel(workout, next)}
            disabled={next === null || locked}
            onPress={() => {
              if (next) router.push({ pathname: '/play/[game]', params: { game: next, from: 'workout' } });
            }}
          />
        ) : null}
        {workout && isWorkoutComplete(workout) ? (
          <Text color="textSecondary">Nice work. A new workout is ready tomorrow.</Text>
        ) : null}
      </View>

      <View
        style={{
          padding: theme.spacing.md,
          gap: theme.spacing.md,
          borderRadius: theme.radius.lg,
          backgroundColor: theme.colors.surface,
        }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text variant="heading">Your skills</Text>
          <Text variant="caption" color="textSecondary">
            vs. last week
          </Text>
        </View>
        <SkillBars scores={scores} changes={changes} />
      </View>
    </Screen>
  );
}
