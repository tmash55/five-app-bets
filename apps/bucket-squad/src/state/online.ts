/**
 * The online game in progress, for the pages: the room (host or guest), what it looks like now, and how to open,
 * start and leave it. There is at most one room at a time.
 */

import { useEffect } from 'react';
import { create } from 'zustand';

import { newRoomCode } from '@/net/code';
import { makeTransport } from '@/net/config';
import type { Offer } from '@/net/protocol';
import { OnlineRoom, type RoomView } from '@/net/room';
import type { Transport } from '@/net/transport';
import { onlineSetup } from '@/meta/setups';
import { offerFrom, squadOf } from './offer';
import { useSave } from './save';
import { useSession } from './session';

interface Online {
  room: OnlineRoom | null;
  view: RoomView | null;
  /** this build has no way to play online */
  unavailable: boolean;
  /** the team this device plays as, or null for its squad: picked before hosting or joining */
  playAs: string | null;
  setPlayAs: (team: string | null) => void;
  /** open a room; the match is built when the friend arrives, at the size set then (`settings.format`) */
  host: () => void;
  join: (code: string) => void;
  leave: () => void;
}

/** how many fresh codes a host tries when the code it picked is already in use */
const CODE_TRIES = 4;

let transportOverride: Transport | null = null;

/** Tests and tooling: play over this wire instead of the build's own. */
export function playOver(t: Transport | null): void {
  transportOverride = t;
}

function transport(): Transport | null {
  return transportOverride ?? makeTransport();
}

export { offerFrom, squadOf } from './offer';

/** What this device brings now (see `offerFrom`). */
export function myOffer(): Offer {
  return offerFrom(useSave.getState(), useOnline.getState().playAs);
}

export const useOnline = create<Online>((set, get) => {
  let unsub: (() => void) | null = null;

  const adopt = (room: OnlineRoom, onTaken?: () => void) => {
    unsub?.();
    unsub = room.subscribe((view) => {
      if (get().room !== room) return;
      if (view.phase === 'failed' && view.problem === 'taken' && onTaken) {
        room.leave();
        onTaken();
        return;
      }
      // the match is made: both devices hand it to the versus page and the match screen
      if (view.setup && useSession.getState().setup !== view.setup && view.phase === 'matched') useSession.getState().begin(view.setup);
      set({ view });
    });
    set({ room, view: room.state, unavailable: false });
    room.open().catch(() => undefined);
  };

  return {
    room: null,
    view: null,
    unavailable: false,
    playAs: null,
    setPlayAs: (team) => set({ playAs: team }),
    host: () => {
      get().leave();
      const t = transport();
      if (!t) {
        set({ unavailable: true });
        return;
      }
      const open = (tries: number) => {
        const room = new OnlineRoom({
          transport: t,
          role: 'host',
          code: newRoomCode(),
          offer: myOffer(),
          // the host's own choices as they are when the friend arrives: the size, the court and the team it plays as
          makeSetup: (_h, g) => {
            const { format, quarterSeconds, hostCourt } = useSave.getState().settings;
            return onlineSetup(squadOf(myOffer()), squadOf(g), format, quarterSeconds, Math.random, hostCourt, useSession.getState().setup?.court ?? null);
          },
        });
        adopt(room, tries > 1 ? () => open(tries - 1) : undefined);
      };
      open(CODE_TRIES);
    },
    join: (code) => {
      get().leave();
      const t = transport();
      if (!t) {
        set({ unavailable: true });
        return;
      }
      adopt(new OnlineRoom({ transport: t, role: 'guest', code, offer: myOffer() }));
    },
    leave: () => {
      unsub?.();
      unsub = null;
      get().room?.leave();
      set({ room: null, view: null });
    },
  };
});

/** Leaving a page before the match is made closes the room; once made, the room goes on to the versus card. */
export function useLeaveUnlessMatched(): void {
  useEffect(
    () => () => {
      const v = useOnline.getState().view;
      if (!v || (v.phase !== 'matched' && v.phase !== 'playing')) useOnline.getState().leave();
    },
    [],
  );
}
