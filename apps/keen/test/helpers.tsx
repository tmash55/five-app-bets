import { ThemeProvider } from '@five/shell';
import { act, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

export async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

export async function renderThemed(node: ReactNode) {
  return render(<ThemeProvider>{node}</ThemeProvider>);
}
