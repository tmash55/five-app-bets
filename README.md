# Five App Bets

Monorepo for the apps in the Linear project "Five App Bets". Every shell-based
app (Called It, Keen, QuizForge, Little Hoppers) starts from the shared shell.

## Layout

| Path | What it is |
| --- | --- |
| `packages/shell` | Shared code: theme tokens, Supabase accounts, RevenueCat restore, sign-in and settings screens. |
| `packages/game` | Shared game framework: timer, scoring, adaptive difficulty, start/pause/results screens. See its README. |
| `apps/template` | A blank Expo app built on the shell. New apps are copied from it. |
| `scripts/new-app.mjs` | Spins up a new app from the template. |

Stack: React Native (Expo SDK 58, Expo Router), TypeScript, Supabase, RevenueCat, PostHog.

## Run the template

```bash
npm install
cp apps/template/.env.example apps/template/.env.local   # fill in keys
cd apps/template
npx expo start            # press i for iOS, a for Android
```

Without Supabase keys the app still starts and the sign-in screen says that
accounts are not connected. Without RevenueCat keys, "Restore purchases" in
Settings is disabled. RevenueCat needs a development build
(`npx expo run:ios` / `npx expo run:android` or EAS); Expo Go runs it in
preview mode only.

## Start a new app

```bash
npm run new-app -- --name "Called It" --bundle-id bet.unjuiced.calledit
npm install
```

This creates `apps/called-it` with its own name, slug, scheme, bundle ID,
Android package and `.env.local`. Pass `--supabase-url` and
`--supabase-anon-key` to fill in its backend, or edit `.env.local` later.
Each app gets its own Supabase project. After creating it:

```bash
cd apps/called-it
npx supabase link --project-ref <ref>
npx supabase functions deploy delete-account
```

## Rules

- Colors, fonts and spacing come from `useTheme()`; raw colors live only in
  `packages/shell/src/theme/palette.json`. A test fails if a hex color shows
  up anywhere else in the shell.
- Before calling work done: `npm run typecheck`, `npm run lint`, `npm test`.
