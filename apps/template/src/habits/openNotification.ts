import type { NotificationData } from '@five/shell';
import { router, type Href } from 'expo-router';

/**
 * Routes a tapped reminder or server push to `data.url`. A tap that launched
 * the app arrives before the navigator is mounted, so it waits until
 * `navigatorReady()` is called.
 */
let ready = false;
let pending: Href | null = null;

function routeFor(data: NotificationData): Href | null {
  return typeof data.url === 'string' && data.url.startsWith('/') ? (data.url as Href) : null;
}

export function openNotification(data: NotificationData) {
  const href = routeFor(data);
  if (!href) return;
  if (ready) router.navigate(href);
  else pending = href;
}

export function navigatorReady() {
  ready = true;
  if (pending) {
    const href = pending;
    pending = null;
    router.navigate(href);
  }
}

export function navigatorGone() {
  ready = false;
}
