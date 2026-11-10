import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import Home from '@/app/(tabs)/index';

import { renderThemed } from '../test/helpers';

jest.mock('react-native-purchases', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/feedback/feedback', () => ({ giveFeedback: jest.fn() }));

const mockPush = jest.fn();
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    router: { push: (...args: unknown[]) => mockPush(...args) },
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});

it('lists both games with their best score and opens one', async () => {
  await AsyncStorage.setItem('keen.best.pairs', '1234');
  await renderThemed(<Home />);
  await waitFor(() => expect(screen.getByText('Best 1234')).toBeOnTheScreen());
  expect(screen.getByText('Pairs')).toBeOnTheScreen();
  expect(screen.getByText('Quick Sum')).toBeOnTheScreen();
  expect(screen.getByText('Not played yet')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Play Quick Sum' }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/play/[game]', params: { game: 'quick-sum' } });
});
