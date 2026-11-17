import { apiKeyForPlatform } from '../purchases/PurchasesProvider';

jest.mock('react-native-purchases', () => ({}));

describe('apiKeyForPlatform', () => {
  const config = { iosKey: 'appl_1', androidKey: 'goog_1' };

  it('picks the key for the running platform', () => {
    expect(apiKeyForPlatform(config, 'ios')).toBe('appl_1');
    expect(apiKeyForPlatform(config, 'android')).toBe('goog_1');
  });

  it('returns nothing on web or without a config', () => {
    expect(apiKeyForPlatform(config, 'web')).toBeUndefined();
    expect(apiKeyForPlatform(null, 'ios')).toBeUndefined();
  });
});
