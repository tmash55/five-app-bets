/** Turns an auth or network error into a sentence a user can act on. */
export function friendlyAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials')) return 'That email and password do not match.';
  if (lower.includes('email not confirmed')) return 'Confirm your email first, then sign in.';
  if (lower.includes('already registered')) return 'An account with that email already exists. Sign in instead.';
  if (lower.includes('network') || lower.includes('fetch')) return 'Could not reach the server. Check your connection.';
  return message || 'Something went wrong. Try again.';
}
