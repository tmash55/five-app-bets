import { renderRouter, screen } from 'expo-router/testing-library';

const mockAuth = { ready: true, session: null as null | { user: { email: string } } };

jest.mock('@five/shell', () => {
  const { buildTheme } = jest.requireActual('../../../packages/shell/src/theme/tokens');
  const { Text: RNText } = jest.requireActual('react-native');
  return {
    ShellProviders: ({ children }: { children: React.ReactNode }) => children,
    useAuth: () => mockAuth,
    useTheme: () => buildTheme('light'),
    SignInScreen: () => <RNText>sign-in screen</RNText>,
    SignUpScreen: () => <RNText>sign-up screen</RNText>,
    SettingsScreen: () => <RNText>settings screen</RNText>,
    Screen: ({ children }: { children: React.ReactNode }) => children,
    Text: RNText,
    Button: ({ title }: { title: string }) => <RNText>{title}</RNText>,
    Notice: ({ title }: { title: string }) => <RNText>{title}</RNText>,
  };
});

jest.mock('expo-router/native-tabs', () => {
  const { Slot } = jest.requireActual('expo-router');
  const NativeTabs = () => <Slot />;
  const Trigger = () => null;
  Trigger.Label = () => null;
  Trigger.Icon = () => null;
  NativeTabs.Trigger = Trigger;
  return { NativeTabs };
});

jest.mock('@/env', () => ({ shellConfig: {} }));
jest.mock('@/feedback/feedback', () => ({ giveFeedback: jest.fn(), preloadFeedback: jest.fn(), releaseFeedback: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('root routing', () => {
  it('shows sign-in on a signed-out cold launch at /', async () => {
    mockAuth.session = null;
    await renderRouter('./src/app', { initialUrl: '/' });
    expect(screen.getByText('sign-in screen')).toBeTruthy();
    expect(screen).toHavePathname('/sign-in');
  });

  it('shows the Today tab on a signed-in cold launch at /', async () => {
    mockAuth.session = { user: { email: 'fan@example.com' } };
    await renderRouter('./src/app', { initialUrl: '/' });
    expect(screen.queryByText('sign-in screen')).toBeNull();
    expect(screen).toHavePathname('/');
    expect(screen.getByText('Your daily workout')).toBeTruthy();
  });

  it('sends a signed-out link to a game to sign-in', async () => {
    mockAuth.session = null;
    await renderRouter('./src/app', { initialUrl: '/play/pairs' });
    expect(screen.getByText('sign-in screen')).toBeTruthy();
  });
});

