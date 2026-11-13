/**
 * Sound effects and music.
 *
 * Each effect gets a tiny pool of players so the same sound can overlap
 * itself (two dribbles, a run of coins). Players are created the first time a
 * sound is needed. Everything here fails quietly: a game with no sound is
 * better than a crash because a speaker was busy.
 */

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import { MUSIC_FILES, SFX_FILES } from './files';

export type SfxName = keyof typeof SFX_FILES;
export type MusicName = keyof typeof MUSIC_FILES;

/** how many copies of a sound may play at once (default 1) */
const VOICES: Partial<Record<SfxName, number>> = {
  tap: 2,
  coin: 3,
  dribble: 3,
  bounce: 2,
  rim: 2,
  cardFlip: 2,
  star: 3,
  swipe: 2,
  land: 2,
  tick: 2,
};

/** loudness trim per sound, on top of the level baked into the file */
const TRIM: Partial<Record<SfxName, number>> = {
  dribble: 0.6,
  bounce: 0.7,
  board: 0.8,
  swish: 0.75,
  shoot: 0.6,
  pass: 0.6,
  catch: 0.85,
  swipe: 0.5,
  land: 0.6,
  squeak: 0.35,
  cheer: 0.6,
  cheerBig: 0.7,
  ooh: 0.55,
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
};

const MUSIC_LEVEL: Record<MusicName, number> = { menu: 0.5, game: 0.36 };

interface Pool {
  players: AudioPlayer[];
  next: number;
}

const pools = new Map<SfxName, Pool>();
let soundOn = true;
let musicOn = true;
let music: { name: MusicName; player: AudioPlayer } | null = null;
let wanted: MusicName | null = null;
let modeSet = false;

/** Development only: the preview tooling reads this log to lay a soundtrack under a captured video. */
function note(kind: 'sfx' | 'music', name: string | null, volume: number): void {
  if (!__DEV__) return;
  const log = (globalThis as { __soundLog?: { t: number; kind: string; name: string | null; volume: number }[] }).__soundLog;
  if (log) log.push({ t: performance.now(), kind, name, volume });
}

function ensureMode(): void {
  if (modeSet) return;
  modeSet = true;
  // a game should stay quiet when the phone is on silent, and mix with whatever else is playing
  setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false }).catch(() => undefined);
}

function poolFor(name: SfxName): Pool | null {
  let pool = pools.get(name);
  if (pool) return pool;
  try {
    ensureMode();
    const count = VOICES[name] ?? 1;
    const players: AudioPlayer[] = [];
    for (let i = 0; i < count; i++) players.push(createAudioPlayer(SFX_FILES[name]));
    pool = { players, next: 0 };
    pools.set(name, pool);
    return pool;
  } catch {
    return null;
  }
}

/** Load sounds ahead of time so the first dunk does not hitch. */
export function warmSounds(names: readonly SfxName[]): void {
  for (const n of names) poolFor(n);
}

export function playSfx(name: SfxName, volume = 1): void {
  if (!soundOn) return;
  const level = Math.max(0, Math.min(1, volume * (TRIM[name] ?? 1)));
  note('sfx', name, level);
  const pool = poolFor(name);
  if (!pool) return;
  const p = pool.players[pool.next];
  pool.next = (pool.next + 1) % pool.players.length;
  try {
    p.volume = level;
    p.seekTo(0).catch(() => undefined);
    p.play();
  } catch {
    // ignore: sound is never worth interrupting play for
  }
}

function stopMusic(): void {
  if (!music) return;
  try {
    music.player.pause();
    music.player.remove();
  } catch {
    // ignore
  }
  music = null;
}

function startMusic(name: MusicName): void {
  try {
    ensureMode();
    const player = createAudioPlayer(MUSIC_FILES[name]);
    player.loop = true;
    player.volume = MUSIC_LEVEL[name];
    player.play();
    music = { name, player };
  } catch {
    music = null;
  }
}

/** Choose the music bed, or `null` for none. Safe to call often. */
export function setMusic(name: MusicName | null): void {
  wanted = name;
  note('music', musicOn ? name : null, name ? MUSIC_LEVEL[name] : 0);
  if (!musicOn || name === null) {
    stopMusic();
    return;
  }
  if (music?.name === name) {
    // browsers refuse to start audio before the first tap, so nudge it again
    try {
      if (!music.player.playing) music.player.play();
    } catch {
      // ignore
    }
    return;
  }
  stopMusic();
  startMusic(name);
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
}

export function setMusicEnabled(on: boolean): void {
  musicOn = on;
  if (on) setMusic(wanted);
  else stopMusic();
}

/** Called on any tap: lets music that a browser blocked start playing. */
export function nudgeMusic(): void {
  if (musicOn && wanted && music && !music.player.playing) {
    try {
      music.player.play();
    } catch {
      // ignore
    }
  }
}
