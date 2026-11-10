/**
 * Keys each app reads from its `.env` file. Expo only inlines
 * `process.env.EXPO_PUBLIC_*` when it is read with a literal name, so the app
 * reads them (see apps/template/src/env.ts) and passes the values in here.
 */
export type ShellEnvInput = {
  EXPO_PUBLIC_SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
  EXPO_PUBLIC_REVENUECAT_IOS_KEY?: string;
  EXPO_PUBLIC_REVENUECAT_ANDROID_KEY?: string;
};

export type SupabaseConfig = { url: string; anonKey: string };
export type RevenueCatConfig = { iosKey?: string; androidKey?: string };

export type ShellConfig = {
  supabase: SupabaseConfig | null;
  revenueCat: RevenueCatConfig | null;
  /** Names of env vars that are not set, for the "not configured" notices. */
  missing: (keyof ShellEnvInput)[];
};

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function readShellConfig(env: ShellEnvInput): ShellConfig {
  const missing: (keyof ShellEnvInput)[] = [];
  const url = clean(env.EXPO_PUBLIC_SUPABASE_URL);
  const anonKey = clean(env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  const iosKey = clean(env.EXPO_PUBLIC_REVENUECAT_IOS_KEY);
  const androidKey = clean(env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY);

  if (!url) missing.push('EXPO_PUBLIC_SUPABASE_URL');
  if (!anonKey) missing.push('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  if (!iosKey) missing.push('EXPO_PUBLIC_REVENUECAT_IOS_KEY');
  if (!androidKey) missing.push('EXPO_PUBLIC_REVENUECAT_ANDROID_KEY');

  return {
    supabase: url && anonKey ? { url, anonKey } : null,
    revenueCat: iosKey || androidKey ? { iosKey, androidKey } : null,
    missing,
  };
}
