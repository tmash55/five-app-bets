import { SignUpScreen } from '@five/shell';
import { router } from 'expo-router';

export default function SignUp() {
  return <SignUpScreen onGoToSignIn={() => router.replace('/sign-in')} />;
}
