import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

// Colors, fonts and spacing come from the shell theme (useTheme), never literals.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

const RULES: [string, RegExp][] = [
  ['hex color', /#[0-9a-fA-F]{3,8}\b/],
  ['rgb color', /\brgba?\(/],
  ['literal style size', /\b(fontSize|lineHeight|fontFamily|padding\w*|margin\w*|gap|borderRadius|height|width)\s*:\s*\d/],
];

it('has no hard-coded colors, fonts or spacing in the game framework', () => {
  const offenders = sourceFiles(join(__dirname, '..')).flatMap((file) => {
    const text = readFileSync(file, 'utf8');
    return RULES.filter(([, pattern]) => pattern.test(text)).map(([rule]) => `${file}: ${rule}`);
  });
  expect(offenders).toEqual([]);
});
