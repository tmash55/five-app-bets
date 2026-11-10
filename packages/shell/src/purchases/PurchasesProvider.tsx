import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';

import type { RevenueCatConfig } from '../config/env';

export type RestoreResult = { activeEntitlements: string[] };

export type PurchasesContextValue = {
  /** False when this platform has no RevenueCat key in the env. */
  configured: boolean;
  restore: () => Promise<RestoreResult>;
};

const PurchasesContext = createContext<PurchasesContextValue | null>(null);

export class PurchasesNotConfiguredError extends Error {
  constructor() {
    super('Purchases are not set up for this build yet. Add the RevenueCat keys to .env.');
    this.name = 'PurchasesNotConfiguredError';
  }
}

export function apiKeyForPlatform(
  config: RevenueCatConfig | null,
  os: typeof Platform.OS,
): string | undefined {
  if (!config) return undefined;
  if (os === 'ios') return config.iosKey;
  if (os === 'android') return config.androidKey;
  return undefined;
}

let configuredKey: string | undefined;

export function PurchasesProvider({
  revenueCat,
  appUserId,
  analyticsDistinctId = null,
  children,
}: {
  revenueCat: RevenueCatConfig | null;
  /** The signed-in Supabase user id, so purchases follow the account. */
  appUserId: string | null;
  /**
   * PostHog's id for this user. RevenueCat's PostHog integration sends trial
   * conversions and renewals to this person.
   */
  analyticsDistinctId?: string | null;
  children: ReactNode;
}) {
  const apiKey = apiKeyForPlatform(revenueCat, Platform.OS);

  useEffect(() => {
    if (!apiKey || configuredKey === apiKey) return;
    Purchases.configure({ apiKey, appUserID: appUserId ?? undefined });
    configuredKey = apiKey;
    // Configure once per key; identity changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  useEffect(() => {
    if (!apiKey) return;
    if (appUserId) {
      Purchases.logIn(appUserId).catch(() => undefined);
    } else {
      Purchases.isAnonymous()
        .then((anonymous) => (anonymous ? undefined : Purchases.logOut()))
        .catch(() => undefined);
    }
  }, [apiKey, appUserId]);

  useEffect(() => {
    if (!apiKey || !analyticsDistinctId) return;
    Purchases.setAttributes({ $posthogUserId: analyticsDistinctId }).catch(() => undefined);
  }, [apiKey, analyticsDistinctId, appUserId]);

  const restore = useCallback(async () => {
    if (!apiKey) throw new PurchasesNotConfiguredError();
    const info = await Purchases.restorePurchases();
    return { activeEntitlements: Object.keys(info.entitlements.active) };
  }, [apiKey]);

  const value = useMemo(() => ({ configured: Boolean(apiKey), restore }), [apiKey, restore]);
  return <PurchasesContext.Provider value={value}>{children}</PurchasesContext.Provider>;
}

export function usePurchases(): PurchasesContextValue {
  const value = useContext(PurchasesContext);
  if (!value) throw new Error('usePurchases must be used inside <PurchasesProvider>.');
  return value;
}
