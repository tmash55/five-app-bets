import { Redirect } from 'expo-router';

/**
 * Signed-out users can't reach "/" ((tabs)/index is protected), so a cold
 * launch at "/" lands here and goes to sign-in instead of "Unmatched Route".
 */
export default function AuthIndex() {
  return <Redirect href="/sign-in" />;
}
