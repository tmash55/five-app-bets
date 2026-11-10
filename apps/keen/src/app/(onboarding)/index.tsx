import { OnboardingQuiz, useOnboarding } from '@five/shell';
import { router } from 'expo-router';

import { focusSkillsFromAnswers } from '@/onboarding/plan';
import { onboardingQuiz } from '@/onboarding/quiz';
import { saveFocusSkills } from '@/skills/focusSkills';

/** The onboarding quiz. Its answers pick the workout's skills, then the baseline test starts. */
export default function OnboardingQuizRoute() {
  const { saveAnswers } = useOnboarding();
  return (
    <OnboardingQuiz
      config={onboardingQuiz}
      onComplete={(answers) => {
        Promise.all([saveAnswers(answers), saveFocusSkills(focusSkillsFromAnswers(answers))]).catch(
          () => undefined,
        );
        router.push('/baseline');
      }}
    />
  );
}
