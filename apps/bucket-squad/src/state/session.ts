/** Things that only matter while the app is open: the match about to be played, the one just finished. */

import { create } from 'zustand';

import type { MatchSetup, MatchSummary } from '@/meta/match';
import type { DuoOptions, QuickOptions } from '@/meta/setups';
import type { MatchOutcome } from './logic';

interface Session {
  /** the match the match screen should run */
  setup: MatchSetup | null;
  /** the choices behind the last quick game, for "play again" */
  quick: QuickOptions | null;
  /** the choices behind the last two-player game, for "play again" */
  duo: DuoOptions | null;
  /** what the results screen shows */
  summary: MatchSummary | null;
  outcome: MatchOutcome | null;
  begin: (setup: MatchSetup, quick?: QuickOptions, duo?: DuoOptions) => void;
  finish: (summary: MatchSummary, outcome: MatchOutcome) => void;
  clearResults: () => void;
}

export const useSession = create<Session>((set) => ({
  setup: null,
  quick: null,
  duo: null,
  summary: null,
  outcome: null,
  begin: (setup, quick, duo) => set((s) => ({ setup, quick: quick ?? s.quick, duo: duo ?? s.duo, summary: null, outcome: null })),
  finish: (summary, outcome) => set({ summary, outcome }),
  clearResults: () => set({ summary: null, outcome: null }),
}));
