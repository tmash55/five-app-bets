import { createContext, useContext, useMemo, type ReactNode } from 'react';

export type EventProperties = Record<string, string | number | boolean | string[] | null>;
export type TrackFn = (event: string, properties?: EventProperties) => void;

export type Analytics = { track: TrackFn };

/**
 * Until event tracking is wired to PostHog (UNJ-1419), events go to the dev
 * console so they can be checked by hand. Release builds drop them.
 */
const devTrack: TrackFn = (event, properties) => {
  if (__DEV__ && process.env.NODE_ENV !== 'test') {
    console.log(`[analytics] ${event}`, properties ?? {});
  }
};

const AnalyticsContext = createContext<Analytics>({ track: devTrack });

/**
 * Supplies the event sink every shell feature reports to. Apps pass their
 * tracker here; the PostHog client from UNJ-1419 plugs in the same way.
 */
export function AnalyticsProvider({ track, children }: { track?: TrackFn; children: ReactNode }) {
  const value = useMemo(() => ({ track: track ?? devTrack }), [track]);
  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>;
}

export function useAnalytics(): Analytics {
  return useContext(AnalyticsContext);
}
