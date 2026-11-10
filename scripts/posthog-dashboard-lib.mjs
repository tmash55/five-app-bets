// Builds the launch-gate dashboard for one app. Pure functions here; the
// network calls live in posthog-dashboard.mjs.
//
// Event names must match packages/shell/src/analytics/events.ts and
// packages/shell/src/onboarding/events.ts.

export const EVENTS = {
  firstOpen: 'app_first_opened',
  appOpened: 'app_opened',
  onboardingCompleted: 'onboarding_completed',
  trialStarted: 'trial_started',
  // Sent by RevenueCat's PostHog integration, not by the app.
  trialConverted: 'rc_trial_converted_event',
};

export const GATES = [
  { key: 'onboarding', label: 'Finish onboarding', target: 0.6 },
  { key: 'trial', label: 'Start a trial', target: 0.08 },
  { key: 'conversion', label: 'Trials convert', target: 0.3 },
  { key: 'return', label: 'Return next day', target: 0.35 },
];

export function dashboardName(app) {
  return `Launch gates: ${app}`;
}

function appFilter(app) {
  return [{ key: 'app', value: [app], operator: 'exact', type: 'event' }];
}

function eventNode(event) {
  return { kind: 'EventsNode', event, name: event };
}

function funnel(app, steps, windowDays) {
  return {
    kind: 'InsightVizNode',
    source: {
      kind: 'FunnelsQuery',
      series: steps.map(eventNode),
      dateRange: { date_from: '-30d' },
      properties: appFilter(app),
      funnelsFilter: {
        funnelVizType: 'steps',
        funnelOrderType: 'ordered',
        funnelWindowInterval: windowDays,
        funnelWindowIntervalUnit: 'day',
      },
    },
  };
}

function retention(app) {
  return {
    kind: 'InsightVizNode',
    source: {
      kind: 'RetentionQuery',
      dateRange: { date_from: '-30d' },
      properties: appFilter(app),
      retentionFilter: {
        period: 'Day',
        totalIntervals: 8,
        retentionType: 'retention_first_time',
        targetEntity: { id: EVENTS.firstOpen, name: EVENTS.firstOpen, type: 'events' },
        returningEntity: { id: EVENTS.appOpened, name: EVENTS.appOpened, type: 'events' },
      },
    },
  };
}

function percent(n) {
  return `${Math.round(n * 100)}%`;
}

/** The four insights, in dashboard order. */
export function gateInsights(app) {
  if (!app || typeof app !== 'string') throw new Error('An app slug is required.');
  const [onboarding, trial, conversion, ret] = GATES;
  return [
    {
      name: `${app}: ${onboarding.label} (target ${percent(onboarding.target)})`,
      description: `Installs that finish the onboarding quiz. Read the last step's conversion. Gate: ${percent(onboarding.target)}.`,
      query: funnel(app, [EVENTS.firstOpen, EVENTS.onboardingCompleted], 7),
    },
    {
      name: `${app}: ${trial.label} (target ${percent(trial.target)})`,
      description: `Installs that start a free trial within 14 days. Gate: ${percent(trial.target)}.`,
      query: funnel(app, [EVENTS.firstOpen, EVENTS.trialStarted], 14),
    },
    {
      name: `${app}: ${conversion.label} (target ${percent(conversion.target)})`,
      description: `Trials that become paid, from RevenueCat's ${EVENTS.trialConverted}. Needs the RevenueCat PostHog integration. Gate: ${percent(conversion.target)}.`,
      query: funnel(app, [EVENTS.trialStarted, EVENTS.trialConverted], 35),
    },
    {
      name: `${app}: ${ret.label} (target ${percent(ret.target)})`,
      description: `New installs that open the app again the next day. Read the Day 1 column. Gate: ${percent(ret.target)}.`,
      query: retention(app),
    },
  ];
}

/**
 * Decides which insights to create and which to update, by name, so running
 * the script again fixes a dashboard instead of duplicating it.
 */
export function planInsights(app, existing) {
  const byName = new Map(existing.map((insight) => [insight.name, insight]));
  return gateInsights(app).map((spec) => {
    const found = byName.get(spec.name);
    return found ? { action: 'update', id: found.id, spec } : { action: 'create', spec };
  });
}
