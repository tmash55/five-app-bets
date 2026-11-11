import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';

import {
  AnalyticsProvider,
  LAST_OPEN_DAY_KEY,
  TrackingOff,
  trackPurchase,
  useAnalytics,
  type Analytics,
} from '../analytics/AnalyticsProvider';
import type { AnalyticsClient } from '../analytics/client';
import { FUNNEL_EVENTS, localDay, openEventsFor, purchaseEventFor } from '../analytics/events';
import { readShellConfig } from '../config/env';

function fakeClient(): AnalyticsClient & { distinct: string } {
  const client = {
    distinct: 'anon-1',
    capture: jest.fn(),
    identify: jest.fn((id: string) => {
      client.distinct = id;
    }),
    reset: jest.fn(() => {
      client.distinct = 'anon-2';
    }),
    register: jest.fn(),
    optIn: jest.fn(),
    optOut: jest.fn(),
    getDistinctId: () => client.distinct,
  };
  return client;
}

let latest: Analytics;
const capture = (value: Analytics) => {
  latest = value;
};
function Probe({ fire, onValue = capture }: { fire?: string; onValue?: (a: Analytics) => void }) {
  const analytics = useAnalytics();
  useEffect(() => onValue(analytics));
  useEffect(() => {
    if (fire) analytics.track(fire, { where: 'mount' });
    // Fire once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('event helpers', () => {
  it('counts a trial period as trial_started and anything else as a purchase', () => {
    expect(purchaseEventFor('TRIAL')).toBe(FUNNEL_EVENTS.trialStarted);
    expect(purchaseEventFor('trial')).toBe(FUNNEL_EVENTS.trialStarted);
    expect(purchaseEventFor('NORMAL')).toBe(FUNNEL_EVENTS.purchaseCompleted);
    expect(purchaseEventFor('INTRO')).toBe(FUNNEL_EVENTS.purchaseCompleted);
  });

  it('trackPurchase sends product details', () => {
    const track = jest.fn();
    trackPurchase(track, { productId: 'pro_annual', periodType: 'TRIAL', price: 0, currency: 'USD' });
    expect(track).toHaveBeenCalledWith('trial_started', {
      product_id: 'pro_annual',
      period_type: 'TRIAL',
      price: 0,
      currency: 'USD',
    });
  });

  it('fires first-open and open on a fresh install', () => {
    expect(openEventsFor(null, '2026-11-10').map((e) => e.event)).toEqual([
      'app_first_opened',
      'app_opened',
    ]);
  });

  it('fires one open per day and counts the gap', () => {
    expect(openEventsFor('2026-11-10', '2026-11-10')).toEqual([]);
    expect(openEventsFor('2026-11-09', '2026-11-10')).toEqual([
      { event: 'app_opened', properties: { first_open: false, days_since_last_open: 1 } },
    ]);
    expect(openEventsFor('2026-10-31', '2026-11-02')[0].properties.days_since_last_open).toBe(2);
  });

  it('uses the local calendar day', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('readShellConfig PostHog keys', () => {
  it('builds the PostHog config with the default host', () => {
    const config = readShellConfig({ EXPO_PUBLIC_POSTHOG_KEY: 'phc_1' });
    expect(config.posthog).toEqual({ apiKey: 'phc_1', host: 'https://us.i.posthog.com' });
    expect(config.missing).not.toContain('EXPO_PUBLIC_POSTHOG_KEY');
  });

  it('is null and listed as missing without a key', () => {
    const config = readShellConfig({ EXPO_PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com' });
    expect(config.posthog).toBeNull();
    expect(config.missing).toContain('EXPO_PUBLIC_POSTHOG_KEY');
  });
});

describe('AnalyticsProvider with PostHog', () => {
  it('sends events to the client and tags them with the app', async () => {
    const client = fakeClient();
    await render(
      <AnalyticsProvider client={client} appId="called-it">
        <Probe fire="paywall_viewed" />
      </AnalyticsProvider>,
    );
    expect(client.capture).toHaveBeenCalledWith('paywall_viewed', { where: 'mount' });
    expect(client.register).toHaveBeenCalledWith({ app: 'called-it' });
    expect(client.optIn).toHaveBeenCalled();
    expect(latest.distinctId).toBe('anon-1');
    expect(latest.thirdPartyTracking).toBe(true);
  });

  it('identifies on sign-in and resets on sign-out', async () => {
    const client = fakeClient();
    await render(
      <AnalyticsProvider client={client}>
        <Probe />
      </AnalyticsProvider>,
    );
    await act(async () => latest.identify('user-9'));
    expect(client.identify).toHaveBeenCalledWith('user-9');
    expect(latest.distinctId).toBe('user-9');
    await act(async () => latest.reset());
    expect(client.reset).toHaveBeenCalled();
    expect(latest.distinctId).toBe('anon-2');
  });

  it('sends nothing without a client', async () => {
    await render(
      <AnalyticsProvider>
        <Probe fire="x" />
      </AnalyticsProvider>,
    );
    expect(latest.distinctId).toBeNull();
    expect(latest.thirdPartyTracking).toBe(false);
  });
});

describe('third-party tracking switch', () => {
  it('never sends events fired inside a kids area, even on mount', async () => {
    const client = fakeClient();
    await render(
      <AnalyticsProvider client={client}>
        <TrackingOff>
          <Probe fire="kids_game_started" />
        </TrackingOff>
      </AnalyticsProvider>,
    );
    expect(client.capture).not.toHaveBeenCalled();
    expect(client.optOut).toHaveBeenCalled();
    expect(latest.thirdPartyTracking).toBe(false);
    expect(latest.distinctId).toBeNull();
  });

  it('turns tracking back on when the kids area closes', async () => {
    const client = fakeClient();
    function App() {
      const [kids, setKids] = useState(true);
      return (
        <AnalyticsProvider client={client}>
          {kids ? (
            <TrackingOff>
              <Pressable onPress={() => setKids(false)}>
                <Text>Leave</Text>
              </Pressable>
            </TrackingOff>
          ) : null}
          <Probe />
        </AnalyticsProvider>
      );
    }
    const view = await render(<App />);
    expect(latest.thirdPartyTracking).toBe(false);
    await fireEvent.press(view.getByText('Leave'));
    await waitFor(() => expect(latest.thirdPartyTracking).toBe(true));
    expect(client.optIn).toHaveBeenCalled();
    await act(async () => latest.track('home_viewed'));
    expect(client.capture).toHaveBeenCalledWith('home_viewed', undefined);
  });

  it('keeps tracking off app-wide and ignores identify', async () => {
    const client = fakeClient();
    await render(
      <AnalyticsProvider client={client} thirdPartyTracking={false}>
        <Probe fire="x" />
      </AnalyticsProvider>,
    );
    await act(async () => latest.identify('user-1'));
    expect(client.capture).not.toHaveBeenCalled();
    expect(client.identify).not.toHaveBeenCalled();
  });
});

describe('app open events', () => {
  it('fires first open once, then nothing more that day', async () => {
    const track = jest.fn();
    const first = await render(
      <AnalyticsProvider track={track} trackAppOpens>
        <Probe />
      </AnalyticsProvider>,
    );
    await waitFor(() => expect(track).toHaveBeenCalledWith('app_opened', { first_open: true }));
    expect(track).toHaveBeenCalledWith('app_first_opened', {});
    expect(await AsyncStorage.getItem(LAST_OPEN_DAY_KEY)).toBe(localDay(new Date()));
    await first.unmount();

    track.mockClear();
    await render(
      <AnalyticsProvider track={track} trackAppOpens>
        <Probe />
      </AnalyticsProvider>,
    );
    await act(async () => undefined);
    expect(track).not.toHaveBeenCalled();
  });

  it('fires a return open on a later day', async () => {
    await AsyncStorage.setItem(LAST_OPEN_DAY_KEY, '2000-01-01');
    const track = jest.fn();
    await render(
      <AnalyticsProvider track={track} trackAppOpens>
        <Probe />
      </AnalyticsProvider>,
    );
    await waitFor(() =>
      expect(track).toHaveBeenCalledWith(
        'app_opened',
        expect.objectContaining({ first_open: false }),
      ),
    );
    expect(track).not.toHaveBeenCalledWith('app_first_opened', expect.anything());
  });
});
