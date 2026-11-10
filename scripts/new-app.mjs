#!/usr/bin/env node
// Spins up a new shell app from apps/template.
//
//   npm run new-app -- --name "Called It" --bundle-id bet.unjuiced.calledit \
//     [--slug called-it] [--android-package bet.unjuiced.calledit] \
//     [--supabase-url https://xyz.supabase.co --supabase-anon-key ...] \
//     [--revenuecat-ios-key ... --revenuecat-android-key ...]
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildIdentity, envFileFor, parseArgs, shouldCopy } from './new-app-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const templateDir = join(root, 'apps', 'template');

function main() {
  let args;
  let identity;
  try {
    args = parseArgs(process.argv.slice(2));
    identity = buildIdentity(args);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const target = join(root, 'apps', identity.slug);
  if (existsSync(target)) {
    console.error(`apps/${identity.slug} already exists. Pick another --slug.`);
    process.exit(1);
  }

  cpSync(templateDir, target, {
    recursive: true,
    filter: (src) => shouldCopy(basename(src)),
  });

  writeFileSync(join(target, 'app.identity.json'), `${JSON.stringify(identity, null, 2)}\n`);

  const pkgPath = join(target, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.name = `@five/${identity.slug}`;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  const tomlPath = join(target, 'supabase', 'config.toml');
  writeFileSync(
    tomlPath,
    readFileSync(tomlPath, 'utf8').replace(/project_id = ".*"/, `project_id = "${identity.slug}"`),
  );

  writeFileSync(join(target, '.env.local'), envFileFor(args));

  console.log(`Created apps/${identity.slug} (${identity.name}, ${identity.iosBundleIdentifier}).

Next steps:
  1. npm install                      (from the repo root, to link the new workspace)
  2. Create a Supabase project for this app, then put its URL and anon key in
     apps/${identity.slug}/.env.local (skip if you passed --supabase-url).
  3. cd apps/${identity.slug} && npx supabase link --project-ref <ref>
     && npx supabase functions deploy delete-account
  4. npm run ios / npm run android    (from apps/${identity.slug})`);
}

main();
