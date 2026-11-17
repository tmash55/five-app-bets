import { SignInScreen } from '@five/shell';
import { router } from 'expo-router';

export default function SignIn() {
  return <SignInScreen onGoToSignUp={() => router.replace('/sign-up')} />;
}
