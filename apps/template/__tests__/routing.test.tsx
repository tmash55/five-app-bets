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
    OnboardingQuiz: () => <RNText>onboarding quiz</RNText>,
    useTheme: () => buildTheme('light'),
    SignInScreen: () => <RNText>sign-in screen</RNText>,
    SignUpScreen: () => <RNText>sign-up screen</RNText>,
    SettingsScreen: () => <RNText>settings screen</RNText>,
    Screen: ({ children }: { children: React.ReactNode }) => children,
    Text: RNText,
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

beforeEach(() => {
  mockOnboarding.completed = true;
});

describe('root routing', () => {
  it('shows the onboarding quiz on a first launch at /', async () => {
    mockOnboarding.completed = false;
    mockAuth.session = null;
    await renderRouter('./src/app', { initialUrl: '/' });
    expect(screen.getByText('onboarding quiz')).toBeTruthy();
    expect(screen).toHavePathname('/');
  });

  it('shows sign-in on a signed-out cold launch at / after onboarding', async () => {
    mockAuth.session = null;
    await renderRouter('./src/app', { initialUrl: '/' });
    expect(screen.getByText('sign-in screen')).toBeTruthy();
    expect(screen).toHavePathname('/sign-in');
  });

  it('shows the home tab on a signed-in cold launch at /', async () => {
    mockAuth.session = { user: { email: 'fan@example.com' } };
    await renderRouter('./src/app', { initialUrl: '/' });
    expect(screen.queryByText('sign-in screen')).toBeNull();
    expect(screen).toHavePathname('/');
  });
});

