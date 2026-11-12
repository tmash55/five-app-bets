import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { sampleSetup } from '@/dev/sample';
import { MatchView } from '@/game/MatchView';
import type { CourtId } from '@/game/render/court';
import { MatchRunner } from '@/game/runner';
import { color } from '@/theme/tokens';

export default function Index() {
  const params = useLocalSearchParams<{ court?: string; seed?: string; user?: string }>();
  const runner = useMemo(() => {
    const s = sampleSetup((params.court as CourtId) ?? 'park', Number(params.seed ?? 7), params.user === '1' ? 0 : -1);
    const r = new MatchRunner(s.config, s.visuals);
    (globalThis as Record<string, unknown>).__bs = r;
    return r;
  }, [params.court, params.seed, params.user]);
  return (
    <View style={{ flex: 1, backgroundColor: color.ink }}>
      <MatchView runner={runner} />
    </View>
  );
}
