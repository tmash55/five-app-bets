import { Notice } from '../ui/Notice';

export function BackendNotConfiguredNotice() {
  return (
    <Notice
      tone="error"
      title="Accounts are not connected yet"
      body="Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in this app's .env file, then restart the dev server."
    />
  );
}
