import { friendlyAuthError } from '../auth/errors';
import { hasErrors, validateCredentials } from '../auth/validation';

describe('validateCredentials', () => {
  it('accepts a valid email and long enough password', () => {
    expect(hasErrors(validateCredentials(' fan@example.com ', 'longenough'))).toBe(false);
  });

  it('flags a bad email and a short password', () => {
    const errors = validateCredentials('not-an-email', 'short');
    expect(errors.email).toBeDefined();
    expect(errors.password).toBeDefined();
  });
});

describe('friendlyAuthError', () => {
  it('rewrites known Supabase messages', () => {
    expect(friendlyAuthError(new Error('Invalid login credentials'))).toBe(
      'That email and password do not match.',
    );
  });

  it('falls back to the original message', () => {
    expect(friendlyAuthError(new Error('Rate limit hit'))).toBe('Rate limit hit');
  });
});
