/**
 * Development only: puts the stores and a few helpers on `globalThis` so the
 * preview tooling can jump straight to any screen or game state. Stripped
 * from release builds because every use sits behind `__DEV__`.
 */

import { router } from 'expo-router';

import { useAccount } from '@/account';
import * as roster from '@/data/roster';
import * as setups from '@/meta/setups';
import { useSave } from '@/state/save';
import { useSession } from '@/state/session';

export function exposeForTooling(): void {
  const g = globalThis as Record<string, unknown>;
  g.__save = useSave;
  g.__session = useSession;
  g.__setups = setups;
  g.__roster = roster;
  g.__router = router;
  // what the account part of Settings shows (setting it only changes the pictures, never the account)
  g.__account = useAccount;
}
