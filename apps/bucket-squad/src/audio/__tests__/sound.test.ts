import { SFX_FILES } from '../files';

type Listener = (status: { didJustFinish: boolean }) => void;

/** Stands in for a native player: remembers what it was told, in order. */
class MockPlayer {
  volume = 1;
  loop = false;
  playing = false;
  shouldCorrectPitch = true;
  rate = 1;
  log: string[] = [];
  private readonly listeners = new Set<Listener>();

  play(): void {
    this.log.push('play');
    this.playing = true;
  }

  pause(): void {
    this.log.push('pause');
    this.playing = false;
  }

  remove(): void {
    this.log.push('remove');
    this.playing = false;
  }

  seekTo(seconds: number): Promise<void> {
    this.log.push(`seek ${seconds}`);
    return Promise.resolve();
  }

  setPlaybackRate(rate: number): void {
    this.rate = rate;
  }

  addListener(_event: string, fn: Listener): { remove(): void } {
    this.listeners.add(fn);
    return { remove: () => this.listeners.delete(fn) };
  }

  /** the sound reaches its end by itself */
  finish(): void {
    this.playing = false;
    for (const fn of this.listeners) fn({ didJustFinish: true });
  }
}

const mockMade: MockPlayer[] = [];

jest.mock('expo-audio', () => ({
  createAudioPlayer: () => {
    const player = new MockPlayer();
    mockMade.push(player);
    return player;
  },
  setAudioModeAsync: () => Promise.resolve(),
}));

type Sound = typeof import('../sound');

/** A fresh copy of the engine (it keeps its players in the module), as it would load on that platform. */
function load(os?: 'android'): Sound {
  let sound: Sound | null = null;
  jest.isolateModules(() => {
    if (os) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const rn = require('react-native') as typeof import('react-native');
      jest.replaceProperty(rn.Platform, 'OS', os);
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sound = require('../sound') as Sound;
  });
  if (!sound) throw new Error('the sound engine did not load');
  return sound;
}

/** lets promise answers (a finished seek) arrive */
const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

const alive = () => mockMade.filter((p) => !p.log.includes('remove'));

describe('sound engine', () => {
  let sound: Sound;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000_000);
    mockMade.length = 0;
    sound = load();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('a sound with takes makes a player per take and never plays one take twice in a row', () => {
    const takes = SFX_FILES.dribble.length;
    expect(takes).toBeGreaterThan(2);
    let last = -1;
    const used = new Set<number>();
    for (let i = 0; i < 60; i++) {
      const before = mockMade.map((p) => p.log.length);
      sound.playSfx('dribble');
      jest.advanceTimersByTime(300);
      const told = mockMade.findIndex((p, k) => p.log.length !== (before[k] ?? 0));
      expect(told).toBeGreaterThanOrEqual(0);
      expect(told).not.toBe(last);
      last = told;
      used.add(told);
    }
    expect(mockMade).toHaveLength(takes);
    expect(used.size).toBe(takes);
  });

  test('a rewound voice plays at once, and one that is still sounding goes back to the top first', async () => {
    expect(SFX_FILES.buzzer).toHaveLength(1);
    sound.playSfx('buzzer');
    const [voice] = mockMade;
    expect(voice.log).toEqual(['play']);

    // again while it sounds: playing where it stands would be silence on a phone
    jest.advanceTimersByTime(200);
    sound.playSfx('buzzer');
    expect(voice.log).toEqual(['play', 'seek 0']);
    await settle();
    expect(voice.log).toEqual(['play', 'seek 0', 'play']);

    // it ends by itself and is put back at its start, so the next play is one call again
    jest.advanceTimersByTime(1500);
    voice.finish();
    await settle();
    expect(voice.log).toEqual(['play', 'seek 0', 'play', 'seek 0']);
    sound.playSfx('buzzer');
    expect(voice.log).toEqual(['play', 'seek 0', 'play', 'seek 0', 'play']);
  });

  test('a finish reported just after a restart belongs to the play before it and is ignored', async () => {
    sound.playSfx('buzzer');
    const [voice] = mockMade;
    jest.advanceTimersByTime(1200);
    sound.playSfx('buzzer');
    voice.finish();
    await settle();
    expect(voice.log).toEqual(['play', 'seek 0', 'play']);
    // so it is not counted as rewound: the next play goes back to the top itself
    sound.playSfx('buzzer');
    await settle();
    expect(voice.log).toEqual(['play', 'seek 0', 'play', 'seek 0', 'play']);
  });

  test('an answer that arrives after a newer start does not start the sound twice', async () => {
    sound.playSfx('buzzer');
    const [voice] = mockMade;
    jest.advanceTimersByTime(100);
    sound.playSfx('buzzer');
    sound.playSfx('buzzer');
    await settle();
    expect(voice.log.filter((l) => l === 'play')).toHaveLength(2);
  });

  test('levels are the trim times the volume asked for, never above full', () => {
    sound.playSfx('cheer', 2);
    expect(mockMade.find((p) => p.log.includes('play'))?.volume).toBe(1);
    mockMade.length = 0;
    sound.playSfx('buzzer', 0.5);
    expect(mockMade[0].volume).toBeCloseTo(0.4);
  });

  test('knocks drift in speed with the pitch bending, and voices stay true', () => {
    for (let i = 0; i < 12; i++) sound.playSfx('dribble');
    const dribbles = [...mockMade];
    expect(dribbles.every((p) => p.shouldCorrectPitch === false)).toBe(true);
    expect(dribbles.every((p) => p.rate >= 0.96 && p.rate <= 1.04)).toBe(true);
    expect(new Set(dribbles.map((p) => p.rate)).size).toBeGreaterThan(1);
    mockMade.length = 0;
    for (let i = 0; i < 6; i++) sound.playSfx('cheer');
    expect(mockMade.every((p) => p.rate === 1)).toBe(true);
  });

  test('with sound off nothing is made or played', () => {
    sound.setSoundEnabled(false);
    sound.playSfx('tap');
    sound.setAmbience('park');
    expect(mockMade).toHaveLength(0);
  });

  test('warming makes the players ahead of time, a sound at a time, once', () => {
    sound.warmSounds(['tick', 'go', 'tick']);
    expect(mockMade).toHaveLength(0);
    jest.runAllTimers();
    const made = mockMade.length;
    expect(made).toBeGreaterThanOrEqual(2);
    sound.warmSounds(['tick', 'go']);
    jest.runAllTimers();
    sound.playSfx('go');
    expect(mockMade).toHaveLength(made);
  });

  test('the court sound loops under the music, comes forward without it, and follows the sound switch', () => {
    sound.setAmbience('park');
    expect(mockMade).toHaveLength(1);
    const park = mockMade[0];
    expect(park.loop).toBe(true);
    expect(park.playing).toBe(true);
    expect(park.volume).toBeCloseTo(0.45);

    sound.setMusic('game');
    expect(park.volume).toBeCloseTo(0.22);
    sound.setMusic(null);
    expect(park.volume).toBeCloseTo(0.45);

    sound.setSoundEnabled(false);
    expect(park.log).toContain('remove');
    sound.setSoundEnabled(true);
    expect(alive()).toHaveLength(1);
    expect(alive()[0].loop).toBe(true);

    // a court with no sound of its own is quiet, and so is no court
    sound.setAmbience('nowhere');
    expect(alive()).toHaveLength(0);
    sound.setAmbience('beach');
    expect(alive()).toHaveLength(1);
    sound.setAmbience(null);
    expect(alive()).toHaveLength(0);
  });

  test('the same court asked for twice keeps its player', () => {
    sound.setAmbience('park');
    sound.setAmbience('park');
    expect(mockMade).toHaveLength(1);
  });

  describe('on Android, where an app may hold about 40 audio outputs', () => {
    beforeEach(() => {
      mockMade.length = 0;
      sound = load('android');
    });

    test('fewer takes are kept alive', () => {
      for (let i = 0; i < 30; i++) sound.playSfx('dribble');
      expect(mockMade).toHaveLength(3);
      mockMade.length = 0;
      for (let i = 0; i < 30; i++) sound.playSfx('board');
      expect(mockMade).toHaveLength(1);
    });

    test('the players that have been quiet longest are let go when the limit is reached', () => {
      const names = Object.keys(SFX_FILES) as (keyof typeof SFX_FILES)[];
      expect(names.length).toBeGreaterThan(40);
      let most = 0;
      for (const name of names) {
        sound.playSfx(name);
        jest.advanceTimersByTime(6000);
        most = Math.max(most, alive().length);
      }
      expect(most).toBeLessThanOrEqual(34);
      // the first sound's player went first, and asking for it again brings a new one
      expect(mockMade[0].log).toContain('remove');
      const made = mockMade.length;
      sound.playSfx(names[0]);
      expect(mockMade.length).toBeGreaterThan(made);
      expect(alive().length).toBeLessThanOrEqual(34);
    });

    test('sounds that may still be sounding are never let go', () => {
      const names = Object.keys(SFX_FILES) as (keyof typeof SFX_FILES)[];
      for (const name of names) sound.playSfx(name);
      expect(mockMade.every((p) => !p.log.includes('remove'))).toBe(true);
    });
  });
});
