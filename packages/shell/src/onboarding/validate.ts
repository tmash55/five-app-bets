import type { QuizConfig, QuizQuestion } from './types';

export const MIN_QUESTIONS = 8;
export const MAX_QUESTIONS = 15;

function questionErrors(q: QuizQuestion, where: string): string[] {
  const errors: string[] = [];
  if (!q.title.trim()) errors.push(`${where} has no title.`);

  if (q.type === 'single' || q.type === 'multiple') {
    if (q.options.length < 2) errors.push(`${where} needs at least 2 options.`);
    const ids = new Set<string>();
    for (const option of q.options) {
      if (!option.id) errors.push(`${where} has an option with no id.`);
      if (ids.has(option.id)) errors.push(`${where} repeats option id "${option.id}".`);
      ids.add(option.id);
    }
  }

  if (q.type === 'multiple') {
    const min = q.minSelections ?? 1;
    const max = q.maxSelections ?? q.options.length;
    if (min < 0) errors.push(`${where} minSelections cannot be negative.`);
    if (max < 1 || max > q.options.length) {
      errors.push(`${where} maxSelections must be between 1 and the number of options.`);
    }
    if (min > max) errors.push(`${where} minSelections is larger than maxSelections.`);
  }

  if (q.type === 'slider') {
    const step = q.step ?? 1;
    if (!(q.max > q.min)) errors.push(`${where} max must be greater than min.`);
    if (!(step > 0)) errors.push(`${where} step must be greater than 0.`);
    else if (!isOnStep(q.max, q.min, step)) {
      errors.push(`${where} (max - min) must be a whole number of steps.`);
    }
    if (q.defaultValue !== undefined) {
      if (q.defaultValue < q.min || q.defaultValue > q.max) {
        errors.push(`${where} defaultValue is outside min and max.`);
      } else if (step > 0 && !isOnStep(q.defaultValue, q.min, step)) {
        errors.push(`${where} defaultValue is not on a step.`);
      }
    }
  }
  return errors;
}

function isOnStep(value: number, min: number, step: number): boolean {
  const steps = (value - min) / step;
  return Math.abs(steps - Math.round(steps)) < 1e-9;
}

/** Returns every problem with a quiz config, or an empty list when it is valid. */
export function validateQuizConfig(config: QuizConfig): string[] {
  const errors: string[] = [];
  if (!config.id) errors.push('Quiz has no id.');

  const count = config.questions.length;
  if (count < MIN_QUESTIONS || count > MAX_QUESTIONS) {
    errors.push(`Quiz has ${count} questions; it needs ${MIN_QUESTIONS} to ${MAX_QUESTIONS}.`);
  }

  const byId = new Map<string, QuizQuestion>();
  config.questions.forEach((q, index) => {
    const where = `Question ${index + 1} ("${q.id}")`;
    if (!q.id) errors.push(`Question ${index + 1} has no id.`);
    if (byId.has(q.id)) errors.push(`${where} repeats an id.`);
    byId.set(q.id, q);
    errors.push(...questionErrors(q, where));
  });

  const checkRef = (questionId: string, where: string) => {
    if (!byId.has(questionId)) errors.push(`${where} refers to unknown question "${questionId}".`);
  };

  config.result.highlights?.forEach((h, i) => checkRef(h.question, `Result highlight ${i + 1}`));
  config.result.variants?.forEach((variant, i) => {
    if (variant.when.length === 0) errors.push(`Result variant ${i + 1} has no conditions.`);
    variant.when.forEach((condition) => {
      const where = `Result variant ${i + 1}`;
      checkRef(condition.question, where);
      const q = byId.get(condition.question);
      if (!q) return;
      const optionId = condition.equals ?? condition.includes;
      if (
        optionId !== undefined &&
        q.type !== 'slider' &&
        !q.options.some((o) => o.id === optionId)
      ) {
        errors.push(`${where} refers to unknown option "${optionId}" on "${q.id}".`);
      }
    });
  });

  const placeholders = `${config.result.title} ${config.result.body} ${(
    config.result.variants ?? []
  )
    .map((v) => `${v.title ?? ''} ${v.body ?? ''}`)
    .join(' ')}`;
  for (const match of placeholders.matchAll(/\{\{\s*([\w-]+)\s*\}\}/g)) {
    checkRef(match[1], 'Result text');
  }

  return errors;
}

/** Throws with every problem listed when the config is invalid. */
export function assertValidQuizConfig(config: QuizConfig): void {
  const errors = validateQuizConfig(config);
  if (errors.length > 0) {
    throw new Error(`Invalid onboarding quiz "${config.id}":\n- ${errors.join('\n- ')}`);
  }
}
