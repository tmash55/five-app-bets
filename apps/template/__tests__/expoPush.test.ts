import {
  buildMessages,
  chunk,
  deadTokens,
  parsePushRequest,
  safeEqual,
  type ExpoTicket,
} from '../supabase/functions/_shared/expoPush';

describe('send-push helpers', () => {
  it('validates the request body', () => {
    expect(parsePushRequest(null)).toBe('Body must be a JSON object.');
    expect(parsePushRequest({ user_ids: [], title: 't', body: 'b' })).toBe('user_ids must be a non-empty array.');
    expect(parsePushRequest({ user_ids: ['u1'], title: ' ', body: 'b' })).toBe('title is required.');
    expect(parsePushRequest({ user_ids: ['u1'], title: 't', body: 'b', data: [] })).toBe('data must be an object.');
    expect(parsePushRequest({ user_ids: ['u1', 'u1'], title: 't', body: 'b', data: { url: '/' } })).toEqual({
      user_ids: ['u1'],
      title: 't',
      body: 'b',
      data: { url: '/' },
      channel_id: undefined,
    });
  });

  it('builds one message per unique token on the updates channel by default', () => {
    const messages = buildMessages(['a', 'b', 'a'], { user_ids: ['u'], title: 't', body: 'b' });
    expect(messages.map((m) => m.to)).toEqual(['a', 'b']);
    expect(messages[0].channelId).toBe('updates');
  });

  it('batches in groups of 100', () => {
    expect(chunk(Array.from({ length: 250 }, (_, i) => i), 100).map((c) => c.length)).toEqual([100, 100, 50]);
  });

  it('finds tokens Expo says are no longer registered', () => {
    const messages = buildMessages(['a', 'b', 'c'], { user_ids: ['u'], title: 't', body: 'b' });
    const tickets: ExpoTicket[] = [
      { status: 'ok', id: '1' },
      { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
      { status: 'error', message: 'too big', details: { error: 'MessageTooBig' } },
    ];
    expect(deadTokens(messages, tickets)).toEqual(['b']);
  });

  it('compares keys exactly', () => {
    expect(safeEqual('secret', 'secret')).toBe(true);
    expect(safeEqual('secret', 'secreT')).toBe(false);
    expect(safeEqual('secret', 'secret2')).toBe(false);
    expect(safeEqual('', 'x')).toBe(false);
  });
});
