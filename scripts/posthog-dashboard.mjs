#!/usr/bin/env node
// Creates or updates the launch-gate dashboard for one app in PostHog.
//
//   POSTHOG_PERSONAL_API_KEY=phx_... POSTHOG_PROJECT_ID=12345 \
//     node scripts/posthog-dashboard.mjs --app called-it [--host https://us.posthog.com]
//
// The personal API key needs the dashboard:write and insight:write scopes.
// --app is the slug in apps/<app>/app.identity.json (the `app` event property).

import { parseArgs } from './new-app-lib.mjs';
import { dashboardName, planInsights } from './posthog-dashboard-lib.mjs';

const args = parseArgs(process.argv.slice(2));
const app = args.app;
const host = (args.host ?? process.env.POSTHOG_HOST ?? 'https://us.posthog.com').replace(/\/$/, '');
const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
const projectId = process.env.POSTHOG_PROJECT_ID;

const missing = [
  !app && '--app',
  !apiKey && 'POSTHOG_PERSONAL_API_KEY',
  !projectId && 'POSTHOG_PROJECT_ID',
].filter(Boolean);
if (missing.length) {
  console.error(`Missing: ${missing.join(', ')}`);
  process.exit(1);
}

const base = `${host}/api/projects/${projectId}`;

async function api(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function findDashboard(name) {
  let url = '/dashboards/?limit=100';
  while (url) {
    const page = await api('GET', url);
    const hit = page.results.find((d) => d.name === name && !d.deleted);
    if (hit) return hit;
    url = page.next ? page.next.slice(page.next.indexOf('/dashboards/')) : null;
  }
  return null;
}

const name = dashboardName(app);
let dashboard = await findDashboard(name);
if (!dashboard) {
  dashboard = await api('POST', '/dashboards/', {
    name,
    description: 'Four launch gates from UNJ-1419. Targets are in each insight name.',
  });
  console.log(`Created dashboard "${name}" (${dashboard.id})`);
} else {
  console.log(`Updating dashboard "${name}" (${dashboard.id})`);
}

const full = await api('GET', `/dashboards/${dashboard.id}/`);
const existing = (full.tiles ?? []).map((t) => t.insight).filter(Boolean);

for (const step of planInsights(app, existing)) {
  const body = { ...step.spec, dashboards: [dashboard.id] };
  if (step.action === 'create') {
    const created = await api('POST', '/insights/', body);
    console.log(`  + ${created.name}`);
  } else {
    await api('PATCH', `/insights/${step.id}/`, body);
    console.log(`  ~ ${step.spec.name}`);
  }
}

console.log(`${host}/project/${projectId}/dashboard/${dashboard.id}`);
