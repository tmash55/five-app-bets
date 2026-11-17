import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Clipboard from 'expo-clipboard';
import { Platform } from 'react-native';

import {
  captureInstallReferrer,
  inviteCodeFromPaste,
  inviteCodeFromReferrer,
  shouldOfferClipboardInvite,
} from '../src/invite/deferredInvite';
import { takePendingInvite } from '../src/invite/pendingInvite';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-application', () => ({ getInstallReferrerAsync: jest.fn() }));
jest.mock('expo-clipboard', () => ({ isPasteButtonAvailable: true, hasUrlAsync: jest.fn() }));

const referrer = Application.getInstallReferrerAsync as jest.Mock;
const hasUrl = Clipboard.hasUrlAsync as jest.Mock;

function setOS(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('reading an invite code', () => {
  it('finds it in a Play install referrer', () => {
    expect(inviteCodeFromReferrer('invite=ABCD2345&utm_source=google-play')).toBe('ABCD2345');
    expect(inviteCodeFromReferrer('utm_source=x&invite=abcd2345')).toBe('ABCD2345');
    expect(inviteCodeFromReferrer('utm_source=google-play&utm_medium=organic')).toBeNull();
    expect(inviteCodeFromReferrer('invite=NOT-A-CODE-0')).toBeNull();
    expect(inviteCodeFromReferrer('invite=%E0%A4%A')).toBeNull();
  });

  it('finds it in a pasted link or bare code', () => {
    expect(inviteCodeFromPaste('https://calledit.app/join/ABCD2345')).toBe('ABCD2345');
    expect(inviteCodeFromPaste('calledit://join/abcd2345')).toBe('ABCD2345');
    expect(inviteCodeFromPaste('  abcd2345 ')).toBe('ABCD2345');
    expect(inviteCodeFromPaste('Join me: https://calledit.app/join/ABCD2345 now')).toBe('ABCD2345');
    expect(inviteCodeFromPaste('https://example.com/something')).toBeNull();
  });
});

describe('Android install referrer', () => {
  it('saves the invite once, so the join screen opens after sign-up', async () => {
    setOS('android');
    referrer.mockResolvedValue('invite=ABCD2345');
    await captureInstallReferrer();
    expect(await takePendingInvite()).toBe('ABCD2345');
    await captureInstallReferrer();
    expect(referrer).toHaveBeenCalledTimes(1);
  });

  it('does nothing on iOS or without a referrer', async () => {
    setOS('ios');
    await captureInstallReferrer();
    expect(referrer).not.toHaveBeenCalled();
    setOS('android');
    referrer.mockRejectedValue(new Error('no Play services'));
    await captureInstallReferrer();
    expect(await takePendingInvite()).toBeNull();
  });
});

describe('iOS clipboard offer', () => {
  it('offers once, and only with a link on the clipboard', async () => {
    setOS('ios');
    hasUrl.mockResolvedValue(true);
    expect(await shouldOfferClipboardInvite()).toBe(true);
    expect(await shouldOfferClipboardInvite()).toBe(false);
  });

  it('does not offer without a link, or on Android', async () => {
    setOS('ios');
    hasUrl.mockResolvedValue(false);
    expect(await shouldOfferClipboardInvite()).toBe(false);
    await AsyncStorage.clear();
    setOS('android');
    hasUrl.mockResolvedValue(true);
    expect(await shouldOfferClipboardInvite()).toBe(false);
  });
});
