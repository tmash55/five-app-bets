# Five App Bets

Monorepo for the apps in the Linear project "Five App Bets". Every shell-based
app (Called It, Keen, QuizForge, Little Hoppers) starts from the shared shell.

## Layout

| Path | What it is |
| --- | --- |
| `packages/shell` | Shared code: theme tokens, Supabase accounts, RevenueCat restore, sign-in and settings screens. |
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

## Streaks, reminders and push

Every app gets the habit loop from the shell (UNJ-1418):

- `useStreak()` gives the current streak, today's status and `recordActivity()`. Call it when the user finishes the app's daily action. Streak freezes are off unless `apps/<app>/src/habits/config.ts` sets `maxFreezes`; the app decides when to call `grantFreezes()`.
- `<PushPermissionPrompt />` is a soft prompt before the system dialog. Render it at the moment the app chooses.
- The daily reminder is scheduled on the device at the time the user picks in Settings. Today's reminder is skipped once the user has played.
- Server pushes: apply `supabase/migrations`, deploy `send-push`, then POST `{ user_ids, title, body, data: { url } }` to it with the service role key. Tapping a push opens `data.url`.
- Device pushes need `EAS_PROJECT_ID` (and `GOOGLE_SERVICES_JSON` for Android) in `.env.local` or EAS, plus APNs and FCM credentials in the Expo account. Push tokens cannot be fetched on simulators.

## Rules

- Colors, fonts and spacing come from `useTheme()`; raw colors live only in
  `packages/shell/src/theme/palette.json`. A test fails if a hex color shows
  up anywhere else in the shell.
- Before calling work done: `npm run typecheck`, `npm run lint`, `npm test`.
