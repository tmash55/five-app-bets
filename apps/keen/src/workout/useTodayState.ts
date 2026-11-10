import { useCallback, useState } from 'react';

import { dateKey } from '@/skills/dates';
import { readFocusSkills } from '@/skills/focusSkills';
import { readSkillHistory, type SkillHistory } from '@/skills/history';

import { readWorkout, type Workout } from './workout';

/**
 * Today's workout and the skill history, read from the device. Call `refresh`
 * when a screen gains focus so a finished game shows up.
 */
export function useTodayState() {
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [history, setHistory] = useState<SkillHistory>([]);
  const [today, setToday] = useState(dateKey());

  const refresh = useCallback(async () => {
    const date = dateKey();
    const focus = await readFocusSkills();
    const [nextWorkout, nextHistory] = await Promise.all([readWorkout(focus, date), readSkillHistory()]);
    setToday(date);
    setWorkout(nextWorkout);
    setHistory(nextHistory);
  }, []);

  return { workout, history, today, refresh };
}
