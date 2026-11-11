import { readShellConfig } from '../config/env';

describe('readShellConfig', () => {
  it('returns null backends and lists every missing key when nothing is set', () => {
    const config = readShellConfig({});
    expect(config.supabase).toBeNull();
    expect(config.revenueCat).toBeNull();
    expect(config.missing).toHaveLength(5);
    expect(config.posthog).toBeNull();
  });

  it('treats blank values as missing', () => {
    const config = readShellConfig({
      EXPO_PUBLIC_SUPABASE_URL: '  ',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'key',
    });
    expect(config.supabase).toBeNull();
    expect(config.missing).toContain('EXPO_PUBLIC_SUPABASE_URL');
  });

  it('builds the Supabase and RevenueCat configs when keys are present', () => {
    const config = readShellConfig({
      EXPO_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon',
      EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'appl_123',
    });
    expect(config.supabase).toEqual({ url: 'https://abc.supabase.co', anonKey: 'anon' });
    expect(config.revenueCat).toEqual({ iosKey: 'appl_123', androidKey: undefined });
    expect(config.missing).toEqual(['EXPO_PUBLIC_REVENUECAT_ANDROID_KEY', 'EXPO_PUBLIC_POSTHOG_KEY']);
  });
});
