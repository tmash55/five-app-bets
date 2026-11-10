import identity from '../app.identity.json';

function loadConfig(env: Record<string, string | undefined>) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
  let config: typeof import('../app.config').default | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    config = require('../app.config').default;
  });
  process.env = saved;
  return config!;
}

describe('app.config', () => {
  it('takes name, slug and bundle IDs from app.identity.json', () => {
    const config = loadConfig({ EXPO_PUBLIC_INVITE_LINK_HOST: undefined });
    expect(config.name).toBe(identity.name);
    expect(config.slug).toBe(identity.slug);
    expect(config.scheme).toBe(identity.scheme);
    expect(config.ios?.bundleIdentifier).toBe(identity.iosBundleIdentifier);
    expect(config.android?.package).toBe(identity.androidPackage);
  });

  it('adds no universal or app links until an invite link host is set', () => {
    const config = loadConfig({ EXPO_PUBLIC_INVITE_LINK_HOST: undefined });
    expect(config.ios?.associatedDomains).toBeUndefined();
    expect(config.android?.intentFilters).toBeUndefined();
  });

  it('opens https://<host>/join/ links in the app once the host is set', () => {
    const config = loadConfig({ EXPO_PUBLIC_INVITE_LINK_HOST: 'invite.example.com' });
    expect(config.ios?.associatedDomains).toEqual(['applinks:invite.example.com']);
    expect(config.android?.intentFilters).toEqual([
      expect.objectContaining({
        autoVerify: true,
        data: [{ scheme: 'https', host: 'invite.example.com', pathPrefix: '/join/' }],
      }),
    ]);
  });

  it('lets the app query Instagram Stories and X', () => {
    const config = loadConfig({});
    expect(config.plugins).toContainEqual([
      'react-native-share',
      expect.objectContaining({ ios: expect.arrayContaining(['instagram-stories', 'twitter']) }),
    ]);
  });
});
