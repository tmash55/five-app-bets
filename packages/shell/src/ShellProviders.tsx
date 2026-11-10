import type { ReactNode } from 'react';

import { AnalyticsProvider, type TrackFn } from './analytics/AnalyticsProvider';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import type { ShellConfig } from './config/env';
import { PurchasesProvider } from './purchases/PurchasesProvider';
import { ThemeProvider } from './theme/ThemeProvider';
import type { ThemeOverrides } from './theme/tokens';

function PurchasesForUser({ config, children }: { config: ShellConfig; children: ReactNode }) {
  const { session } = useAuth();
  return (
    <PurchasesProvider revenueCat={config.revenueCat} appUserId={session?.user.id ?? null}>
      {children}
    </PurchasesProvider>
  );
}

/** Everything a shell app wraps its root layout in. */
export function ShellProviders({
  config,
  theme,
  track,
  children,
}: {
  config: ShellConfig;
  theme?: ThemeOverrides;
  /** Event sink for shell features. Defaults to the dev console until UNJ-1419. */
  track?: TrackFn;
  children: ReactNode;
}) {
  return (
    <AnalyticsProvider track={track}>
      <ThemeProvider overrides={theme}>
        <AuthProvider supabase={config.supabase}>
          <PurchasesForUser config={config}>{children}</PurchasesForUser>
        </AuthProvider>
      </ThemeProvider>
    </AnalyticsProvider>
  );
}
