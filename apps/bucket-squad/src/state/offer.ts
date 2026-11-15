/** What a device brings to an online game, as plain functions (no store), so the tests can check exactly what crosses the wire. */

import { NETCODE_VERSION, ROSTER_FINGERPRINT, type Offer } from '@/net/protocol';
import type { OnlineSquad } from '@/meta/setups';
import { wordIndexes, wordsAt } from '@/meta/teamName';
import { squadLevels, type SaveData } from './logic';

/**
 * What this device brings: its squad's card ids and levels, its uniform, its shot window, the team it plays as, its
 * colours, and its name when the wheels built it (as the words' places on the wheels). Nothing personal: a typed name
 * is left out, and the friend sees "Player 1" or "Player 2" instead.
 */
export function offerFrom(data: Pick<SaveData, 'squad' | 'owned' | 'uniform' | 'settings' | 'teamName' | 'teamColors'>, playAs: string | null): Offer {
  const name = data.teamName;
  return {
    v: NETCODE_VERSION,
    fp: ROSTER_FINGERPRINT,
    squad: squadLevels(data).map((p) => ({ id: p.id, level: p.level })),
    uni: data.uniform ?? null,
    easy: data.settings.easyShots,
    ...(name && 'words' in name ? { words: wordIndexes(name.words) } : {}),
    ...(data.teamColors ? { colors: data.teamColors } : {}),
    ...(playAs ? { team: playAs } : {}),
  };
}

/** An offer as the host builds the match from it. */
export function squadOf(o: Offer): OnlineSquad {
  return { squad: o.squad, uniform: o.uni, easyShots: o.easy, words: wordsAt(o.words), colors: o.colors ?? null, team: o.team ?? null };
}
