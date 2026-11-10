# Keen

Short daily brain games, built on the shell template (`@five/shell`) and the
game framework (`@five/game`).

| Game | File | Skill | How a level gets harder |
| --- | --- | --- | --- |
| Pairs | `src/games/pairs.tsx` | Memory | Grid grows from 2×2 to 4×6. One cleared grid is one answer; too many misses loses it. |
| Quick Sum | `src/games/quickSum.tsx` | Math | More numbers, bigger numbers, subtraction from level 4, faster flashes. Pick the total from four. |
| Odd One Out | `src/games/oddOneOut.tsx` | Focus | Grid grows from 3×3 to 6×6. The odd tile changes shape early on, then only its color, fill or direction. |
| Missing Letter | `src/games/missingLetter.tsx` | Words | Longer words (3 letters up to 10) and more letters to choose from (3 up to 6). Word list in `src/games/words.ts` is a draft awaiting review. |
| Sequence | `src/games/sequence.tsx` | Memory | Four lights. Each pattern you repeat right adds a light (3 up to 12) and plays a little faster; a mistake takes one away. |
| Price Check | `src/games/priceCheck.tsx` | Math | Tips, sale prices and totals. Amounts go from round dollars to any cents, and the four choices move closer together. |

Each round is 60 seconds. The framework owns the timer, scoring, adaptive
difficulty and the start, pause and results screens; it reports the round
summary to `onFinish` in `src/app/play/[game].tsx`, which keeps the best score
per game on the device.

## Daily workout, skill scores and progress

The app opens on **Today** (`src/app/(tabs)/index.tsx`): three games for the
player's skills, about five minutes, then the skill scores with their change
against last week. **Games** lists every game for free play and **Progress**
draws a chart per skill.

- **Skills** (`src/skills/skills.ts`): memory, math, focus, words and speed,
  each scored 0 to 1000. A round is rated 70% on how high the adaptive level
  climbed and 30% on accuracy, for the game's skill; speed is the average speed
  bonus share of the right answers, from every game. Each round moves a score
  30% of the way toward that round's rating; the first round sets it.
- **History** (`src/skills/history.ts`): one snapshot of the scores per day on
  the device (`keen.skills.history`), about a year. "vs. last week" compares
  with the latest snapshot at least seven days old, and shows "New" until there
  is one. Every finished round counts, in the workout or not.
- **Focus skills** (`src/skills/focusSkills.ts`): the skills the player wants
  to train. Onboarding (UNJ-1435) sets them; until then every skill counts.
- **Workout** (`src/workout/workout.ts`): picks one game per focus skill before
  any skill gets a second, rotating daily, and saves the day's picks
  (`keen.workout.YYYY-MM-DD`) so they hold all day. Games opened from Today are
  ticked off when the round finishes.
- **Free tier**: free players get one game a day, the first game of the
  workout; everything else shows as Premium. `usePremium()` in
  `src/workout/premium.ts` is always false until the paywall (UNJ-1417) adds
  the entitlement check. In a development build, `EXPO_PUBLIC_KEEN_DEV_PREMIUM=1`
  unlocks everything for testing.

## Onboarding and the baseline test

New players go through the `(onboarding)` routes before signing up:

1. **Quiz** (`src/onboarding/quiz.ts`, rendered by the shell's
   `OnboardingQuiz`): twelve questions on goals, time available and
   self-rated strengths. Its `focus_skills` answer becomes the workout's focus
   skills (`saveFocusSkills`).
2. **Baseline test** (`src/baseline`): the first two games in `KEEN_GAMES`
   (Pairs, then Quick Sum), 30 seconds each, with no start or results screen
   between. `scoreBaseline` rates each round with the same `rateRound` the
   workout uses; speed is the average of both games. The scores are saved to
   `keen.baseline` and become today's skill snapshot, so the Today and
   Progress tabs start from them.
3. **Plan** (`src/onboarding/plan.ts`): starting scores, a share card
   (captured with `react-native-view-shot` and shared with `expo-sharing`,
   falling back to a text share), and a plan built from the answers and
   scores.
4. **Paywall**: a placeholder until UNJ-1417. It calls `markComplete()`,
   which ends onboarding and sends the player to sign up.

The share card needs a development build: `react-native-view-shot` and
`expo-sharing` are native modules.

To add a game, write a `GameModule` in `src/games` and add it to `KEEN_GAMES`
in `src/games/index.ts`. Wrapping it in `withAnswerFeedback` gives it the right
and wrong sounds and haptics.

Sounds are synthesized by `node scripts/make-sounds.mjs` into `assets/sounds`.
They respect the silent switch; haptics always fire.

The app name and the `bet.unjuiced.keen` bundle ID are placeholders until the
trademark search (UNJ-1412) and store accounts (UNJ-1414) are done.
