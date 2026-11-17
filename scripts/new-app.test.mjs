import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildIdentity, envFileFor, parseArgs, shouldCopy, slugify } from './new-app-lib.mjs';

test('parseArgs reads --key value and --key=value', () => {
  assert.deepEqual(parseArgs(['--name', 'Called It', '--bundle-id=bet.unjuiced.calledit']), {
    name: 'Called It',
    'bundle-id': 'bet.unjuiced.calledit',
  });
});

test('parseArgs rejects a flag with no value', () => {
  assert.throws(() => parseArgs(['--name']), /Missing value for --name/);
});

test('slugify makes a dashed lowercase slug', () => {
  assert.equal(slugify('Little Hoppers!'), 'little-hoppers');
});

test('buildIdentity fills slug, scheme and android package from name and bundle id', () => {
  assert.deepEqual(buildIdentity({ name: 'Called It', 'bundle-id': 'bet.unjuiced.calledit' }), {
    name: 'Called It',
    slug: 'called-it',
    scheme: 'calledit',
    iosBundleIdentifier: 'bet.unjuiced.calledit',
    androidPackage: 'bet.unjuiced.calledit',
  });
});

test('buildIdentity reports every missing or invalid field', () => {
  assert.throws(
    () => buildIdentity({ 'bundle-id': 'not a bundle' }),
    (error) => error.validation.length === 3,
  );
});

test('shouldCopy skips build output and local env files but keeps the example', () => {
  assert.equal(shouldCopy('node_modules'), false);
  assert.equal(shouldCopy('.env.local'), false);
  assert.equal(shouldCopy('.env.example'), true);
  assert.equal(shouldCopy('src'), true);
});

test('envFileFor writes all four keys, blank when not given', () => {
  const env = envFileFor({ 'supabase-url': 'https://x.supabase.co' });
  assert.match(env, /^EXPO_PUBLIC_SUPABASE_URL=https:\/\/x\.supabase\.co$/m);
  assert.match(env, /^EXPO_PUBLIC_SUPABASE_ANON_KEY=$/m);
});
