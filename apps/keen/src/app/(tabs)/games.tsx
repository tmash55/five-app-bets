import { Screen, Text, useTheme } from '@five/shell';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, View } from 'react-native';

import { KEEN_GAMES } from '@/games';
import { useBestScores } from '@/scores/bestScores';
import { skillLabel } from '@/skills/skills';
import { usePremium } from '@/workout/premium';
import { useTodayState } from '@/workout/useTodayState';
import { canPlay, freeGameOfTheDay } from '@/workout/workout';

/** Every game, for free play. Free players can open only today's free game. */
export default function Games() {
  const theme = useTheme();
  const premium = usePremium();
  const { scores, refresh: refreshScores } = useBestScores(KEEN_GAMES.map((game) => game.module.id));
  const { workout, refresh: refreshToday } = useTodayState();
  useFocusEffect(
    useCallback(() => {
      refreshScores();
      refreshToday();
    }, [refreshScores, refreshToday]),
  );
  const freeGame = workout ? freeGameOfTheDay(workout) : null;

  return (
    <Screen>
      <Text variant="title">Games</Text>
      {KEEN_GAMES.map(({ module, skill }) => {
        const best = scores[module.id];
        const open = canPlay(module.id, workout, premium);
        return (
          <Pressable
            key={module.id}
            accessibilityRole="button"
            accessibilityLabel={open ? `Play ${module.title}` : `${module.title}, part of Premium`}
            accessibilityState={{ disabled: !open }}
            disabled={!open}
            onPress={() => router.push({ pathname: '/play/[game]', params: { game: module.id } })}
            style={({ pressed }) => ({
              padding: theme.spacing.lg,
              gap: theme.spacing.xs,
              borderRadius: theme.radius.lg,
              backgroundColor: pressed ? theme.colors.surfaceSelected : theme.colors.surface,
            })}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="heading" color={open ? 'text' : 'textSecondary'}>
                {module.title}
              </Text>
              <Text variant="label" color="primary">
                {skillLabel(skill)}
              </Text>
            </View>
            <Text color="textSecondary">{module.instructions}</Text>
            <Text variant="caption" color="textSecondary">
              {[
                best === null || best === undefined ? 'Not played yet' : `Best ${best}`,
                !premium && module.id === freeGame ? 'Free today' : null,
                open ? null : 'Premium',
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </Pressable>
        );
      })}
    </Screen>
  );
}
