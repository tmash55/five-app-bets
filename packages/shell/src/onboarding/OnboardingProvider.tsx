import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { QuizAnswers } from './types';

type Stored = { answers: QuizAnswers | null; completedAt: string | null };

export type OnboardingContextValue = {
  /** False until the saved state has loaded. */
  ready: boolean;
  /** True once the user has finished onboarding (quiz and paywall step). */
  completed: boolean;
  /** Answers from the last finished quiz, for the paywall and the app to use. */
  answers: QuizAnswers | null;
  saveAnswers: (answers: QuizAnswers) => Promise<void>;
  markComplete: () => Promise<void>;
  /** Clears saved state so the quiz shows again. */
  reset: () => Promise<void>;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function onboardingStorageKey(quizId: string): string {
  return `five.onboarding.${quizId}`;
}

const EMPTY: Stored = { answers: null, completedAt: null };

export function OnboardingProvider({ quizId, children }: { quizId: string; children: ReactNode }) {
  const key = onboardingStorageKey(quizId);
  const [ready, setReady] = useState(false);
  const [stored, setStored] = useState<Stored>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (cancelled) return;
        setStored(raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Stored>) } : EMPTY);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const write = useCallback(
    async (next: Stored) => {
      setStored(next);
      await AsyncStorage.setItem(key, JSON.stringify(next));
    },
    [key],
  );

  const saveAnswers = useCallback(
    (answers: QuizAnswers) => write({ ...stored, answers }),
    [stored, write],
  );
  const markComplete = useCallback(
    () => write({ ...stored, completedAt: new Date().toISOString() }),
    [stored, write],
  );
  const reset = useCallback(async () => {
    setStored(EMPTY);
    await AsyncStorage.removeItem(key);
  }, [key]);

  const value = useMemo(
    () => ({
      ready,
      completed: Boolean(stored.completedAt),
      answers: stored.answers,
      saveAnswers,
      markComplete,
      reset,
    }),
    [ready, stored, saveAnswers, markComplete, reset],
  );
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const value = useContext(OnboardingContext);
  if (!value) throw new Error('useOnboarding must be used inside <OnboardingProvider>.');
  return value;
}
