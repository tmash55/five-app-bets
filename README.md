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

## Changing an app's look

Each app's whole look comes from one file: `apps/<app>/theme.json`. It holds
light and dark colors, font families, text styles, spacing, corner radius,
border widths, pressed/disabled opacity, and `appearance` (`"system"`,
`"light"` or `"dark"`). Edit it, or replace it with a new file, and every shell
screen (sign in, settings, onboarding, paywall) plus the splash screen and
Android icon background follow.

- Any token you leave out falls back to the shell defaults in
  `packages/shell/src/theme/defaultTheme.json`, so a theme file can be as
  short as a new `primary` color.
- A misspelled token name or a bad value (for example `"primay"` or
  `"text": "red"`) stops the app with a message listing every problem,
  instead of silently using a default.
- Custom fonts: put the `.ttf`/`.otf` files in `apps/<app>/assets/fonts/`,
  list their paths in `fontFiles` (for example
  `"./assets/fonts/Fraunces-Bold.ttf"`), and set `fonts.heading` /
  `fonts.body` to the font's family name. `"system"` means the platform
  font. Fonts are embedded at build time, so rebuild the dev client after
  adding one.
- Splash, icon and `appearance` changes are read at build time too; color,
  font and size changes show up on reload.

## Rules

- Colors, fonts, text sizes, spacing, corner radius, border widths and
  opacity come from `useTheme()`. Raw values live only in theme files. Tests
  fail if a hex color, font size, font family, padding, margin, gap or radius
  is hard-coded anywhere else in the shell.
- Before calling work done: `npm run typecheck`, `npm run lint`, `npm test`.
