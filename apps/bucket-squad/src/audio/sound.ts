/**
 * Sound effects, the sound of the court, and music.
 *
 * A sound can have several takes (recordings of the same thing). A different
 * take plays each time, at a slightly different speed, so a run of dribbles
 * never sounds like a machine. Every take has its own player that waits,
 * rewound, at its start: playing it is one call with nothing left to load.
 * Players are made the first time a sound is needed, or ahead of time with
 * `warmSounds`. Everything here fails quietly: a game with no sound is better
 * than a crash because a speaker was busy.
 */

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioSource } from 'expo-audio';
import { Platform } from 'react-native';

import { AMBIENCE_FILES, MUSIC_FILES, SFX_FILES } from './files';

export type SfxName = keyof typeof SFX_FILES;
export type MusicName = keyof typeof MUSIC_FILES;
type AmbienceName = keyof typeof AMBIENCE_FILES;

/** how many copies of one sound may play at once (default 1); a sound with several takes always gets a player per take */
const VOICES: Partial<Record<SfxName, number>> = {
  tap: 2,
  coin: 3,
  cardFlip: 2,
  star: 3,
  swipe: 2,
  tick: 2,
  // the pack opening: cards deal into their row close together, and a rating's lamps tick one after another
  cardDeal: 3,
  lampTick: 3,
  spotWhoosh: 2,
  sparkle: 2,
};

/** loudness trim per sound, on top of the level baked into the file */
const TRIM: Partial<Record<SfxName, number>> = {
  // the recorded court sounds are levelled against each other in recordings.json, so most play as they are
  swish: 0.85,
  catch: 0.8,
  land: 0.8,
  scuff: 0.7,
  shoot: 0.6,
  pass: 0.6,
  swipe: 0.5,
  squeak: 0.35,
  // the kids watching sit behind the game
  cheer: 0.6,
  cheerBig: 0.7,
  ooh: 0.55,
  aww: 0.5,
  tap: 0.6,
  back: 0.6,
  // piercing or sustained tones: easy to overdo next to everything else
  whistle: 0.5,
  tick: 0.6,
  go: 0.65,
  buzzer: 0.8,
  ankle: 0.55,
  hypeEnd: 0.6,
  lose: 0.7,
  // the pack opening: the slam's boom measures loud for how it sounds, and a lamp tick plays up to thirty times a card
  slam: 0.65,
  lampTick: 0.55,
  drumRoll: 0.85,
};

/**
 * How far a sound's speed may drift from one play to the next (0.04 is 4 % either
 * way). Speed bends the pitch, as on a tape, so the same take never sounds
 * quite the same twice. Only knocks and scrapes drift: voices and tunes stay true.
 */
const DRIFT: Partial<Record<SfxName, number>> = {
  dribble: 0.04,
  bounce: 0.04,
  board: 0.03,
  rim: 0.02,
  swish: 0.03,
  catch: 0.05,
  steal: 0.05,
  block: 0.04,
  land: 0.05,
  scuff: 0.07,
  shoot: 0.04,
  pass: 0.05,
};

const MUSIC_LEVEL: Record<MusicName, number> = { menu: 0.5, game: 0.36 };
/** the court's own sound stays in the background: it sits under the music, and comes forward a little when the music is off */
const AMBIENCE_LEVEL = { underMusic: 0.14, alone: 0.26 };
/** loudness trim per court, on top of that: surf never pauses the way birds or a far street do, so it fills more of the ear at the same measured level */
const AMBIENCE_TRIM: Partial<Record<AmbienceName, number>> = { beach: 0.8 };

/**
 * Android lets one app hold about 40 audio outputs, and every player holds
 * one. So there the engine keeps fewer takes of each sound, one copy of each,
 * and lets go of the players that have been quiet longest when it runs out.
 * Other platforms keep everything. (Not yet tried on an Android phone.)
 */
const LEAN = Platform.OS === 'android';
const LEAN_TAKES: Partial<Record<SfxName, number>> = { dribble: 3, bounce: 2, swish: 2, rim: 2, cheer: 2 };
const MAX_PLAYERS = LEAN ? 34 : 96;
/** a sound that played this recently may still be sounding, so its players are not let go */
const STILL_SOUNDING_MS = 5000;
/** a finish reported this soon after a start belongs to the play before it */
const STALE_FINISH_MS = 25;
/** warming makes one sound's players, then lets a frame through */
const WARM_GAP_MS = 24;
/** nothing here watches progress, so players report as rarely as they can */
const PLAYER_OPTIONS = { updateInterval: 2000, keepAudioSessionActive: true };

interface Voice {
  player: AudioPlayer;
  /** rewound and quiet: a plain `play()` starts it from the top */
  parked: boolean;
  /** counts starts, so an answer that arrives late for an earlier start is dropped */
  run: number;
  /** when it last started (ms) */
  used: number;
  rate: number;
  sub: { remove(): void } | null;
}

interface Pool {
  /** one row of voices per take */
  rows: Voice[][];
  /** whose turn it is in each row */
  turn: number[];
  /** when the sound last played (ms) */
  used: number;
  /** how many players it holds */
  count: number;
}

interface Bed<Name> {
  name: Name;
  player: AudioPlayer;
}

const pools = new Map<SfxName, Pool>();
/** players alive in the pools */
let live = 0;
/** the take each sound played last */
const lastTake = new Map<SfxName, number>();
let soundOn = true;
let musicOn = true;
let music: Bed<MusicName> | null = null;
let wanted: MusicName | null = null;
let ambience: Bed<AmbienceName> | null = null;
let wantedAmbience: AmbienceName | null = null;
let notedAmbience: { name: AmbienceName | null; level: number } = { name: null, level: 0 };
let modeSet = false;
let warming: SfxName[] = [];
let warmTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * What the engine has done so far. Everything here fails quietly, so on a
 * phone these counts are the only way to tell that sounds really start, end
 * and rewind: `finished` and `rewound` should keep up with `started`, and
 * `failed` should stay at 0. Development builds show them as `__soundStats`.
 */
const stats = { players: 0, started: 0, restarted: 0, finished: 0, rewound: 0, failed: 0 };
if (__DEV__) (globalThis as { __soundStats?: typeof stats }).__soundStats = stats;

/** Development only: the preview tooling reads this log to lay a soundtrack under a captured video. */
function note(kind: 'sfx' | 'music' | 'amb', name: string | null, volume: number, take = 0, rate = 1): void {
  if (!__DEV__) return;
  const log = (globalThis as { __soundLog?: { t: number; kind: string; name: string | null; volume: number; take: number; rate: number }[] }).__soundLog;
  if (log) log.push({ t: performance.now(), kind, name, volume, take, rate });
}

function ensureMode(): void {
  if (modeSet) return;
  modeSet = true;
  // a game should stay quiet when the phone is on silent, and mix with whatever else is playing
  setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false }).catch(() => undefined);
}

function takesOf(name: SfxName): readonly AudioSource[] {
  const all: readonly AudioSource[] = SFX_FILES[name];
  return LEAN ? all.slice(0, LEAN_TAKES[name] ?? 1) : all;
}

function drop(voice: Voice): void {
  try {
    voice.sub?.remove();
    voice.player.remove();
  } catch {
    // ignore: it is on its way out anyway
  }
}

/** A sound ended by itself: put it back at its start, so the next play is instant. */
function rewind(voice: Voice): void {
  if (Date.now() - voice.used < STALE_FINISH_MS) return;
  stats.finished++;
  const run = voice.run;
  try {
    voice.player.seekTo(0, 0, 0).then(
      () => {
        if (voice.run !== run) return;
        voice.parked = true;
        stats.rewound++;
      },
      () => {
        stats.failed++;
      },
    );
  } catch {
    // an unparked voice still plays, through the slower path
    stats.failed++;
  }
}

function makeVoice(file: AudioSource): Voice {
  const player = createAudioPlayer(file, PLAYER_OPTIONS);
  stats.players++;
  const voice: Voice = { player, parked: true, run: 0, used: 0, rate: 1, sub: null };
  try {
    // a change of speed should bend the pitch: that is the point of it
    player.shouldCorrectPitch = false;
    voice.sub = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) rewind(voice);
    });
  } catch {
    // a voice that cannot say when it has finished is never parked, and restarts through a seek every time
    stats.failed++;
  }
  return voice;
}

function start(voice: Voice, level: number, rate: number): void {
  const p = voice.player;
  const run = ++voice.run;
  voice.used = Date.now();
  try {
    p.volume = level;
    if (rate !== voice.rate) {
      voice.rate = rate;
      p.setPlaybackRate(rate);
    }
    if (voice.parked) {
      voice.parked = false;
      p.play();
      stats.started++;
      return;
    }
    // still sounding, or ended a moment ago: a phone's player stays where it stopped, and playing there
    // gives silence. So go back to the top first, and only then play.
    p.seekTo(0, 0, 0).then(
      () => {
        if (voice.run !== run) return;
        try {
          p.play();
          stats.started++;
          stats.restarted++;
        } catch {
          stats.failed++;
        }
      },
      () => {
        stats.failed++;
      },
    );
  } catch {
    // sound is never worth interrupting play for
    stats.failed++;
  }
}

/** Lets go of the sounds that have been quiet longest until `need` more players fit. */
function makeRoom(need: number): void {
  if (live + need <= MAX_PLAYERS) return;
  const now = Date.now();
  const quietFirst = [...pools.entries()].sort((a, b) => a[1].used - b[1].used);
  for (const [name, pool] of quietFirst) {
    if (live + need <= MAX_PLAYERS || now - pool.used < STILL_SOUNDING_MS) break;
    for (const row of pool.rows) row.forEach(drop);
    live -= pool.count;
    pools.delete(name);
  }
}

function poolFor(name: SfxName): Pool | null {
  const have = pools.get(name);
  if (have) return have;
  const rows: Voice[][] = [];
  try {
    ensureMode();
    const takes = takesOf(name);
    const each = LEAN ? 1 : Math.max(1, Math.ceil((VOICES[name] ?? 1) / takes.length));
    makeRoom(takes.length * each);
    for (const file of takes) {
      const row: Voice[] = [];
      rows.push(row);
      for (let i = 0; i < each; i++) row.push(makeVoice(file));
    }
    const pool: Pool = { rows, turn: rows.map(() => 0), used: 0, count: takes.length * each };
    live += pool.count;
    pools.set(name, pool);
    return pool;
  } catch {
    stats.failed++;
    for (const row of rows) row.forEach(drop);
    return null;
  }
}

/** Which take to play: any but the one that played last. */
function nextTake(name: SfxName, takes: number): number {
  if (takes < 2) return 0;
  const last = lastTake.get(name);
  let take = Math.floor(Math.random() * (last === undefined || last >= takes ? takes : takes - 1));
  if (last !== undefined && last < takes && take >= last) take++;
  lastTake.set(name, take);
  return take;
}

function warmStep(): void {
  warmTimer = null;
  const name = warming.shift();
  if (name) poolFor(name);
  if (warming.length) warmTimer = setTimeout(warmStep, WARM_GAP_MS);
}

/** Make the players for these sounds ahead of time, a sound per frame, so the first dunk does not hitch. */
export function warmSounds(names: readonly SfxName[]): void {
  for (const n of names) if (!pools.has(n) && !warming.includes(n)) warming.push(n);
  if (!warmTimer && warming.length) warmTimer = setTimeout(warmStep, 0);
}

export function playSfx(name: SfxName, volume = 1): void {
  if (!soundOn) return;
  const level = Math.max(0, Math.min(1, volume * (TRIM[name] ?? 1)));
  const take = nextTake(name, takesOf(name).length);
  const drift = DRIFT[name] ?? 0;
  const rate = drift > 0 ? 1 + (Math.random() * 2 - 1) * drift : 1;
  note('sfx', name, level, take, rate);
  const pool = poolFor(name);
  if (!pool) return;
  pool.used = Date.now();
  const row = pool.rows[take];
  const voice = row[pool.turn[take]];
  pool.turn[take] = (pool.turn[take] + 1) % row.length;
  start(voice, level, rate);
}

function stopBed(bed: Bed<unknown> | null): void {
  if (!bed) return;
  try {
    bed.player.pause();
    bed.player.remove();
  } catch {
    // ignore
  }
}

function startBed<Name>(name: Name, file: AudioSource, level: number): Bed<Name> | null {
  try {
    ensureMode();
    const player = createAudioPlayer(file, PLAYER_OPTIONS);
    player.loop = true;
    player.volume = level;
    player.play();
    return { name, player };
  } catch {
    stats.failed++;
    return null;
  }
}

/** browsers refuse to start audio before the first tap, so a bed that should be playing is nudged again */
function nudge(bed: Bed<unknown> | null): void {
  if (!bed) return;
  try {
    if (!bed.player.playing) bed.player.play();
  } catch {
    // ignore
  }
}

function ambienceLevel(name: AmbienceName): number {
  return (music ? AMBIENCE_LEVEL.underMusic : AMBIENCE_LEVEL.alone) * (AMBIENCE_TRIM[name] ?? 1);
}

/** Bring the court's sound in line with what is wanted, the sound switch, and whether music plays over it. */
function syncAmbience(): void {
  const name = soundOn ? wantedAmbience : null;
  const level = name === null ? 0 : ambienceLevel(name);
  if (name !== notedAmbience.name || level !== notedAmbience.level) {
    notedAmbience = { name, level };
    note('amb', name, level);
  }
  if (ambience && ambience.name !== name) {
    stopBed(ambience);
    ambience = null;
  }
  if (name === null) return;
  if (!ambience) {
    ambience = startBed(name, AMBIENCE_FILES[name], level);
    return;
  }
  try {
    ambience.player.volume = level;
  } catch {
    // ignore
  }
  nudge(ambience);
}

/** Choose the music bed, or `null` for none. Safe to call often. */
export function setMusic(name: MusicName | null): void {
  wanted = name;
  note('music', musicOn ? name : null, name ? MUSIC_LEVEL[name] : 0);
  if (!musicOn || name === null) {
    stopBed(music);
    music = null;
  } else if (music?.name === name) {
    nudge(music);
  } else {
    stopBed(music);
    music = startBed(name, MUSIC_FILES[name], MUSIC_LEVEL[name]);
  }
  syncAmbience();
}

/**
 * Choose the background sound of a court (birds in the park, waves at the
 * beach), or `null` for none. A court without one of its own is quiet. It
 * follows the sound switch, not the music switch.
 */
export function setAmbience(court: string | null): void {
  wantedAmbience = court !== null && court in AMBIENCE_FILES ? (court as AmbienceName) : null;
  syncAmbience();
}

/** Turn the music down while something louder is happening (0..1). */
export function duckMusic(level: number): void {
  if (!music) return;
  try {
    music.player.volume = MUSIC_LEVEL[music.name] * Math.max(0, Math.min(1, level));
  } catch {
    // ignore
  }
}

export function setSoundEnabled(on: boolean): void {
  soundOn = on;
  syncAmbience();
}

export function setMusicEnabled(on: boolean): void {
  musicOn = on;
  setMusic(wanted);
}

/** Called on any tap: lets music and court sound that a browser blocked start playing. */
export function nudgeMusic(): void {
  if (musicOn && wanted) nudge(music);
  if (soundOn) nudge(ambience);
}
