# @five/game

The game framework shared by Keen, QuizForge and Little Hoppers. It owns the
round timer, the "3, 2, 1" countdown, pause, scoring, adaptive difficulty and
the start, pause and results screens. A game is one self-contained module.

## Write a game

```tsx
import type { BoardProps, GameModule } from '@five/game';

type Q = { a: number; b: number };
type A = number;

function Board({ question, onAnswer }: BoardProps<Q, A>) {
  // Draw the question with shell components and useTheme(); call onAnswer once.
}

export const quickSum: GameModule<Q, A> = {
  id: 'quick-sum',
  title: 'Quick Sum',
  instructions: 'Add the two numbers.',
  levels: 5,
  round: { durationMs: 60_000 },            // or { questions: 10 }, or both
  targetResponseMs: (level) => 2500 - level * 200,
  createQuestion: (level, rng) => ({ a: rng.int(1, level * 10), b: rng.int(1, level * 10) }),
  isCorrect: (q, answer) => q.a + q.b === answer,
  Board,
};
```

Then put it on a route:

```tsx
import { GameRunner } from '@five/game';
import { router } from 'expo-router';

export default function QuickSumScreen() {
  return <GameRunner game={quickSum} onExit={() => router.back()} onFinish={(summary) => save(summary)} />;
}
```

Only use the `rng` passed to `createQuestion` for randomness, so a round can be
replayed from its seed.

## How it works

| Part | File | Rule |
| --- | --- | --- |
| Timer | `core/clock.ts` | Pausable stopwatch as data. Paused time never counts, and the round pauses itself when the app leaves the foreground. |
| Round | `core/session.ts` | Pure reducer: ready, countdown, playing, paused, results. Ends on `durationMs`, `questions`, or whichever comes first. `questionTimeLimitMs` makes each question time out as a miss. |
| Scoring | `core/scoring.ts` | Correct answer: 100 points plus up to 50 for speed (full at 0 ms, none at the level's target time). Both scale by +25% per level. Wrong: 0, or `wrongPenalty`. |
| Difficulty | `core/difficulty.ts` | Staircase. After 4 answers at a level: up if at least 75% right and the average right answer beat the target time; down if under 50% right. Two misses in a row drop a level at once. |
| Screens | `ui/` | Start, countdown, HUD (score, time bar, level, pause), pause and results. Colors, fonts and spacing come from the shell theme. |

Games can override the numbers with `scoring` and `difficulty` on the module.

`example/biggerNumber.tsx` is a throwaway test game used by the tests. It is
not a Keen game.
