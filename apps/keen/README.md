# Keen

Short daily brain games, built on the shell template (`@five/shell`) and the
game framework (`@five/game`).

| Game | File | Skill | How a level gets harder |
| --- | --- | --- | --- |
| Pairs | `src/games/pairs.tsx` | Memory | Grid grows from 2×2 to 4×6. One cleared grid is one answer; too many misses loses it. |
| Quick Sum | `src/games/quickSum.tsx` | Math | More numbers, bigger numbers, subtraction from level 4, faster flashes. Pick the total from four. |

Each round is 60 seconds. The framework owns the timer, scoring, adaptive
difficulty and the start, pause and results screens; it reports the round
summary to `onFinish` in `src/app/play/[game].tsx`, which keeps the best score
per game on the device.

To add a game, write a `GameModule` in `src/games` and add it to `KEEN_GAMES`
in `src/games/index.ts`. Wrapping it in `withAnswerFeedback` gives it the right
and wrong sounds and haptics.

Sounds are synthesized by `node scripts/make-sounds.mjs` into `assets/sounds`.
They respect the silent switch; haptics always fire.

The app name and the `bet.unjuiced.keen` bundle ID are placeholders until the
trademark search (UNJ-1412) and store accounts (UNJ-1414) are done.
