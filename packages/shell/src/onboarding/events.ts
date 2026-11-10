/** Every event the onboarding quiz fires, in the order a user meets them. */
export const QUIZ_EVENTS = {
  /** Intro screen shown. Only when the config has an intro. */
  introViewed: 'onboarding_intro_viewed',
  /** User started the quiz (tapped the intro button, or opened a quiz with no intro). */
  started: 'onboarding_started',
  questionViewed: 'onboarding_question_viewed',
  /** User tapped Next with an answer. Carries the answer. */
  questionAnswered: 'onboarding_question_answered',
  /** User went back a question. */
  back: 'onboarding_back',
  /** Last question answered. */
  completed: 'onboarding_completed',
  resultViewed: 'onboarding_result_viewed',
  /** User tapped the result button that opens the paywall. */
  paywallHandoff: 'onboarding_paywall_handoff',
  /** Quiz left before reaching the result. */
  abandoned: 'onboarding_abandoned',
} as const;

export type QuizEventName = (typeof QUIZ_EVENTS)[keyof typeof QUIZ_EVENTS];
