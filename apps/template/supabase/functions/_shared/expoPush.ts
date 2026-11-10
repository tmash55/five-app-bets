// Pure helpers for sending through the Expo push service. No Deno or Node APIs
// here, so the template's Jest tests can import this file too.

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo accepts at most 100 messages per request. */
export const EXPO_BATCH_SIZE = 100;

export type PushRequest = {
  user_ids: string[];
  title: string;
  body: string;
  /** Delivered to the app; `url` is the in-app route opened on tap. */
  data?: Record<string, unknown>;
  /** Android channel; the shell creates "updates" (default) and "reminders". */
  channel_id?: string;
};

export type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound: 'default';
  channelId: string;
};

export type ExpoTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message: string; details?: { error?: string } };

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Validates the request body; returns an error message or the parsed request. */
export function parsePushRequest(value: unknown): PushRequest | string {
  if (!value || typeof value !== 'object') return 'Body must be a JSON object.';
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.user_ids) || v.user_ids.length === 0) return 'user_ids must be a non-empty array.';
  if (!v.user_ids.every((id) => typeof id === 'string' && id.length > 0)) return 'user_ids must be strings.';
  if (typeof v.title !== 'string' || !v.title.trim()) return 'title is required.';
  if (typeof v.body !== 'string' || !v.body.trim()) return 'body is required.';
  if (v.data !== undefined && (typeof v.data !== 'object' || v.data === null || Array.isArray(v.data))) {
    return 'data must be an object.';
  }
  if (v.channel_id !== undefined && typeof v.channel_id !== 'string') return 'channel_id must be a string.';
  return {
    user_ids: [...new Set(v.user_ids as string[])],
    title: v.title,
    body: v.body,
    data: v.data as Record<string, unknown> | undefined,
    channel_id: v.channel_id as string | undefined,
  };
}

export function buildMessages(tokens: string[], request: PushRequest): ExpoMessage[] {
  return [...new Set(tokens)].map((to) => ({
    to,
    title: request.title,
    body: request.body,
    data: request.data,
    sound: 'default',
    channelId: request.channel_id ?? 'updates',
  }));
}

/** Tokens Expo says no longer reach a device; they should be deleted. */
export function deadTokens(messages: ExpoMessage[], tickets: ExpoTicket[]): string[] {
  return tickets.flatMap((ticket, i) =>
    ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered' && messages[i]
      ? [messages[i].to]
      : [],
  );
}

/** Compares two strings in time that does not depend on where they differ. */
export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
