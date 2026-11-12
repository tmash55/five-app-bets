/**
 * The optional extra roster pack. Public builds get this empty one; a family
 * build swaps in `private/roster/index.ts` (see metro.config.js), which exports
 * the same two names.
 */

import type { RosterPack } from './types';

export const EXTRA_ROSTER: RosterPack | null = null;
