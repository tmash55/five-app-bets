// Supabase Edge Function: sends a push notification to every device of the
// given users, for server events such as "results are ready".
//
// Call it from a server job (cron, another function, a database webhook) with
// the project's service role key:
//
//   curl -X POST "$SUPABASE_URL/functions/v1/send-push" \
//     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
//     -H "Content-Type: application/json" \
//     -d '{"user_ids":["<uuid>"],"title":"Results are in","body":"See how you did.","data":{"url":"/"}}'
//
// Deploy with `npx supabase functions deploy send-push`. Optional secret:
// EXPO_ACCESS_TOKEN, if "enhanced push security" is turned on in the Expo account.
import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  buildMessages,
  chunk,
  deadTokens,
  EXPO_BATCH_SIZE,
  EXPO_PUSH_URL,
  parsePushRequest,
  safeEqual,
  type ExpoTicket,
} from '../_shared/expoPush.ts';

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const bearer = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!bearer || !safeEqual(bearer, serviceKey)) return json(401, { error: 'Service role key required.' });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: 'Body must be JSON.' });
  }
  const request = parsePushRequest(payload);
  if (typeof request === 'string') return json(400, { error: request });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);
  const tokens: string[] = [];
  for (const ids of chunk(request.user_ids, 500)) {
    const { data, error } = await admin.from('push_tokens').select('token').in('user_id', ids);
    if (error) return json(500, { error: error.message });
    tokens.push(...data.map((row) => row.token as string));
  }

  const messages = buildMessages(tokens, request);
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  let sent = 0;
  const errors: string[] = [];
  const dead: string[] = [];

  for (const batch of chunk(messages, EXPO_BATCH_SIZE)) {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(batch),
    });
    if (!response.ok) {
      errors.push(`Expo push service returned ${response.status}.`);
      continue;
    }
    const { data: tickets } = (await response.json()) as { data: ExpoTicket[] };
    sent += tickets.filter((t) => t.status === 'ok').length;
    errors.push(...tickets.flatMap((t) => (t.status === 'error' ? [t.message] : [])));
    dead.push(...deadTokens(batch, tickets));
  }

  if (dead.length) await admin.from('push_tokens').delete().in('token', dead);

  return json(200, { devices: messages.length, sent, removed: dead.length, errors });
});
