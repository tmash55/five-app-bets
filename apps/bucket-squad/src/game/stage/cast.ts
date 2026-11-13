/** Who stands on the warm-up stage, in what kit, and what part each one plays. */

import { mustPlayer, teamById } from '@/data/roster';
import { homeLook } from '@/meta/match';
import { homeSide } from '@/meta/setups';
import type { StagePaint, StageSetup } from '../render/stage';
import { rolesFor } from './director';

/** A steady number for a squad, so the same three always warm up in the same order. */
export function squadSeed(ids: readonly string[]): number {
  let h = 2166136261;
  for (const id of ids) {
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
    h = Math.imul(h ^ 44, 16777619);
  }
  return h >>> 0;
}

/** The person's squad on one base, in the kit they wear in a match (the captain's team's). `paint` stands them on the screen's own floor instead of a court, `spread` sets them further apart. */
export function squadStage(ids: readonly string[], paint?: StagePaint, spread?: number): StageSetup {
  const side = homeSide(ids.slice(0, 3).map((id) => ({ id, level: 1 })));
  const team = teamById(side.kitTeam);
  const roles = rolesFor(side.players.length);
  return {
    seed: squadSeed(ids),
    ...(paint ? { paint } : {}),
    ...(spread !== undefined ? { spread } : {}),
    groups: [
      {
        members: side.players.map((p, i) => ({ look: homeLook(mustPlayer(p.id), team), role: roles[i] })),
        kit: team.kit,
        color: team.color,
        court: team.court,
        x: 0,
        z: 0,
        turn: 0,
      },
    ],
  };
}
