const mockPlayer = { play: jest.fn(), seekTo: jest.fn(() => Promise.resolve()), remove: jest.fn() };

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => mockPlayer),
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const audio = require('expo-audio');
const haptics = require('expo-haptics');
const { giveFeedback, preloadFeedback, releaseFeedback } = require('@/feedback/feedback');
/* eslint-enable @typescript-eslint/no-require-imports */

beforeEach(() => {
  jest.clearAllMocks();
  releaseFeedback();
});

it('plays a sound and a success haptic for a right answer', () => {
  giveFeedback('right');
  // Set once, on the first sound: never play over the silent switch.
  expect(audio.setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({ playsInSilentMode: false }));
  expect(mockPlayer.seekTo).toHaveBeenCalledWith(0);
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  expect(haptics.notificationAsync).toHaveBeenCalledWith('success');
});

it('plays a sound and an error haptic for a wrong answer', () => {
  giveFeedback('wrong');
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  expect(haptics.notificationAsync).toHaveBeenCalledWith('error');
});

it('only ticks for a tile tap, with no sound', () => {
  giveFeedback('tap');
  expect(haptics.selectionAsync).toHaveBeenCalled();
  expect(mockPlayer.play).not.toHaveBeenCalled();
});

it('loads each sound once and frees both on release', () => {
  preloadFeedback();
  giveFeedback('right');
  giveFeedback('right');
  expect(audio.createAudioPlayer).toHaveBeenCalledTimes(2);
  releaseFeedback();
  expect(mockPlayer.remove).toHaveBeenCalledTimes(2);
});

it('never throws when audio is unavailable', () => {
  audio.createAudioPlayer.mockImplementationOnce(() => {
    throw new Error('no audio');
  });
  expect(() => giveFeedback('wrong')).not.toThrow();
  expect(haptics.notificationAsync).toHaveBeenCalledWith('error');
});
