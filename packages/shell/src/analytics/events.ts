/**
 * Funnel events every app fires the same way, so one dashboard layout reads
 * the launch gates for any app. Onboarding step events live in
 * ../onboarding/events.ts (QUIZ_EVENTS).
 */
export const FUNNEL_EVENTS = {
  /** First launch after install. Fires once per install. */
  appFirstOpened: 'app_first_opened',
  /** First time the app comes to the foreground on a calendar day (device time). */
  appOpened: 'app_opened',
  /** Paywall shown. Carries `source` (where it was opened from). */
  paywallViewed: 'paywall_viewed',
  /** Store purchase that began a free trial. */
  trialStarted: 'trial_started',
  /** Store purchase that charged the user straight away (no trial). */
  purchaseCompleted: 'purchase_completed',
} as const;

export type FunnelEventName = (typeof FUNNEL_EVENTS)[keyof typeof FUNNEL_EVENTS];

/**
 * Events RevenueCat's PostHog integration sends from its servers. A trial
 * converts while the app is closed, so the app cannot report it itself.
 */
export const REVENUECAT_EVENTS = {
  trialConverted: 'rc_trial_converted_event',
} as const;

/** Super property set on every event, so one PostHog project can hold several apps. */
export const APP_PROPERTY = 'app';

export type PurchaseDetails = {
  productId: string;
  /** RevenueCat `periodType` of the new entitlement: 'TRIAL', 'INTRO' or 'NORMAL'. */
  periodType: string;
  price?: number;
  currency?: string;
};

/** Which funnel event a completed store purchase counts as. */
export function purchaseEventFor(periodType: string): FunnelEventName {
  return periodType.toUpperCase() === 'TRIAL'
    ? FUNNEL_EVENTS.trialStarted
    : FUNNEL_EVENTS.purchaseCompleted;
}

/**
 * Local calendar day as YYYY-MM-DD. "Daily return" is about the user's own
 * day, not UTC.
 */
export function localDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysBetween(fromDay: string, toDay: string): number {
  const [fy, fm, fd] = fromDay.split('-').map(Number);
  const [ty, tm, td] = toDay.split('-').map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86_400_000);
}

export type OpenEvent = {
  event: FunnelEventName;
  properties: Record<string, number | boolean>;
};

/**
 * Events to fire when the app comes to the foreground, given the last day an
 * open was recorded (null on a fresh install). Empty when today is already
 * counted.
 */
export function openEventsFor(lastOpenDay: string | null, today: string): OpenEvent[] {
  if (lastOpenDay === today) return [];
  if (lastOpenDay === null) {
    return [
      { event: FUNNEL_EVENTS.appFirstOpened, properties: {} },
      { event: FUNNEL_EVENTS.appOpened, properties: { first_open: true } },
    ];
  }
  return [
    {
      event: FUNNEL_EVENTS.appOpened,
      properties: { first_open: false, days_since_last_open: daysBetween(lastOpenDay, today) },
    },
  ];
}
