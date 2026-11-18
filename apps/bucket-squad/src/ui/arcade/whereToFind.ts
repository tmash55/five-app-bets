/** Where a player still to be found can turn up besides packs: shared by the collection and the player page. */

import { toursFor } from '@/meta/tour';

/** The tour stop where this player is the prize, if there is one. */
export function tourStop(id: string): string | null {
  for (const tour of toursFor(null)) {
    for (const stage of tour.stages) {
      if (stage.games.some((g) => g.unlock === id)) return stage.team.name;
    }
  }
  return null;
}
