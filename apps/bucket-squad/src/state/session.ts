/** Things that only matter while the app is open: the match about to be played, the one just finished. */

import { create } from 'zustand';

import type { MatchSetup, MatchSummary } from '@/meta/match';
import type { MatchOutcome } from './logic';

interface Session {
  /** the match the match screen should run */
  setup: MatchSetup | null;
  /** what the results screen shows */
  summary: MatchSummary | null;
  outcome: MatchOutcome | null;
  begin: (setup: MatchSetup) => void;
  finish: (summary: MatchSummary, outcome: MatchOutcome) => void;
  clearResults: () => void;
}

export const useSession = create<Session>((set) => ({
  setup: null,
  summary: null,
  outcome: null,
  begin: (setup) => set({ setup, summary: null, outcome: null }),
  finish: (summary, outcome) => set({ summary, outcome }),
  clearResults: () => set({ summary: null, outcome: null }),
}));
