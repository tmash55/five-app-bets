import config from '../app.config';
import identity from '../app.identity.json';

describe('app.config', () => {
  it('takes name, slug and bundle IDs from app.identity.json', () => {
    expect(config.name).toBe(identity.name);
    expect(config.slug).toBe(identity.slug);
    expect(config.scheme).toBe(identity.scheme);
    expect(config.ios?.bundleIdentifier).toBe(identity.iosBundleIdentifier);
    expect(config.android?.package).toBe(identity.androidPackage);
  });

  it('includes the notifications plugin with a tint from the theme', () => {
    const plugin = config.plugins?.find((p) => Array.isArray(p) && p[0] === 'expo-notifications');
    expect(plugin).toBeDefined();
    expect((plugin as [string, { color: string }])[1].color).toMatch(/^#/);
  });
});

describe('app.config env', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
    jest.resetModules();
  });

  it('passes EAS_PROJECT_ID through for push tokens', () => {
    process.env.EAS_PROJECT_ID = 'abc-123';
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fresh = require('../app.config').default;
      expect(fresh.extra.eas.projectId).toBe('abc-123');
    });
  });

  it('leaves the EAS project out when it is not set', () => {
    delete process.env.EAS_PROJECT_ID;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fresh = require('../app.config').default;
      expect(fresh.extra.eas).toBeUndefined();
    });
  });
});
