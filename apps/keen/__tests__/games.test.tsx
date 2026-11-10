import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import Games from '@/app/(tabs)/games';

import { renderThemed } from '../test/helpers';

jest.mock('react-native-purchases', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/feedback/feedback', () => ({ giveFeedback: jest.fn() }));
jest.mock('@/workout/premium', () => ({ usePremium: () => mockPremium }));
let mockPremium = true;

const mockPush = jest.fn();
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    router: { push: (...args: unknown[]) => mockPush(...args) },
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});

beforeEach(async () => {
  mockPremium = true;
  mockPush.mockClear();
  await AsyncStorage.clear();
});

it('lists all six games with their best score and opens one', async () => {
  await AsyncStorage.setItem('keen.best.pairs', '1234');
  await renderThemed(<Games />);
  await waitFor(() => expect(screen.getByText('Best 1234')).toBeOnTheScreen());
  expect(screen.getByText('Pairs')).toBeOnTheScreen();
  for (const title of ['Quick Sum', 'Odd One Out', 'Missing Letter', 'Sequence', 'Price Check']) {
    expect(screen.getByText(title)).toBeOnTheScreen();
  }
  expect(screen.getAllByText('Not played yet')).toHaveLength(5);

  await fireEvent.press(screen.getByRole('button', { name: 'Play Quick Sum' }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/play/[game]', params: { game: 'quick-sum' } });
});

it('locks every game but the free game of the day for free players', async () => {
  mockPremium = false;
  await renderThemed(<Games />);
  await waitFor(() => expect(screen.getByText(/Free today/)).toBeOnTheScreen());
  expect(screen.getAllByText(/Premium$/)).toHaveLength(5);
  const locked = screen.getAllByRole('button', { name: /part of Premium/ });
  expect(locked).toHaveLength(5);
  await fireEvent.press(locked[0]);
  expect(mockPush).not.toHaveBeenCalled();
  expect(screen.getAllByRole('button', { name: /^Play / })).toHaveLength(1);
});
