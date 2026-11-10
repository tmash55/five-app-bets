import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '../auth/AuthProvider';
import { useToday } from './useToday';
import {
  dayKey,
  emptyStreak,
  grantFreezes as grantFreezesRule,
  newerStreak,
  parseStreak,
  recordActivity as recordActivityRule,
  viewStreak,
  type StreakRules,
  type StreakState,
  type StreakView,
} from './streak';

export const STREAK_STORAGE_KEY = 'five.streak';
/** Supabase table, see apps/template/supabase/migrations. */
export const STREAK_TABLE = 'user_streaks';

export type StreakContextValue = StreakView & {
  /** False until the saved streak has been read. */
  ready: boolean;
  today: string;
  /** Call when the user completes the app's daily action. Safe to call more than once a day. */
  recordActivity: () => Promise<void>;
  /** Gives freezes, capped at the app's `maxFreezes`. */
  grantFreezes: (count?: number) => Promise<void>;
  rules: StreakRules;
  /** The stored state, for apps that want more than the view (for example frozen days). */
  state: StreakState;
};

const StreakContext = createContext<StreakContextValue | null>(null);

export const defaultStreakRules: StreakRules = { maxFreezes: 0 };

async function readLocal(): Promise<StreakState | null> {
  try {
    const raw = await AsyncStorage.getItem(STREAK_STORAGE_KEY);
    return raw ? parseStreak(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function StreakProvider({
  rules = defaultStreakRules,
  children,
}: {
  rules?: StreakRules;
  children: ReactNode;
}) {
  const { client, session } = useAuth();
  const userId = session?.user.id ?? null;
  const today = useToday();
  const [state, setState] = useState<StreakState>(() => emptyStreak());
  const [ready, setReady] = useState(false);
  // The latest state, so async callbacks never write an older copy.
  const latest = useRef(state);

  const pushToServer = useCallback(
    async (next: StreakState) => {
      if (!client || !userId) return;
      // Best effort: the local copy is the source of truth while offline.
      const { error } = await client
        .from(STREAK_TABLE)
        .upsert({ user_id: userId, state: next, updated_at: next.updatedAt });
      if (error) console.warn(`[shell] Could not save the streak: ${error.message}`);
    },
    [client, userId],
  );

  const save = useCallback(
    async (next: StreakState) => {
      latest.current = next;
      setState(next);
      await AsyncStorage.setItem(STREAK_STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
      await pushToServer(next);
    },
    [pushToServer],
  );

  // Load the local copy, then the account's copy when signed in, and keep the newer.
  useEffect(() => {
    let active = true;
    (async () => {
      const local = (await readLocal()) ?? latest.current;
      let remote: StreakState | null = null;
      if (client && userId) {
        const { data, error } = await client
          .from(STREAK_TABLE)
          .select('state')
          .eq('user_id', userId)
          .maybeSingle();
        if (error) console.warn(`[shell] Could not load the streak: ${error.message}`);
        remote = parseStreak(data?.state);
      }
      if (!active) return;
      const merged = newerStreak(local, remote);
      latest.current = merged;
      setState(merged);
      setReady(true);
      if (merged !== local) {
        await AsyncStorage.setItem(STREAK_STORAGE_KEY, JSON.stringify(merged)).catch(() => undefined);
      } else if (
        local.lastActiveDay &&
        (!remote || Date.parse(remote.updatedAt) < Date.parse(local.updatedAt))
      ) {
        await pushToServer(local);
      }
    })();
    return () => {
      active = false;
    };
  }, [client, userId, pushToServer]);

  const recordActivity = useCallback(async () => {
    const next = recordActivityRule(latest.current, dayKey(new Date()));
    if (next !== latest.current) await save(next);
  }, [save]);

  const grantFreezes = useCallback(
    async (count = 1) => {
      const next = grantFreezesRule(latest.current, rules, count);
      if (next !== latest.current) await save(next);
    },
    [rules, save],
  );

  const value = useMemo<StreakContextValue>(
    () => ({
      ...viewStreak(state, today),
      ready,
      today,
      recordActivity,
      grantFreezes,
      rules,
      state,
    }),
    [state, today, ready, recordActivity, grantFreezes, rules],
  );

  return <StreakContext.Provider value={value}>{children}</StreakContext.Provider>;
}

export function useStreak(): StreakContextValue {
  const value = useContext(StreakContext);
  if (!value) throw new Error('useStreak must be used inside <ShellProviders>.');
  return value;
}
