import type { EventProperties } from './AnalyticsProvider';

/**
 * The slice of the PostHog client the shell uses. Kept small so tests can
 * pass a fake and so the SDK stays behind one seam.
 */
export type AnalyticsClient = {
  capture: (event: string, properties?: EventProperties) => void;
  identify: (distinctId: string) => void;
  reset: () => void;
  register: (properties: EventProperties) => void | Promise<void>;
  optIn: () => void | Promise<void>;
  optOut: () => void | Promise<void>;
  getDistinctId: () => string;
};

export type PostHogConfig = { apiKey: string; host: string };

export const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';

/**
 * Creates the app's PostHog client. Only the shell's own events are sent:
 * autocapture, lifecycle events and session replay stay off.
 */
export function createPostHogClient(config: PostHogConfig): AnalyticsClient {
  // Required lazily so apps without a key never load the SDK.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PostHog } = require('posthog-react-native') as typeof import('posthog-react-native');
  const posthog = new PostHog(config.apiKey, {
    host: config.host,
    captureAppLifecycleEvents: false,
    enableSessionReplay: false,
  });
  return {
    capture: (event, properties) => {
      posthog.capture(event, properties ?? undefined);
    },
    identify: (distinctId) => posthog.identify(distinctId),
    reset: () => posthog.reset(),
    register: (properties) => posthog.register(properties),
    optIn: () => posthog.optIn(),
    optOut: () => posthog.optOut(),
    getDistinctId: () => posthog.getDistinctId(),
  };
}
