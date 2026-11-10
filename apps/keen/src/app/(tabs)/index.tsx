import { Screen, Text, useTheme } from '@five/shell';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, View } from 'react-native';

import { KEEN_GAMES } from '@/games';
import { useBestScores } from '@/scores/bestScores';

/** Game list. The daily workout (UNJ-1434) will sit on top of this. */
export default function Home() {
  const theme = useTheme();
  const { scores, refresh } = useBestScores(KEEN_GAMES.map((game) => game.module.id));
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return (
    <Screen>
      <Text variant="title">Games</Text>
      {KEEN_GAMES.map(({ module, skill }) => {
        const best = scores[module.id];
        return (
          <Pressable
            key={module.id}
            accessibilityRole="button"
            accessibilityLabel={`Play ${module.title}`}
            onPress={() => router.push({ pathname: '/play/[game]', params: { game: module.id } })}
            style={({ pressed }) => ({
              padding: theme.spacing.lg,
              gap: theme.spacing.xs,
              borderRadius: theme.radius.lg,
              backgroundColor: pressed ? theme.colors.surfaceSelected : theme.colors.surface,
            })}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="heading">{module.title}</Text>
              <Text variant="label" color="primary">
                {skill}
              </Text>
            </View>
            <Text color="textSecondary">{module.instructions}</Text>
            <Text variant="caption" color="textSecondary">
              {best === null || best === undefined ? 'Not played yet' : `Best ${best}`}
            </Text>
          </Pressable>
        );
      })}
    </Screen>
  );
}
