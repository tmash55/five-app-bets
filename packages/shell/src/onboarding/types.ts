/**
 * An onboarding quiz is described entirely by a `QuizConfig`. Each app writes
 * one config file (see apps/template/src/onboarding/quiz.ts) and renders
 * `<OnboardingQuiz config={...} />`; no screen code is written per app.
 */

export type ChoiceOption = {
  /** Stable id stored in answers and sent with events. */
  id: string;
  label: string;
  description?: string;
};

type QuestionBase = {
  /** Stable id stored in answers and sent with events. Must be unique. */
  id: string;
  title: string;
  subtitle?: string;
};

export type SingleChoiceQuestion = QuestionBase & {
  type: 'single';
  options: ChoiceOption[];
};

export type MultipleChoiceQuestion = QuestionBase & {
  type: 'multiple';
  options: ChoiceOption[];
  /** Fewest options the user must pick. Defaults to 1. */
  minSelections?: number;
  /** Most options the user may pick. Defaults to all of them. */
  maxSelections?: number;
};

export type SliderQuestion = QuestionBase & {
  type: 'slider';
  min: number;
  max: number;
  /** Defaults to 1. */
  step?: number;
  /** Starting value. Defaults to the middle step. */
  defaultValue?: number;
  /** Shown after the value, for example "min" or "games". */
  unit?: string;
  minLabel?: string;
  maxLabel?: string;
};

export type QuizQuestion = SingleChoiceQuestion | MultipleChoiceQuestion | SliderQuestion;
export type QuestionType = QuizQuestion['type'];

export type AnswerValue = string | string[] | number;
export type QuizAnswers = Record<string, AnswerValue>;

/**
 * A condition on one answer. All the keys given must hold.
 * - `equals`: single choice picked this option id.
 * - `includes`: multiple choice includes this option id (or single choice equals it).
 * - `gte` / `lte`: slider value bounds.
 */
export type AnswerCondition = {
  question: string;
  equals?: string;
  includes?: string;
  gte?: number;
  lte?: number;
};

export type ResultVariant = {
  /** Every condition must hold for this variant to be picked. */
  when: AnswerCondition[];
  title?: string;
  body?: string;
};

export type ResultHighlight = {
  label: string;
  /** Question whose answer is shown, formatted with option labels or the slider unit. */
  question: string;
};

/**
 * The result screen. `title` and `body` may use `{{questionId}}` placeholders,
 * which are filled with the user's answer. The first `variants` entry whose
 * conditions all hold replaces the title and/or body.
 */
export type QuizResult = {
  title: string;
  body: string;
  variants?: ResultVariant[];
  highlights?: ResultHighlight[];
  /** Button that hands off to the paywall. Defaults to "Continue". */
  ctaLabel?: string;
};

export type QuizIntro = {
  title: string;
  body?: string;
  /** Defaults to "Get started". */
  ctaLabel?: string;
};

export type QuizConfig = {
  /** Stable id, used in events and as the storage key. */
  id: string;
  /** Bump when questions change so analytics can tell versions apart. */
  version: number;
  intro?: QuizIntro;
  questions: QuizQuestion[];
  result: QuizResult;
};

export type ResolvedResult = {
  title: string;
  body: string;
  highlights: { label: string; value: string }[];
  ctaLabel: string;
  /** Index into `result.variants`, or null when the default copy was used. */
  variantIndex: number | null;
};
