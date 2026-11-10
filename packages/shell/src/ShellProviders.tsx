import { useEffect, useRef, type ReactNode } from 'react';

import { AnalyticsProvider, useAnalytics, type TrackFn } from './analytics/AnalyticsProvider';
import { createPostHogClient, type AnalyticsClient, type PostHogConfig } from './analytics/client';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import type { ShellConfig } from './config/env';
import { PurchasesProvider } from './purchases/PurchasesProvider';
import { ThemeProvider } from './theme/ThemeProvider';
import type { ThemeOverrides } from './theme/tokens';

let sharedClient: { key: string; client: AnalyticsClient } | null = null;

/** One PostHog client per key for the life of the JS runtime. */
function postHogClientFor(config: PostHogConfig | null): AnalyticsClient | null {
  if (!config) return null;
  const key = `${config.host}|${config.apiKey}`;
  if (sharedClient?.key !== key) sharedClient = { key, client: createPostHogClient(config) };
  return sharedClient.client;
}

/** Ties analytics identity to the signed-in account. */
function AnalyticsIdentity() {
  const { session } = useAuth();
  const { identify, reset } = useAnalytics();
  const userId = session?.user.id ?? null;
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (userId) identify(userId);
    else if (previous.current) reset();
    previous.current = userId;
  }, [userId, identify, reset]);

  return null;
}

function PurchasesForUser({ config, children }: { config: ShellConfig; children: ReactNode }) {
  const { session } = useAuth();
  const { distinctId } = useAnalytics();
  return (
    <PurchasesProvider
      revenueCat={config.revenueCat}
      appUserId={session?.user.id ?? null}
      analyticsDistinctId={distinctId}>
      {children}
    </PurchasesProvider>
  );
}

export type ShellAnalyticsOptions = {
  /** Set on every event as `app`. Use the app's slug from app.identity.json. */
  appId?: string;
  /**
   * False turns PostHog off for the whole app (for example a kids-only app).
   * Use <TrackingOff> to turn it off for one area instead.
   */
  thirdPartyTracking?: boolean;
  /** Replaces the event sink. Mainly for tests. */
  track?: TrackFn;
};

/** Everything a shell app wraps its root layout in. */
export function ShellProviders({
  config,
  theme,
  analytics,
  children,
}: {
  config: ShellConfig;
  theme?: ThemeOverrides;
  analytics?: ShellAnalyticsOptions;
  children: ReactNode;
}) {
  const thirdParty = analytics?.thirdPartyTracking ?? true;
  // A kids-only app never loads the PostHog SDK at all.
  const client = thirdParty ? postHogClientFor(config.posthog ?? null) : null;
  return (
    <AnalyticsProvider
      client={client}
      track={analytics?.track}
      appId={analytics?.appId}
      thirdPartyTracking={thirdParty}
      trackAppOpens>
      <ThemeProvider overrides={theme}>
        <AuthProvider supabase={config.supabase}>
          <AnalyticsIdentity />
          <PurchasesForUser config={config}>{children}</PurchasesForUser>
        </AuthProvider>
      </ThemeProvider>
    </AnalyticsProvider>
  );
}
