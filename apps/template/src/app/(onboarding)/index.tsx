import { OnboardingQuiz, useOnboarding } from '@five/shell';
import { router } from 'expo-router';

import { onboardingQuiz } from '@/onboarding/quiz';

/** Renders the quiz from config and hands off to the paywall. */
export default function OnboardingQuizRoute() {
  const { saveAnswers } = useOnboarding();
  return (
    <OnboardingQuiz
      config={onboardingQuiz}
      onComplete={(answers) => {
        saveAnswers(answers).catch(() => undefined);
        router.push('/paywall');
      }}
    />
  );
}
