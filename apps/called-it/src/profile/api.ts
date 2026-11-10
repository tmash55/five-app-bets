import type { SupabaseClient } from '@supabase/supabase-js';

import { parseProfileStats, type ProfileStats } from './profileState';

export type ProfileData = { stats: ProfileStats; streak: number };

/** The player's record by sport, badge counts and current play streak. */
export async function fetchProfile(client: SupabaseClient, today: string): Promise<ProfileData> {
  const [stats, streak] = await Promise.all([
    client.rpc('profile_stats'),
    client.rpc('play_streak', { p_today: today }),
  ]);
  if (stats.error) throw new Error(stats.error.message);
  return { stats: parseProfileStats(stats.data), streak: typeof streak.data === 'number' ? streak.data : 0 };
}
