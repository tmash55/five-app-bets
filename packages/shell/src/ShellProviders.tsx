import type { ReactNode } from 'react';

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
  children,
}: {
  config: ShellConfig;
  theme?: ThemeOverrides;
  children: ReactNode;
}) {
  return (
    <ThemeProvider overrides={theme}>
      <AuthProvider supabase={config.supabase}>
        <PurchasesForUser config={config}>{children}</PurchasesForUser>
      </AuthProvider>
    </ThemeProvider>
  );
}
