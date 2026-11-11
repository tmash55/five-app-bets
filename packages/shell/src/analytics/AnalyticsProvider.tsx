import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import type { AnalyticsClient } from './client';
import {
  APP_PROPERTY,
  localDay,
  openEventsFor,
  purchaseEventFor,
  type PurchaseDetails,
} from './events';

export type EventProperties = Record<string, string | number | boolean | string[] | null>;
export type TrackFn = (event: string, properties?: EventProperties) => void;

export type Analytics = {
  track: TrackFn;
  /** Links later events to a signed-in user. The shell calls this on sign-in. */
  identify: (userId: string) => void;
  /** Starts a fresh anonymous identity. The shell calls this on sign-out. */
  reset: () => void;
  /**
   * PostHog's id for this user, or null when nothing is sent to PostHog.
   * Passed to RevenueCat so its server-side events land on the same person.
   */
  distinctId: string | null;
  /** False while third-party tracking is off (kids' areas or app-wide). */
  thirdPartyTracking: boolean;
  /** Used by <TrackingOff>. Returns the function that ends the hold. */
  holdTrackingOff: () => () => void;
};

export const LAST_OPEN_DAY_KEY = 'five.analytics.lastOpenDay';

function devLog(event: string, properties: EventProperties | undefined, sent: boolean) {
  if (__DEV__ && process.env.NODE_ENV !== 'test') {
    console.log(`[analytics${sent ? '' : ':local'}] ${event}`, properties ?? {});
  }
}

const devOnly: Analytics = {
  track: (event, properties) => devLog(event, properties, false),
  identify: () => undefined,
  reset: () => undefined,
  distinctId: null,
  thirdPartyTracking: false,
  holdTrackingOff: () => () => undefined,
};

const AnalyticsContext = createContext<Analytics>(devOnly);

function swallow(result: void | Promise<void>) {
  if (result && typeof result.catch === 'function') result.catch(() => undefined);
}

/**
 * Supplies the event sink every shell feature reports to.
 *
 * - `client` is the PostHog client (see createPostHogClient). Without one,
 *   events only go to the dev console.
 * - `track` replaces the sink entirely; tests and custom sinks use it.
 * - `thirdPartyTracking={false}` turns PostHog off for the whole app. Use
 *   <TrackingOff> to turn it off for one area, such as a kids' section.
 * - `appId` is set on every event as the `app` property.
 */
export function AnalyticsProvider({
  client = null,
  track: trackOverride,
  appId,
  thirdPartyTracking = true,
  trackAppOpens = false,
  children,
}: {
  client?: AnalyticsClient | null;
  track?: TrackFn;
  appId?: string;
  thirdPartyTracking?: boolean;
  /** Fire app_first_opened and app_opened. ShellProviders turns this on. */
  trackAppOpens?: boolean;
  children: ReactNode;
}) {
  const [holds, setHolds] = useState(0);
  // Read synchronously by track(), so an event fired in the same render as a
  // <TrackingOff> mount is still dropped.
  const holdsRef = useRef(0);
  const enabled = thirdPartyTracking && Boolean(client) && holds === 0;
  // Bumped after identify/reset so distinctId is read from the client again.
  const [identityVersion, setIdentityVersion] = useState(0);

  const holdTrackingOff = useCallback(() => {
    holdsRef.current += 1;
    setHolds(holdsRef.current);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      holdsRef.current -= 1;
      setHolds(holdsRef.current);
    };
  }, []);

  // Opt the SDK in or out to match. optOut also stops anything it queued.
  useEffect(() => {
    if (!client) return;
    swallow(enabled ? client.optIn() : client.optOut());
  }, [client, enabled]);

  const distinctId = useMemo(
    () => (client && enabled ? client.getDistinctId() : null),
    // identityVersion changes when the client's id does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, enabled, identityVersion],
  );

  useEffect(() => {
    if (client && appId) swallow(client.register({ [APP_PROPERTY]: appId }));
  }, [client, appId]);

  const track = useCallback<TrackFn>(
    (event, properties) => {
      if (trackOverride) {
        trackOverride(event, properties);
        return;
      }
      const send = Boolean(client) && thirdPartyTracking && holdsRef.current === 0;
      if (send) client?.capture(event, properties);
      devLog(event, properties, send);
    },
    [client, thirdPartyTracking, trackOverride],
  );

  const identify = useCallback(
    (userId: string) => {
      if (!client || !thirdPartyTracking || holdsRef.current > 0) return;
      client.identify(userId);
      setIdentityVersion((v) => v + 1);
    },
    [client, thirdPartyTracking],
  );

  const reset = useCallback(() => {
    if (!client) return;
    client.reset();
    setIdentityVersion((v) => v + 1);
  }, [client]);

  useAppOpenEvents(trackAppOpens ? track : null);

  const value = useMemo<Analytics>(
    () => ({
      track,
      identify,
      reset,
      distinctId,
      thirdPartyTracking: enabled,
      holdTrackingOff,
    }),
    [track, identify, reset, distinctId, enabled, holdTrackingOff],
  );
  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>;
}

/**
 * Fires app_first_opened and app_opened the first time the app is in the
 * foreground on each local day. These feed the next-day return gate.
 */
function useAppOpenEvents(track: TrackFn | null) {
  const enabled = Boolean(track);
  const fire: TrackFn = useEffectEvent((event, properties) => track?.(event, properties));

  useEffect(() => {
    if (!enabled) return;
    let running = false;
    const check = async () => {
      if (running) return;
      running = true;
      try {
        const today = localDay(new Date());
        const last = await AsyncStorage.getItem(LAST_OPEN_DAY_KEY);
        const events = openEventsFor(last, today);
        if (events.length === 0) return;
        await AsyncStorage.setItem(LAST_OPEN_DAY_KEY, today);
        for (const { event, properties } of events) fire(event, properties);
      } catch {
        // Storage failures only cost one open event; never break the app.
      } finally {
        running = false;
      }
    };
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [enabled]);
}

export function useAnalytics(): Analytics {
  return useContext(AnalyticsContext);
}

/**
 * Turns third-party tracking off while mounted. Wrap kids' areas in it.
 * Events fired inside still reach the dev console, never PostHog.
 */
export function TrackingOff({ children }: { children: ReactNode }) {
  const { holdTrackingOff } = useAnalytics();
  // A layout effect runs before any passive effect below it, so events that
  // children fire from useEffect on mount are already blocked.
  useLayoutEffect(() => holdTrackingOff(), [holdTrackingOff]);
  return <>{children}</>;
}

/** Fires an event once when the calling screen mounts. */
export function useTrackOnMount(event: string, properties?: EventProperties) {
  const { track } = useAnalytics();
  const sent = useRef(false);
  const propsRef = useRef(properties);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    track(event, propsRef.current);
  }, [event, track]);
}

/**
 * Reports a finished store purchase as trial_started or purchase_completed.
 * The paywall calls this with the new entitlement's RevenueCat period type.
 */
export function trackPurchase(track: TrackFn, details: PurchaseDetails) {
  const properties: EventProperties = {
    product_id: details.productId,
    period_type: details.periodType,
  };
  if (details.price !== undefined) properties.price = details.price;
  if (details.currency !== undefined) properties.currency = details.currency;
  track(purchaseEventFor(details.periodType), properties);
}
