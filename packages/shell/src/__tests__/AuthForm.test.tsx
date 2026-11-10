import { fireEvent, render, screen } from '@testing-library/react-native';

import { AuthProvider } from '../auth/AuthProvider';
import { SignInScreen } from '../screens/AuthForm';
import { ThemeProvider } from '../theme/ThemeProvider';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

async function renderSignIn(onGoToSignUp = jest.fn()) {
  await render(
    <ThemeProvider>
      <AuthProvider supabase={null}>
        <SignInScreen onGoToSignUp={onGoToSignUp} />
      </AuthProvider>
    </ThemeProvider>,
  );
  return { onGoToSignUp };
}

describe('SignInScreen without a backend', () => {
  it('says accounts are not connected and disables sign in', async () => {
    await renderSignIn();
    expect(screen.getByText('Accounts are not connected yet')).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: 'Sign in' })[0]).toBeDisabled();
  });

  it('still lets the user switch to sign up', async () => {
    const { onGoToSignUp } = await renderSignIn();
    await fireEvent.press(screen.getByText('New here? Create an account'));
    expect(onGoToSignUp).toHaveBeenCalled();
  });
});
