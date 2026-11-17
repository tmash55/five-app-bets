/**
 * Two-player games (one screen and two devices) that a change to the one-player game must leave exactly as they were
 * (see sim/__tests__/twoPlayerReplay.test.ts): each one built the way the app builds it, from the setup to the match,
 * and played by two scripted thumbs.
 */

import { buildMatch, type SidePlayer } from '@/meta/match';
import { seededRng } from '@/meta/rng';
import { duoSetup, onlineSetup, type Prefs } from '@/meta/setups';
import type { MatchConfig } from '@/game/sim/types';

const SQUAD: SidePlayer[] = [
  { id: 'wren-kowalski', level: 2 },
  { id: 'pippa-quinn', level: 1 },
  { id: 'gus-moretti', level: 3 },
];
const GUEST: SidePlayer[] = [
  { id: 'pippa-quinn', level: 4 },
  { id: 'dash-bennett', level: 1 },
  { id: 'wren-kowalski', level: 1 },
];

const prefs: Prefs = { squad: SQUAD, quarterSeconds: 24, easyShots: true, homeTeam: 'comets' };

export interface TwoPlayerCase {
  name: string;
  cfg: MatchConfig;
  /** seeds of the two scripted thumbs, home's first */
  thumbs: [number, number];
}

export const TWO_PLAYER_CASES: readonly TwoPlayerCase[] = [
  { name: 'one screen, 2 on 2', cfg: buildMatch(duoSetup(prefs, { perTeam: 2, rival: null, court: null, help: 0 }, seededRng(5))).config, thumbs: [3, 4] },
  { name: 'one screen, 3 on 3, a helping hand for P1', cfg: buildMatch(duoSetup(prefs, { perTeam: 3, rival: 'yetis', court: null, help: 1 }, seededRng(6))).config, thumbs: [7, 8] },
  { name: 'two devices, 3 on 3', cfg: buildMatch(onlineSetup({ squad: SQUAD, uniform: null, easyShots: true }, { squad: GUEST, uniform: null, easyShots: false }, 3, 24, seededRng(9))).config, thumbs: [11, 12] },
  { name: 'two devices, 2 on 2', cfg: buildMatch(onlineSetup({ squad: SQUAD, uniform: null, easyShots: false }, { squad: GUEST, uniform: null, easyShots: false }, 2, 24, seededRng(10))).config, thumbs: [13, 14] },
];
