import AsyncStorage from '@react-native-async-storage/async-storage';

import { SKILLS, type GameSkillId } from './skills';

/**
 * The skills the player wants to train; the daily workout picks games for
 * them. Onboarding (UNJ-1435) asks for these. Until the player has chosen,
 * every skill counts.
 */
const KEY = 'keen.focusSkills';

export const GAME_SKILLS = SKILLS.map((skill) => skill.id).filter(
  (id): id is GameSkillId => id !== 'speed',
);

function isGameSkill(value: unknown): value is GameSkillId {
  return GAME_SKILLS.includes(value as GameSkillId);
}

export async function readFocusSkills(): Promise<GameSkillId[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const skills = Array.isArray(parsed) ? parsed.filter(isGameSkill) : [];
    return skills.length > 0 ? skills : [...GAME_SKILLS];
  } catch {
    return [...GAME_SKILLS];
  }
}

export async function saveFocusSkills(skills: GameSkillId[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(skills.filter(isGameSkill)));
}
