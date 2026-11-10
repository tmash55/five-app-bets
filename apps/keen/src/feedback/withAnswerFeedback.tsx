import type { BoardProps, GameModule } from '@five/game';
import { useEffect, useRef, type ComponentType } from 'react';

import { giveFeedback as defaultGiveFeedback, type FeedbackKind } from './feedback';

/**
 * Wraps a game so every answer plays the right or wrong sound and haptic the
 * moment the player answers, before the framework moves to the next question.
 * Answers that time out get the wrong feedback when the next board appears.
 */
export function withAnswerFeedback<Q, A>(
  game: GameModule<Q, A>,
  giveFeedback: (kind: FeedbackKind) => void = defaultGiveFeedback,
): GameModule<Q, A> {
  const Inner: ComponentType<BoardProps<Q, A>> = game.Board;

  function Board(props: BoardProps<Q, A>) {
    const { question, onAnswer, lastFeedback } = props;
    const timedOut = lastFeedback?.timedOut ?? false;
    const feedbackId = lastFeedback?.id;
    useEffect(() => {
      if (timedOut) giveFeedback('wrong');
      // Runs once per board: each question gets a fresh board.
    }, [timedOut, feedbackId]);

    // The framework ignores a second answer to the same question; so do the sounds.
    const answered = useRef(false);
    const answer = (value: A) => {
      if (answered.current) return;
      answered.current = true;
      giveFeedback(game.isCorrect(question, value) ? 'right' : 'wrong');
      onAnswer(value);
    };
    return <Inner {...props} onAnswer={answer} />;
  }
  Board.displayName = `WithFeedback(${game.id})`;

  return { ...game, Board };
}
