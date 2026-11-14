/** The one-player games the two-player change must leave exactly as they were (see sim/__tests__/onePlayer.test.ts). */

import type { MatchConfig } from '@/game/sim/types';
import { traceConfig } from './simTrace';

export interface GoldenCase {
  name: string;
  cfg: MatchConfig;
  /** seed of the scripted thumb, or null for a pad nobody touches */
  thumb: number | null;
}

export const GOLDEN_CASES: readonly GoldenCase[] = [
  { name: 'computer only', cfg: traceConfig(7, { userTeam: -1, rubberBand: 0 }), thumb: null },
  { name: 'person, hands off', cfg: traceConfig(11), thumb: null },
  { name: 'person, scripted', cfg: traceConfig(23), thumb: 5 },
  { name: 'person away, scripted', cfg: traceConfig(31, { userTeam: 1, difficulty: 0.82, rubberBand: 0.2 }), thumb: 9 },
  { name: 'rookie with easy shots, 2 on 2', cfg: traceConfig(47, { difficulty: 0.22, rubberBand: 0.6, timingAssist: 1.7 }, 2), thumb: 13 },
  { name: 'no auto switch', cfg: traceConfig(59, { autoSwitch: false, mateSkill: 0.82 }), thumb: 17 },
  { name: 'demo', cfg: traceConfig(61, { demo: true }), thumb: 19 },
  { name: 'all-star, 2 on 2, scripted', cfg: traceConfig(73, { difficulty: 0.82, rubberBand: 0.25 }, 2), thumb: 29 },
];
