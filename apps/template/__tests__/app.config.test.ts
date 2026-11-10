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
});
