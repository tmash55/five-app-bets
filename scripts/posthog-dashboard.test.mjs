import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EVENTS, GATES, dashboardName, gateInsights, planInsights } from './posthog-dashboard-lib.mjs';

test('builds one insight per launch gate, filtered to the app', () => {
  const insights = gateInsights('called-it');
  assert.equal(insights.length, GATES.length);
  for (const insight of insights) {
    assert.deepEqual(insight.query.source.properties, [
      { key: 'app', value: ['called-it'], operator: 'exact', type: 'event' },
    ]);
  }
});

test('names carry the gate targets from the issue', () => {
  const names = gateInsights('keen').map((i) => i.name);
  assert.deepEqual(names, [
    'keen: Finish onboarding (target 60%)',
    'keen: Start a trial (target 8%)',
    'keen: Trials convert (target 30%)',
    'keen: Return next day (target 35%)',
  ]);
});

test('funnels and retention use the shell event names', () => {
  const [onboarding, trial, conversion, ret] = gateInsights('x').map((i) => i.query.source);
  const steps = (q) => q.series.map((s) => s.event);
  assert.deepEqual(steps(onboarding), [EVENTS.firstOpen, 'onboarding_completed']);
  assert.deepEqual(steps(trial), [EVENTS.firstOpen, 'trial_started']);
  assert.deepEqual(steps(conversion), ['trial_started', 'rc_trial_converted_event']);
  assert.equal(ret.kind, 'RetentionQuery');
  assert.equal(ret.retentionFilter.targetEntity.id, 'app_first_opened');
  assert.equal(ret.retentionFilter.returningEntity.id, 'app_opened');
  assert.equal(ret.retentionFilter.period, 'Day');
});

test('rejects a missing app slug', () => {
  assert.throws(() => gateInsights(''), /app slug/);
});

test('planInsights updates insights that exist by name and creates the rest', () => {
  const existing = [{ id: 7, name: 'keen: Start a trial (target 8%)' }];
  const plan = planInsights('keen', existing);
  assert.deepEqual(
    plan.map((p) => [p.action, p.id]),
    [
      ['create', undefined],
      ['update', 7],
      ['create', undefined],
      ['create', undefined],
    ],
  );
});

test('dashboard name is stable per app', () => {
  assert.equal(dashboardName('keen'), 'Launch gates: keen');
});
