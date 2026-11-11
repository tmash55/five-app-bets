import { inviteCodeFromPath, savePendingInvite } from '@/invite/pendingInvite';

/**
 * Every link into the app passes through here first (expo-router). An invite
 * link is remembered so that a player who is signed out can still join once
 * they sign in or up (UNJ-1424). The path itself is left unchanged.
 */
export async function redirectSystemPath({ path }: { path: string; initial: boolean }): Promise<string> {
  const code = inviteCodeFromPath(path);
  if (code) await savePendingInvite(code);
  return path;
}
