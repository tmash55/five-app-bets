import { useState } from 'react';

import { friendlyAuthError } from '../auth/errors';
import { useAuth } from '../auth/AuthProvider';
import { hasErrors, validateCredentials, type CredentialErrors } from '../auth/validation';
import { Button } from '../ui/Button';
import { Notice } from '../ui/Notice';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { TextField } from '../ui/TextField';
import { BackendNotConfiguredNotice } from './BackendNotConfiguredNotice';

type Mode = 'sign-in' | 'sign-up';

const COPY: Record<Mode, { title: string; action: string; switchLabel: string }> = {
  'sign-in': { title: 'Sign in', action: 'Sign in', switchLabel: 'New here? Create an account' },
  'sign-up': { title: 'Create account', action: 'Create account', switchLabel: 'Have an account? Sign in' },
};

export function AuthForm({ mode, onSwitchMode }: { mode: Mode; onSwitchMode: () => void }) {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<CredentialErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const copy = COPY[mode];

  async function submit() {
    setFormError(null);
    setInfo(null);
    const errors = validateCredentials(email, password);
    setFieldErrors(errors);
    if (hasErrors(errors)) return;

    setSubmitting(true);
    try {
      if (mode === 'sign-in') {
        await auth.signIn(email, password);
      } else {
        const result = await auth.signUp(email, password);
        if (result.needsEmailConfirmation) {
          setInfo('Check your email for a link to confirm your account, then sign in.');
        }
      }
    } catch (error) {
      setFormError(friendlyAuthError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen centered>
      <Text variant="title">{copy.title}</Text>
      {!auth.configured ? <BackendNotConfiguredNotice /> : null}
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={fieldErrors.email}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={fieldErrors.password}
        secureTextEntry
        autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
        textContentType={mode === 'sign-in' ? 'password' : 'newPassword'}
        onSubmitEditing={submit}
      />
      {formError ? <Notice tone="error" title={formError} /> : null}
      {info ? <Notice title={info} /> : null}
      <Button title={copy.action} onPress={submit} loading={submitting} disabled={!auth.configured} />
      <Button title={copy.switchLabel} onPress={onSwitchMode} variant="secondary" />
    </Screen>
  );
}

export function SignInScreen({ onGoToSignUp }: { onGoToSignUp: () => void }) {
  return <AuthForm mode="sign-in" onSwitchMode={onGoToSignUp} />;
}

export function SignUpScreen({ onGoToSignIn }: { onGoToSignIn: () => void }) {
  return <AuthForm mode="sign-up" onSwitchMode={onGoToSignIn} />;
}
