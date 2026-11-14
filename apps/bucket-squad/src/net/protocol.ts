/**
 * What two devices say to each other. Only moves, card ids and levels, and the match setup ever cross the wire:
 * never a name, an email or anything about the device. Every message from the other side is checked here before
 * the game looks at it, because it could be anything.
 */

import { MAX_LEVEL, PLAYERS, playerById } from '@/data/roster';
import { RATING_KEYS, type Ratings } from '@/game/sim/ratings';
import type { CourtId } from '@/game/render/court';
import type { MatchSetup, Side, SidePlayer } from '@/meta/match';

/** Bump whenever the simulation, the setup or these messages change in a way an older build would play differently. */
export const NETCODE_VERSION = 1;

function fnv(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** A hash of every player's id and ratings: two builds with different cards or numbers would play different games. */
export function rosterFingerprint(players: readonly { id: string; ratings: Ratings }[] = PLAYERS): string {
  const rows = players.map((p) => `${p.id}:${RATING_KEYS.map((k) => p.ratings[k]).join(',')}`).sort();
  return fnv(rows.join('|')).toString(36);
}

export const ROSTER_FINGERPRINT = rosterFingerprint();

/** What each device brings: its game version, its roster, and the squad it plays. */
export interface Offer {
  v: number;
  fp: string;
  /** the squad, captain first: card ids and levels */
  squad: SidePlayer[];
  /** the uniform the squad wears (a uniform id from the game's data), or null */
  uni: string | null;
  /** this device plays with the wider shot window */
  easy: boolean;
}

export type Role = 'host' | 'guest';

/** The inputs of a run of ticks, and how the connection is doing. */
export interface InputMsg {
  k: 'in';
  /** the first tick in `f` */
  s: number;
  /** packed input frames (see `packFrame`), one per tick from `s` */
  f: number[];
  /** the highest tick of the other side's frames this side has, every one before it too */
  a: number;
  /** the sender's clock when sent, in ms */
  t: number;
  /** the other side's `t` last heard, and how long ago, for the round trip */
  e?: number;
  h?: number;
  /** recent state checks: [tick, hash] */
  c?: [number, number][];
}

export type NetMsg =
  | ({ k: 'hello' } & Offer)
  | { k: 'setup'; to: string; v: number; fp: string; setup: MatchSetup }
  | { k: 'nope'; to: string; why: 'version' | 'full' }
  | { k: 'ready' }
  | InputMsg
  | { k: 'pause'; on: boolean; n: number }
  | { k: 'bye' };

/** every court (written out so this file needs nothing of the renderer; the type keeps the list complete) */
const COURTS: Record<CourtId, true> = { park: true, street: true, beach: true, rooftop: true, snow: true, canyon: true };

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length < 200;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function squadOk(v: unknown, least = 1): v is SidePlayer[] {
  if (!Array.isArray(v) || v.length < least || v.length > 5) return false;
  return v.every((p) => isObj(p) && isStr(p.id) && playerById(p.id) !== undefined && isInt(p.level) && p.level >= 1 && p.level <= MAX_LEVEL);
}

function sideOk(v: unknown, perTeam: number): v is Side {
  return isObj(v) && isStr(v.name) && isStr(v.short) && isStr(v.kitTeam) && (v.uniform === undefined || isStr(v.uniform)) && squadOk(v.players, perTeam);
}

/** A match setup from the other device, checked field by field: anything off and it is refused. */
export function setupOk(v: unknown): v is MatchSetup {
  if (!isObj(v)) return false;
  if (v.mode !== 'online' || (v.perTeam !== 2 && v.perTeam !== 3)) return false;
  if (!sideOk(v.home, v.perTeam) || !sideOk(v.away, v.perTeam)) return false;
  if (!isStr(v.court) || !Object.prototype.hasOwnProperty.call(COURTS, v.court)) return false;
  for (const k of ['difficulty', 'timingAssist', 'rubberBand'] as const) if (!isNum(v[k]) || v[k] < 0 || v[k] > 4) return false;
  if (!isInt(v.quarters) || v.quarters < 1 || v.quarters > 8) return false;
  if (!isInt(v.quarterSeconds) || v.quarterSeconds < 10 || v.quarterSeconds > 600) return false;
  if (!isInt(v.seed) || v.seed <= 0) return false;
  const d = v.duo;
  if (!isObj(d) || !Array.isArray(d.teamAssist) || !Array.isArray(d.catchUp) || d.teamAssist.length !== 2 || d.catchUp.length !== 2) return false;
  if (![...d.teamAssist, ...d.catchUp].every((n) => isNum(n) && n >= 0 && n <= 4)) return false;
  return v.spectate === undefined && v.demo === undefined && v.tour === undefined;
}

/** Turn whatever arrived into a message this build understands, or null. */
export function readMsg(v: unknown): NetMsg | null {
  if (!isObj(v) || !isStr(v.k)) return null;
  switch (v.k) {
    case 'hello':
      return isInt(v.v) && isStr(v.fp) && squadOk(v.squad, 2) && (v.uni === null || isStr(v.uni)) && typeof v.easy === 'boolean'
        ? { k: 'hello', v: v.v, fp: v.fp, squad: v.squad.map((p) => ({ id: p.id, level: p.level })), uni: v.uni, easy: v.easy }
        : // a hello from a build with another version may not have a squad this build knows: keep what says so
          isInt(v.v) && isStr(v.fp)
          ? { k: 'hello', v: v.v, fp: v.fp, squad: [], uni: null, easy: false }
          : null;
    case 'setup':
      if (!isStr(v.to) || !isInt(v.v) || !isStr(v.fp)) return null;
      // a setup from another version is passed on as it is, so the guest can say "update both devices"
      if (v.v !== NETCODE_VERSION || v.fp !== ROSTER_FINGERPRINT) return { k: 'setup', to: v.to, v: v.v, fp: v.fp, setup: v.setup as MatchSetup };
      return setupOk(v.setup) ? { k: 'setup', to: v.to, v: v.v, fp: v.fp, setup: v.setup } : null;
    case 'nope':
      return isStr(v.to) && (v.why === 'version' || v.why === 'full') ? { k: 'nope', to: v.to, why: v.why } : null;
    case 'ready':
      return { k: 'ready' };
    case 'bye':
      return { k: 'bye' };
    case 'pause':
      return typeof v.on === 'boolean' && isInt(v.n) ? { k: 'pause', on: v.on, n: v.n } : null;
    case 'in': {
      if (!isInt(v.s) || v.s < 1 || !Array.isArray(v.f) || v.f.length > 600 || !v.f.every((n) => isInt(n) && n >= 0 && n < 1 << 20)) return null;
      if (!isInt(v.a) || !isNum(v.t)) return null;
      const msg: InputMsg = { k: 'in', s: v.s, f: v.f as number[], a: v.a, t: v.t };
      if (isNum(v.e) && isNum(v.h)) {
        msg.e = v.e;
        msg.h = v.h;
      }
      if (Array.isArray(v.c) && v.c.length <= 8 && v.c.every((p) => Array.isArray(p) && p.length === 2 && isInt(p[0]) && isInt(p[1]))) msg.c = v.c as [number, number][];
      return msg;
    }
    default:
      return null;
  }
}

/** Both devices run the same game. */
export function sameGame(o: { v: number; fp: string }): boolean {
  return o.v === NETCODE_VERSION && o.fp === ROSTER_FINGERPRINT;
}
