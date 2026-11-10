// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Edge Function entry points run on Deno; the shared slate code is linted.
    ignores: ['dist/*', 'supabase/functions/*/index.ts'],
  },
]);
