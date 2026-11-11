# Five App Bets

Monorepo for the apps in the Linear project "Five App Bets". Every shell-based
app (Called It, Keen, QuizForge, Little Hoppers) starts from the shared shell.

## Layout

| Path | What it is |
| --- | --- |
| `packages/shell` | Shared code: theme tokens, Supabase accounts, RevenueCat restore, sign-in and settings screens, onboarding quiz. |
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

## Onboarding quiz

New users see the onboarding quiz, then the paywall, then sign up. Each app
defines its quiz in one file, `apps/<app>/src/onboarding/quiz.ts`; the screens
come from `OnboardingQuiz` in the shell and need no code per app.

- 8 to 15 questions. Types: `single`, `multiple` (optional `minSelections` /
  `maxSelections`) and `slider` (`min`, `max`, `step`, `unit`).
- The result screen fills `{{questionId}}` placeholders with the user's
  answers, and the first matching `variants` entry swaps in its own copy.
- The config is checked in development and by a test; a bad config throws with
  a list of what is wrong.
- Give each app's quiz its own `id`, and bump `version` when questions change.
- Every step fires an event (`QUIZ_EVENTS` in
  `packages/shell/src/onboarding/events.ts`) through `useAnalytics()`, which
  sends them to PostHog (see Event tracking below).
- The result button saves the answers (`useOnboarding().answers`) and opens
  `/paywall`. That screen is a placeholder until the paywall work (UNJ-1417);
  it calls `markComplete()` to finish onboarding.

## Event tracking

Every app reports the same funnel to PostHog so one dashboard layout reads the
launch gates for any app.

- Set `EXPO_PUBLIC_POSTHOG_KEY` (and `EXPO_PUBLIC_POSTHOG_HOST` for EU cloud)
  in `apps/<app>/.env.local`. Without a key, events print to the dev console
  and nothing is sent.
- `ShellProviders analytics={{ appId }}` tags every event with `app` (the slug
  from `app.identity.json`). Fire your own events with `useAnalytics().track`.
- Funnel events (`FUNNEL_EVENTS` in `packages/shell/src/analytics/events.ts`):
  `app_first_opened`, `app_opened` (first foreground each local day),
  `paywall_viewed`, `trial_started`, `purchase_completed`, plus the onboarding
  quiz events. The paywall calls `trackPurchase(track, { productId,
  periodType })` after a purchase.
- Trial conversions come from RevenueCat's PostHog integration
  (`rc_trial_converted_event`), because they happen while the app is closed.
  The shell sets RevenueCat's `$posthogUserId` attribute so they land on the
  same person. Turn the integration on in RevenueCat for each app.
- Signing in calls `identify(userId)` with the Supabase user id; signing out
  resets to a new anonymous id.
- Kids' areas: wrap them in `<TrackingOff>`. While one is on screen nothing
  goes to PostHog and the SDK is opted out. For a kids-only app pass
  `analytics={{ thirdPartyTracking: false }}`; the PostHog SDK is then never
  loaded.
- Dashboard: `POSTHOG_PERSONAL_API_KEY=... POSTHOG_PROJECT_ID=...
  node scripts/posthog-dashboard.mjs --app <slug>` creates or updates
  "Launch gates: <slug>" with the four gates (60% finish onboarding, 8% start
  a trial, 30% of trials convert, 35% return next day). Safe to run again.

## Rules

- Colors, fonts and spacing come from `useTheme()`; raw colors live only in
  `packages/shell/src/theme/palette.json`. A test fails if a hex color shows
  up anywhere else in the shell.
- Before calling work done: `npm run typecheck`, `npm run lint`, `npm test`.
