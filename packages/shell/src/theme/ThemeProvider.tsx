import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { buildTheme, resolveThemeFile, schemeFor, type Theme, type ThemeFile } from './tokens';

const ThemeContext = createContext<Theme>(buildTheme('light'));

/**
 * Provides the app's theme. `theme` is the app's theme.json; it is merged
 * over the shell defaults and checked once, so a typo throws a clear error.
 */
export function ThemeProvider({ theme: file, children }: { theme?: ThemeFile; children: ReactNode }) {
  const definition = useMemo(() => resolveThemeFile(file), [file]);
  const scheme = schemeFor(definition, useColorScheme());
  const theme = useMemo(() => buildTheme(scheme, definition), [scheme, definition]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
