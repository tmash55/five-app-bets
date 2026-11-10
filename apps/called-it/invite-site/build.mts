/**
 * Builds the invite web page into invite-site/dist (UNJ-1425):
 *
 *   INVITE_LINK_HOST=calledit.app IOS_APP_STORE_ID=… APPLE_TEAM_ID=… \
 *   ANDROID_SHA256_CERT_FINGERPRINTS=… node invite-site/build.mts
 *
 * Refuses to build while any value is missing, rather than publishing
 * placeholder store links. Colors come from the shell palette.
 */
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import palette from '../../../packages/shell/src/theme/palette.json' with { type: 'json' };
import identity from '../app.identity.json' with { type: 'json' };
import { buildSite, readSiteEnv } from './site.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'dist');

let env: ReturnType<typeof readSiteEnv>;
try {
  env = readSiteEnv(process.env);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
const files = buildSite({
  ...env,
  appName: identity.name,
  scheme: identity.scheme,
  iosBundleId: identity.iosBundleIdentifier,
  androidPackage: identity.androidPackage,
  colors: palette.light,
});

rmSync(out, { recursive: true, force: true });
for (const f of files) {
  const path = join(out, f.path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, f.contents);
}
copyFileSync(join(here, '..', 'assets', 'images', 'icon.png'), join(out, 'og.png'));
console.log(`Invite site for ${env.host} written to ${out} (${files.length + 1} files).`);
