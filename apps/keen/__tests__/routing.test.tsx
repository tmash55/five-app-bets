import { renderRouter, screen } from 'expo-router/testing-library';

const mockAuth = { ready: true, session: null as null | { user: { email: string } } };
const mockOnboarding = {
  ready: true,
  completed: true,
  answers: null,
  saveAnswers: async () => undefined,
  markComplete: async () => undefined,
  reset: async () => undefined,
};

jest.mock('@five/shell', () => {
  const { buildTheme } = jest.requireActual('../../../packages/shell/src/theme/tokens');
  const { Text: RNText } = jest.requireActual('react-native');
  return {
    ShellProviders: ({ children }: { children: React.ReactNode }) => children,
    useAuth: () => mockAuth,
    OnboardingProvider: ({ children }: { children: React.ReactNode }) => children,
    useOnboarding: () => mockOnboarding,
    useAnalytics: () => ({ track: () => undefined }),
    OnboardingQuiz: () => <RNText>onboarding quiz</RNText>,
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

beforeEach(() => {
  mockOnboarding.completed = true;
});

describe('root routing', () => {
  it('shows the onboarding quiz on a first launch at /', async () => {
    mockOnboarding.completed = false;
    mockAuth.session = null;
    await renderRouter('./src/app', { initialUrl: '/' });
    expect(screen.getByText('onboarding quiz')).toBeTruthy();
    expect(screen.queryByText('sign-in screen')).toBeNull();
    expect(screen).toHavePathname('/');
  });

  it('sends a link to a game to the quiz before onboarding', async () => {
    mockOnboarding.completed = false;
    mockAuth.session = { user: { email: 'fan@example.com' } };
    await renderRouter('./src/app', { initialUrl: '/play/pairs' });
    expect(screen.getByText('onboarding quiz')).toBeTruthy();
  });

  it('shows sign-in on a signed-out cold launch at / after onboarding', async () => {
    mockAuth.session = null;
    await renderRouter('./src/app', { initialUrl: '/' });
    expect(screen.getByText('sign-in screen')).toBeTruthy();
    expect(screen.queryByText('onboarding quiz')).toBeNull();
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

