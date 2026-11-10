import { useCallback, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAnalytics, type EventProperties } from '../analytics/AnalyticsProvider';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from '../ui/Button';
import { Text } from '../ui/Text';
import { isAnswerComplete, resolveResult, toggleMultiple } from './answers';
import { QUIZ_EVENTS } from './events';
import { OptionCard } from './OptionCard';
import { ProgressBar } from './ProgressBar';
import { initialQuizState, quizProgress, quizReducer, type QuizStep } from './quizState';
import { QuizSlider } from './QuizSlider';
import type { QuizAnswers, QuizConfig, QuizQuestion, ResolvedResult } from './types';
import { assertValidQuizConfig } from './validate';

export type OnboardingQuizProps = {
  config: QuizConfig;
  /**
   * Called when the user taps the result button. Hand off to the paywall here,
   * for example by saving the answers and routing to the paywall screen.
   */
  onComplete: (answers: QuizAnswers, result: ResolvedResult) => void;
};

function stepKey(step: QuizStep): string {
  return step.kind === 'question' ? `question-${step.index}` : step.kind;
}

/**
 * The whole onboarding quiz: intro, questions, progress, result and the
 * paywall handoff, all driven by `config`. Fires an analytics event at every
 * step (see QUIZ_EVENTS).
 */
export function OnboardingQuiz({ config, onComplete }: OnboardingQuizProps) {
  if (__DEV__) assertValidQuizConfig(config);

  const theme = useTheme();
  const { track } = useAnalytics();
  const reducer = useMemo(() => quizReducer(config), [config]);
  const [state, dispatch] = useReducer(reducer, config, initialQuizState);
  const { step, answers } = state;
  const result = useMemo(
    () => (step.kind === 'result' ? resolveResult(config, answers) : null),
    [step.kind, config, answers],
  );

  const base = useMemo<EventProperties>(
    () => ({
      quiz_id: config.id,
      quiz_version: config.version,
      question_count: config.questions.length,
    }),
    [config],
  );
  const questionProps = useCallback(
    (index: number): EventProperties => {
      const q = config.questions[index];
      return { ...base, question_id: q.id, question_number: index + 1, question_type: q.type };
    },
    [base, config],
  );

  // Fire one "viewed" event each time a step is shown.
  const startedAt = useRef<number | null>(null);
  const reachedResult = useRef(false);
  const lastStep = useRef(step);
  const key = stepKey(step);
  useEffect(() => {
    lastStep.current = step;
    if (step.kind === 'intro') {
      track(QUIZ_EVENTS.introViewed, base);
    } else if (step.kind === 'question') {
      if (startedAt.current === null) {
        startedAt.current = Date.now();
        track(QUIZ_EVENTS.started, base);
      }
      track(QUIZ_EVENTS.questionViewed, questionProps(step.index));
    } else if (result) {
      track(QUIZ_EVENTS.resultViewed, {
        ...base,
        result_variant: result.variantIndex,
      });
    }
    // Only when the step changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Report users who leave before the result.
  useEffect(
    () => () => {
      if (reachedResult.current) return;
      const last = lastStep.current;
      track(QUIZ_EVENTS.abandoned, {
        ...base,
        last_step: last.kind,
        ...(last.kind === 'question' ? questionProps(last.index) : {}),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const next = () => {
    if (step.kind !== 'question') return;
    const q = config.questions[step.index];
    track(QUIZ_EVENTS.questionAnswered, {
      ...questionProps(step.index),
      answer: answers[q.id] ?? null,
    });
    if (step.index === config.questions.length - 1) {
      reachedResult.current = true;
      track(QUIZ_EVENTS.completed, {
        ...base,
        duration_ms: startedAt.current === null ? null : Date.now() - startedAt.current,
      });
    }
    dispatch({ type: 'next' });
  };

  const back = () => {
    if (step.kind === 'question') {
      track(QUIZ_EVENTS.back, questionProps(step.index));
    } else if (step.kind === 'result') {
      track(QUIZ_EVENTS.back, { ...base, from: 'result' });
    }
    dispatch({ type: 'back' });
  };

  const handoff = () => {
    if (!result) return;
    track(QUIZ_EVENTS.paywallHandoff, { ...base, result_variant: result.variantIndex });
    onComplete(answers, result);
  };

  const canGoBack =
    step.kind === 'result' ||
    (step.kind === 'question' && (step.index > 0 || Boolean(config.intro)));

  if (step.kind === 'intro' && config.intro) {
    const intro = config.intro;
    return (
      <QuizFrame
        footer={
          <Button
            title={intro.ctaLabel ?? 'Get started'}
            onPress={() => dispatch({ type: 'start' })}
          />
        }>
        <View style={{ flexGrow: 1, justifyContent: 'center', gap: theme.spacing.md }}>
          <Text variant="title" accessibilityRole="header">
            {intro.title}
          </Text>
          {intro.body ? <Text color="textSecondary">{intro.body}</Text> : null}
        </View>
      </QuizFrame>
    );
  }

  if (step.kind === 'result' && result) {
    return (
      <QuizFrame
        header={<QuizHeader progress={1} label="Quiz complete" onBack={back} canGoBack />}
        footer={<Button title={result.ctaLabel} onPress={handoff} />}>
        <Text variant="title" accessibilityRole="header">
          {result.title}
        </Text>
        <Text color="textSecondary">{result.body}</Text>
        {result.highlights.length > 0 ? (
          <View
            style={{
              gap: theme.spacing.sm,
              padding: theme.spacing.md,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.surface,
            }}>
            {result.highlights.map((h) => (
              <View key={h.label} style={{ gap: theme.spacing.xxs }}>
                <Text variant="caption" color="textSecondary">
                  {h.label}
                </Text>
                <Text variant="label">{h.value}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </QuizFrame>
    );
  }

  if (step.kind !== 'question') return null;
  const index = step.index;
  const q = config.questions[index];
  const total = config.questions.length;
  const isLast = index === total - 1;
  return (
    <QuizFrame
      header={
        <QuizHeader
          progress={quizProgress(config, step)}
          label={`Question ${index + 1} of ${total}`}
          onBack={back}
          canGoBack={canGoBack}
        />
      }
      footer={
        <Button
          title={isLast ? 'See my results' : 'Next'}
          onPress={next}
          disabled={!isAnswerComplete(q, answers[q.id])}
        />
      }>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="heading" accessibilityRole="header">
          {q.title}
        </Text>
        {q.subtitle ? <Text color="textSecondary">{q.subtitle}</Text> : null}
        {q.type === 'multiple' ? (
          <Text variant="caption" color="textSecondary">
            {multipleHint(q)}
          </Text>
        ) : null}
      </View>
      <QuestionInput
        key={q.id}
        question={q}
        answers={answers}
        onAnswer={(value) => dispatch({ type: 'answer', questionId: q.id, value })}
      />
    </QuizFrame>
  );
}

function multipleHint(q: QuizQuestion & { type: 'multiple' }): string {
  const min = q.minSelections ?? 1;
  const max = q.maxSelections ?? q.options.length;
  if (max === q.options.length) return min <= 1 ? 'Pick all that apply.' : `Pick at least ${min}.`;
  if (min === max) return `Pick ${max}.`;
  return min <= 1 ? `Pick up to ${max}.` : `Pick ${min} to ${max}.`;
}

function QuestionInput({
  question: q,
  answers,
  onAnswer,
}: {
  question: QuizQuestion;
  answers: QuizAnswers;
  onAnswer: (value: string | string[] | number) => void;
}) {
  const theme = useTheme();
  const answer = answers[q.id];

  if (q.type === 'slider') {
    return (
      <QuizSlider
        question={q}
        value={typeof answer === 'number' ? answer : q.min}
        onChange={onAnswer}
      />
    );
  }

  const selected = Array.isArray(answer) ? answer : typeof answer === 'string' ? [answer] : [];
  const max = q.type === 'multiple' ? (q.maxSelections ?? q.options.length) : 1;
  const full = q.type === 'multiple' && max > 1 && selected.length >= max;
  return (
    <View
      accessibilityRole={q.type === 'single' ? 'radiogroup' : undefined}
      style={{ gap: theme.spacing.sm }}>
      {q.options.map((option) => {
        const isSelected = selected.includes(option.id);
        return (
          <OptionCard
            key={option.id}
            option={option}
            multiple={q.type === 'multiple'}
            selected={isSelected}
            disabled={full && !isSelected}
            onPress={() =>
              onAnswer(q.type === 'multiple' ? toggleMultiple(q, answer, option.id) : option.id)
            }
          />
        );
      })}
    </View>
  );
}

function QuizHeader({
  progress,
  label,
  onBack,
  canGoBack,
}: {
  progress: number;
  label: string;
  onBack: () => void;
  canGoBack: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {canGoBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={theme.spacing.sm}
            onPress={onBack}>
            <Text variant="label" color="primary">
              Back
            </Text>
          </Pressable>
        ) : (
          <View />
        )}
        <Text variant="caption" color="textSecondary">
          {label}
        </Text>
      </View>
      <ProgressBar progress={progress} label={label} />
    </View>
  );
}

function QuizFrame({
  header,
  footer,
  children,
}: {
  header?: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.background }]}>
      {header ? (
        <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md }}>
          {header}
        </View>
      ) : null}
      <ScrollView
        style={styles.fill}
        contentContainerStyle={{ flexGrow: 1, padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        {children}
      </ScrollView>
      <View style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md }}>
        {footer}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
