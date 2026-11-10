import { Screen, Text } from '@five/shell';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { SkillChart } from '@/progress/SkillChart';
import { readSkillHistory, skillSeries, type SkillHistory } from '@/skills/history';
import { SKILLS } from '@/skills/skills';

/** One chart per skill, showing the score on each day played. */
export default function Progress() {
  const [history, setHistory] = useState<SkillHistory>([]);
  const refresh = useCallback(() => {
    let live = true;
    readSkillHistory().then((next) => {
      if (live) setHistory(next);
    });
    return () => {
      live = false;
    };
  }, []);
  useFocusEffect(refresh);
  useEffect(refresh, [refresh]);

  return (
    <Screen>
      <Text variant="title">Progress</Text>
      <Text color="textSecondary">Your score in each skill on the days you played, out of 1000.</Text>
      {SKILLS.map(({ id, label }) => (
        <SkillChart key={id} label={label} points={skillSeries(history, id)} />
      ))}
    </Screen>
  );
}
