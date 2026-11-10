import type {
  AnswerCondition,
  AnswerValue,
  QuizAnswers,
  QuizConfig,
  QuizQuestion,
  ResolvedResult,
  SliderQuestion,
} from './types';

export function sliderStep(q: SliderQuestion): number {
  return q.step ?? 1;
}

/** Snaps a value to the slider's range and step. */
export function snapSliderValue(q: SliderQuestion, value: number): number {
  const step = sliderStep(q);
  const clamped = Math.min(q.max, Math.max(q.min, value));
  const snapped = q.min + Math.round((clamped - q.min) / step) * step;
  // Avoid float noise such as 0.30000000000000004.
  return Number(Math.min(q.max, snapped).toFixed(10));
}

export function defaultSliderValue(q: SliderQuestion): number {
  if (q.defaultValue !== undefined) return snapSliderValue(q, q.defaultValue);
  return snapSliderValue(q, (q.min + q.max) / 2);
}

/** Whether the answer lets the user move on from this question. */
export function isAnswerComplete(q: QuizQuestion, answer: AnswerValue | undefined): boolean {
  if (answer === undefined) return false;
  switch (q.type) {
    case 'single':
      return typeof answer === 'string' && q.options.some((o) => o.id === answer);
    case 'multiple': {
      if (!Array.isArray(answer)) return false;
      const min = q.minSelections ?? 1;
      const max = q.maxSelections ?? q.options.length;
      return answer.length >= min && answer.length <= max;
    }
    case 'slider':
      return typeof answer === 'number' && answer >= q.min && answer <= q.max;
  }
}

/** Toggles an option in a multiple-choice answer, respecting maxSelections. */
export function toggleMultiple(
  q: QuizQuestion & { type: 'multiple' },
  current: AnswerValue | undefined,
  optionId: string,
): string[] {
  const selected = Array.isArray(current) ? current : [];
  if (selected.includes(optionId)) return selected.filter((id) => id !== optionId);
  const max = q.maxSelections ?? q.options.length;
  if (max === 1) return [optionId];
  if (selected.length >= max) return selected;
  // Keep config order so answers are stable for analytics.
  return q.options.map((o) => o.id).filter((id) => id === optionId || selected.includes(id));
}

/** The answer as text, using option labels and the slider unit. */
export function formatAnswer(q: QuizQuestion, answer: AnswerValue | undefined): string {
  if (answer === undefined) return '';
  if (q.type === 'slider') {
    return typeof answer === 'number' ? `${answer}${q.unit ? ` ${q.unit}` : ''}` : '';
  }
  const ids = Array.isArray(answer) ? answer : [String(answer)];
  const labels = ids.map((id) => q.options.find((o) => o.id === id)?.label ?? id);
  if (labels.length <= 2) return labels.join(' and ');
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

export function conditionHolds(condition: AnswerCondition, answers: QuizAnswers): boolean {
  const answer = answers[condition.question];
  if (answer === undefined) return false;
  if (condition.equals !== undefined && answer !== condition.equals) return false;
  if (condition.includes !== undefined) {
    const ids = Array.isArray(answer) ? answer : [answer];
    if (!ids.includes(condition.includes)) return false;
  }
  if (condition.gte !== undefined && !(typeof answer === 'number' && answer >= condition.gte)) {
    return false;
  }
  if (condition.lte !== undefined && !(typeof answer === 'number' && answer <= condition.lte)) {
    return false;
  }
  return true;
}

function fill(template: string, config: QuizConfig, answers: QuizAnswers): string {
  return template.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (whole, id: string) => {
    const q = config.questions.find((question) => question.id === id);
    return q ? formatAnswer(q, answers[id]) : whole;
  });
}

/** Builds the personalized result screen copy from the user's answers. */
export function resolveResult(config: QuizConfig, answers: QuizAnswers): ResolvedResult {
  const { result } = config;
  const variantIndex = result.variants?.findIndex((v) =>
    v.when.every((c) => conditionHolds(c, answers)),
  );
  const variant =
    variantIndex !== undefined && variantIndex >= 0 ? result.variants![variantIndex] : undefined;

  return {
    title: fill(variant?.title ?? result.title, config, answers),
    body: fill(variant?.body ?? result.body, config, answers),
    highlights: (result.highlights ?? []).flatMap((h) => {
      const q = config.questions.find((question) => question.id === h.question);
      const value = q ? formatAnswer(q, answers[h.question]) : '';
      return value ? [{ label: h.label, value }] : [];
    }),
    ctaLabel: result.ctaLabel ?? 'Continue',
    variantIndex: variant ? variantIndex! : null,
  };
}
