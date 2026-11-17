import { ThemeProvider } from '@five/shell';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import InvitedScreen from '../src/app/invited';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-purchases', () => ({ __esModule: true, default: {}, LOG_LEVEL: {} }));
jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), canGoBack: () => true } }));
let mockPasted = '';
jest.mock('expo-clipboard', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable, Text } = require('react-native');
  return {
    ClipboardPasteButton: ({ onPress }: { onPress: (d: { type: 'text'; text: string }) => void }) => (
      <Pressable onPress={() => onPress({ type: 'text', text: mockPasted })}>
        <Text>Paste</Text>
      </Pressable>
    ),
  };
});

const wrap = () =>
  render(
    <ThemeProvider>
      <InvitedScreen />
    </ThemeProvider>,
  );

beforeEach(() => jest.clearAllMocks());

it('opens the league from a pasted invite link', async () => {
  mockPasted = 'https://calledit.app/join/ABCD2345';
  await wrap();
  await fireEvent.press(screen.getByText('Paste'));
  expect(router.replace).toHaveBeenCalledWith({ pathname: '/join/[code]', params: { code: 'ABCD2345' } });
});

it('says so when the pasted text is not an invite', async () => {
  mockPasted = 'https://example.com/recipe';
  await wrap();
  await fireEvent.press(screen.getByText('Paste'));
  expect(router.replace).not.toHaveBeenCalled();
  expect(screen.getByText('No invite found')).toBeOnTheScreen();
});

it('takes a typed code, or can be skipped', async () => {
  await wrap();
  await fireEvent.changeText(screen.getByLabelText('Or type the invite code'), 'abcd-2345');
  await fireEvent.press(screen.getByText('Find league'));
  expect(router.replace).toHaveBeenCalledWith({ pathname: '/join/[code]', params: { code: 'ABCD2345' } });
  await fireEvent.press(screen.getByText('Skip'));
  expect(router.back).toHaveBeenCalled();
});
