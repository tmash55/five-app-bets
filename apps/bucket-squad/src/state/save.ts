/**
 * The save file: coins, collection, squad, progress and settings, kept on the
 * device. All the rules live in `logic.ts`; this file only stores the result.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { MatchSummary } from '@/meta/match';
import type { PackResult } from '@/meta/packs';
import { dayKey } from '@/meta/rng';
import * as logic from './logic';
import type { MatchOutcome, SaveData, Settings } from './logic';

interface SaveActions {
  startCareer: (teamId: string) => void;
  buyPack: (packId: string) => boolean;
  claimFreePack: () => boolean;
  openPack: (packId: string) => PackResult | null;
  setSquad: (squad: string[]) => void;
  markSeen: (playerId: string) => void;
  finishMatch: (summary: MatchSummary) => MatchOutcome;
  claimMission: (index: number) => boolean;
  claimMissionBonus: () => boolean;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  seeTip: (id: string) => void;
  buyUniform: (id: string) => boolean;
  /** mark today's Daily Shop as seen (and keep its deals for the day) */
  visitShop: (day?: string) => void;
  buyShopSlot: (slotId: string, day?: string) => logic.ShopBuy | null;
  wearUniform: (id: string | null) => boolean;
  addCoins: (n: number) => void;
  resetAll: () => void;
}

export type SaveStore = SaveData & SaveActions;

/** The save itself, without the store's actions. */
export function dataOf(s: SaveStore): SaveData {
  return {
    version: s.version,
    onboarded: s.onboarded,
    homeTeam: s.homeTeam,
    coins: s.coins,
    owned: s.owned,
    fresh: s.fresh,
    squad: s.squad,
    packs: s.packs,
    ladder: s.ladder,
    tour: s.tour,
    starPacks: s.starPacks,
    missions: s.missions,
    freePackDay: s.freePackDay,
    firstWinDay: s.firstWinDay,
    stats: s.stats,
    settings: s.settings,
    tips: s.tips,
    uniforms: s.uniforms,
    uniform: s.uniform,
    shop: s.shop,
  };
}

export const useSave = create<SaveStore>()(
  persist(
    (set, get) => ({
      ...logic.newSave(),
      startCareer: (teamId) => set(logic.startCareer(dataOf(get()), teamId)),
      buyPack: (packId) => {
        const next = logic.buyPack(dataOf(get()), packId);
        if (!next) return false;
        set(next);
        return true;
      },
      claimFreePack: () => {
        const next = logic.claimFreePack(dataOf(get()), dayKey());
        if (!next) return false;
        set(next);
        return true;
      },
      openPack: (packId) => {
        const res = logic.openOwnedPack(dataOf(get()), packId, Math.random, dayKey());
        if (!res) return null;
        set(res.data);
        return res.result;
      },
      setSquad: (squad) => set(logic.setSquad(dataOf(get()), squad)),
      markSeen: (playerId) => {
        const cur = get();
        if (cur.fresh.includes(playerId)) set(logic.markSeen(dataOf(cur), playerId));
      },
      finishMatch: (summary) => {
        const res = logic.finishMatch(dataOf(get()), summary, dayKey());
        set(res.data);
        return res.outcome;
      },
      claimMission: (index) => {
        const next = logic.claimMission(dataOf(get()), index, dayKey());
        if (!next) return false;
        set(next);
        return true;
      },
      claimMissionBonus: () => {
        const next = logic.claimMissionBonus(dataOf(get()), dayKey());
        if (!next) return false;
        set(next);
        return true;
      },
      setSetting: (key, value) => set({ settings: { ...get().settings, [key]: value } }),
      seeTip: (id) => {
        if (!get().tips[id]) set({ tips: { ...get().tips, [id]: true } });
      },
      buyUniform: (id) => {
        const next = logic.buyUniform(dataOf(get()), id);
        if (!next) return false;
        set(next);
        return true;
      },
      visitShop: (day = dayKey()) => {
        const cur = dataOf(get());
        const next = logic.visitShop(cur, day);
        if (next !== cur) set(next);
      },
      buyShopSlot: (slotId, day = dayKey()) => {
        const res = logic.buyShopSlot(dataOf(get()), slotId, day);
        if (res) set(res.data);
        return res;
      },
      wearUniform: (id) => {
        const next = logic.wearUniform(dataOf(get()), id);
        if (!next) return false;
        set(next);
        return true;
      },
      addCoins: (n) => set({ coins: Math.max(0, get().coins + n) }),
      resetAll: () => set(logic.newSave()),
    }),
    {
      name: 'bucket-squad-save',
      version: logic.SAVE_VERSION,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => dataOf(s),
      // every version of the save goes through the same repair, so an update never throws a save away
      migrate: (persisted) => logic.repairSave(persisted),
      merge: (persisted, current) => ({ ...current, ...logic.repairSave(persisted) }),
    },
  ),
);

/** True once the save file has been read from the device. */
export function useSaveReady(): boolean {
  return useSyncExternalStore(
    (onChange) => useSave.persist.onFinishHydration(onChange),
    () => useSave.persist.hasHydrated(),
    () => false,
  );
}
