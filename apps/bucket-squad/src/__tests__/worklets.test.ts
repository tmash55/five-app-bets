/**
 * An animation's style function runs on the UI thread on a phone. If it calls a plain function of ours that is not
 * a worklet (such as `px`), the phone stops with a red error box, while the browser and these tests, which run
 * everything on one thread, never notice. That is how the pack opening broke on the simulator.
 *
 * This compiles every file that has worklets the way Metro does for a phone, and checks each worklet: every
 * function of ours that it calls has to be a worklet itself.
 */

import fs from 'fs';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const babel = require('@babel/core') as typeof import('@babel/core');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');
const PRESET = require.resolve('babel-preset-expo', { paths: [path.join(ROOT, 'node_modules/expo'), ROOT] });
const PLUGIN = require.resolve('react-native-worklets/plugin', { paths: [ROOT] });
/** the libraries whose functions are worklets already */
const WORKLET_LIBRARIES = new Set(['react-native-reanimated', 'react-native-worklets']);

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const at = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sources(at);
    return /\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts') ? [at] : [];
  });
}

function compile(file: string): string {
  const out = babel.transformFileSync(file, {
    cwd: ROOT,
    presets: [PRESET],
    plugins: [PLUGIN],
    babelrc: false,
    configFile: false,
    caller: { name: 'metro', platform: 'ios', isDev: true, bundler: 'metro' } as never,
  });
  return out?.code ?? '';
}

/** where an import points, as a file in src, or null for a library */
function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? path.join(SRC, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) if (fs.existsSync(base + ext)) return base + ext;
  return null;
}

interface Imported {
  file: string | null;
  library: string | null;
  name: string;
}

/** every name a file imports, with where it comes from and the name it has there */
function imports(file: string, text: string): Map<string, Imported> {
  const found = new Map<string, Imported>();
  for (const m of text.matchAll(/import\s+(?!type\b)([^'";]*?)\s+from\s+['"]([^'"]+)['"]/g)) {
    const [, clause, spec] = m;
    const where = resolveImport(file, spec);
    const library = where ? null : spec;
    const named = clause.match(/\{([^}]*)\}/);
    for (const part of named ? named[1].split(',') : []) {
      const bits = part.replace(/\btype\s+/, '').trim().split(/\s+as\s+/);
      if (bits[0]) found.set((bits[1] ?? bits[0]).trim(), { file: where, library, name: bits[0].trim() });
    }
  }
  return found;
}

function isFunction(text: string, name: string): boolean {
  const n = name.replace(/\$/g, '\\$');
  return new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?(?:async\\s+)?function\\s+${n}\\b|(?:^|\\n)\\s*(?:export\\s+)?const\\s+${n}\\s*(?::[^=]+)?=\\s*(?:async\\s*)?(?:\\([^)]*\\)|\\w+)\\s*=>`).test(text);
}

const files = sources(SRC).filter((f) => /useAnimated|useDerivedValue|useFrameCallback|'worklet'/.test(fs.readFileSync(f, 'utf8')));
const compiled = new Map(files.map((f) => [f, compile(f)] as const));

/** every function, in any file, that the compiler turned into a worklet, as "file:name" */
const worklets = new Set<string>();
for (const [file, code] of compiled) {
  for (const m of code.matchAll(/code:"\(function (\w+?)_\w+?(?:Tsx|Ts)\d+\(/g)) worklets.add(`${file}:${m[1]}`);
}

describe('worklets', () => {
  it('finds the files with animations', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((f) => [path.relative(ROOT, f), f]))('%s calls only worklets from its animations', (_label, file) => {
    const code = compiled.get(file) ?? '';
    const text = fs.readFileSync(file, 'utf8');
    const from = imports(file, text);
    const wrong: string[] = [];
    for (const m of code.matchAll(/code:"\(function (\w+)\([^)]*\)\{const\[([^\]]*)\]=this\.__closure/g)) {
      for (const name of m[2].split(',').filter(Boolean)) {
        const imp = from.get(name);
        if (imp) {
          if (imp.library && WORKLET_LIBRARIES.has(imp.library)) continue;
          if (!imp.file) continue;
          if (!isFunction(fs.readFileSync(imp.file, 'utf8'), imp.name)) continue;
          if (worklets.has(`${imp.file}:${imp.name}`)) continue;
          wrong.push(`${m[1]} calls ${name} from ${path.relative(ROOT, imp.file)}`);
        } else if (isFunction(text, name) && !worklets.has(`${file}:${name}`)) {
          wrong.push(`${m[1]} calls ${name}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});
