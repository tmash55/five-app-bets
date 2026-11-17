/**
 * The invite web page behind https://<host>/join/<code> (UNJ-1425). Plain
 * TypeScript with no runtime imports, so `node invite-site/build.mts` and Jest
 * both use it.
 *
 * - With the app installed, iOS universal links and Android app links open the
 *   app straight from the link and this page is never seen. The two
 *   .well-known files below are what makes the OS trust the domain.
 * - Without the app, this page sends people to the store and passes the code
 *   on (Play install referrer on Android, the clipboard on iOS; see
 *   src/invite/deferredInvite.ts).
 */

export type SiteConfig = {
  host: string;
  appName: string;
  scheme: string;
  iosBundleId: string;
  androidPackage: string;
  iosAppStoreId: string;
  appleTeamId: string;
  androidSha256: string[];
  colors: { background: string; surface: string; text: string; textSecondary: string; primary: string; textOnPrimary: string };
};

export type SiteFile = { path: string; contents: string };

/** The env vars the build needs, with what each one is. */
export const REQUIRED_ENV: Record<string, string> = {
  INVITE_LINK_HOST: 'host invite links use, same value as EXPO_PUBLIC_INVITE_LINK_HOST (e.g. calledit.app)',
  IOS_APP_STORE_ID: 'numeric App Store ID from App Store Connect',
  APPLE_TEAM_ID: '10-character Apple Developer Team ID',
  ANDROID_SHA256_CERT_FINGERPRINTS: 'Play app signing SHA-256 fingerprint(s), comma separated',
};

/** Reads and checks the build settings. Lists every missing or malformed one at once. */
export function readSiteEnv(env: Record<string, string | undefined>): {
  host: string;
  iosAppStoreId: string;
  appleTeamId: string;
  androidSha256: string[];
} {
  const problems: string[] = [];
  const get = (name: string) => env[name]?.trim() ?? '';
  for (const name of Object.keys(REQUIRED_ENV)) {
    if (!get(name)) problems.push(`${name} is missing: ${REQUIRED_ENV[name]}`);
  }
  const host = get('INVITE_LINK_HOST').toLowerCase();
  if (host && !/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) {
    problems.push('INVITE_LINK_HOST must be a bare host name, without https:// or a path');
  }
  const storeId = get('IOS_APP_STORE_ID');
  if (storeId && !/^\d+$/.test(storeId)) problems.push('IOS_APP_STORE_ID must be digits only');
  const teamId = get('APPLE_TEAM_ID');
  if (teamId && !/^[A-Z0-9]{10}$/.test(teamId)) problems.push('APPLE_TEAM_ID must be 10 upper-case letters and digits');
  const fingerprints = get('ANDROID_SHA256_CERT_FINGERPRINTS')
    .split(',')
    .map((f) => f.trim().toUpperCase())
    .filter(Boolean);
  for (const f of fingerprints) {
    if (!/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f)) problems.push(`Not a SHA-256 fingerprint: ${f}`);
  }
  if (problems.length) throw new Error(`Cannot build the invite site:\n- ${problems.join('\n- ')}`);
  return { host, iosAppStoreId: storeId, appleTeamId: teamId, androidSha256: fingerprints };
}

export function appStoreUrl(c: SiteConfig): string {
  return `https://apps.apple.com/app/id${c.iosAppStoreId}`;
}

/** The Play link with the invite code as install referrer, read by the app on first launch. */
export function playStoreUrl(c: SiteConfig, code: string | null): string {
  const base = `https://play.google.com/store/apps/details?id=${encodeURIComponent(c.androidPackage)}`;
  return code ? `${base}&referrer=${encodeURIComponent(`invite=${code}`)}` : base;
}

export function appleAppSiteAssociation(c: SiteConfig): string {
  return JSON.stringify(
    {
      applinks: {
        details: [
          {
            appIDs: [`${c.appleTeamId}.${c.iosBundleId}`],
            components: [{ '/': '/join/*', comment: 'League invite links' }],
          },
        ],
      },
    },
    null,
    2,
  );
}

export function assetLinks(c: SiteConfig): string {
  return JSON.stringify(
    [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: { namespace: 'android_app', package_name: c.androidPackage, sha256_cert_fingerprints: c.androidSha256 },
      },
    ],
    null,
    2,
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

/**
 * The join page. One static page serves every code: the script reads it from
 * the path. The code format matches looksLikeInviteCode in the app.
 */
export function joinPage(c: SiteConfig): string {
  const name = escapeHtml(c.appName);
  const settings = JSON.stringify({
    scheme: c.scheme,
    host: c.host,
    appStore: appStoreUrl(c),
    play: playStoreUrl(c, null),
  }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Join my ${name} league</title>
<meta name="description" content="Pick tonight's games and see who calls them best. Free on iPhone and Android.">
<meta property="og:title" content="Join my ${name} league">
<meta property="og:description" content="Pick tonight's games and see who calls them best.">
<meta property="og:image" content="https://${c.host}/og.png">
<meta name="twitter:card" content="summary">
<meta name="apple-itunes-app" content="app-id=${c.iosAppStoreId}">
<style>
:root{--bg:${c.colors.background};--surface:${c.colors.surface};--text:${c.colors.text};--muted:${c.colors.textSecondary};--primary:${c.colors.primary};--on-primary:${c.colors.textOnPrimary}}
body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,system-ui,sans-serif}
main{max-width:420px;margin:0 auto;padding:32px 24px;display:flex;flex-direction:column;gap:16px}
h1{font-size:32px;line-height:40px;margin:0}
p{font-size:16px;line-height:24px;margin:0;color:var(--muted)}
.code{background:var(--surface);border-radius:12px;padding:16px;font:600 20px/28px ui-monospace,monospace;letter-spacing:2px;text-align:center;color:var(--text)}
a.button,button{display:block;box-sizing:border-box;width:100%;border:0;border-radius:12px;padding:16px 24px;font-family:inherit;font-size:14px;line-height:20px;font-weight:600;text-align:center;text-decoration:none;cursor:pointer}
.primary{background:var(--primary);color:var(--on-primary)}
.secondary{background:var(--surface);color:var(--text)}
[hidden]{display:none!important}
</style>
</head>
<body>
<main>
<h1>You're invited</h1>
<p id="lead">A friend wants you in their ${name} league. Pick tonight's games and see who calls them best.</p>
<div class="code" id="code" hidden></div>
<button class="primary" id="get">Get ${name}</button>
<a class="button secondary" id="open" hidden>I have the app. Open the invite</a>
<p id="note" hidden>Once ${name} is installed, sign up and paste the invite when asked. It's copied for you.</p>
<p id="bad" hidden>This invite link looks broken. Ask your friend to send it again.</p>
</main>
<script>
(function () {
  var s = ${settings};
  var m = /\\/join\\/([A-Za-z0-9-]+)\\/?$/.exec(location.pathname);
  var code = m ? m[1].replace(/[^A-Za-z0-9]/g, '').toUpperCase() : '';
  var valid = /^[A-HJKMNP-Z2-9]{8}$/.test(code);
  var ua = navigator.userAgent;
  var ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);
  var android = /Android/.test(ua);
  var el = function (id) { return document.getElementById(id); };
  if (!valid) { el('bad').hidden = false; }
  else {
    el('code').textContent = code;
    el('code').hidden = false;
    el('open').href = s.scheme + '://join/' + code;
    el('open').hidden = false;
  }
  el('get').addEventListener('click', function () {
    if (android) {
      location.href = s.play + (valid ? '&referrer=' + encodeURIComponent('invite=' + code) : '');
      return;
    }
    var go = function () { location.href = s.appStore; };
    if (ios && valid && navigator.clipboard) {
      el('note').hidden = false;
      navigator.clipboard.writeText('https://' + s.host + '/join/' + code).then(go, go);
    } else {
      go();
    }
  });
})();
</script>
</body>
</html>
`;
}

/** The site root: no code, so just the store links. */
export function homePage(c: SiteConfig): string {
  const name = escapeHtml(c.appName);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name}</title>
<meta name="apple-itunes-app" content="app-id=${c.iosAppStoreId}">
<style>
body{margin:0;background:${c.colors.background};color:${c.colors.text};font-family:-apple-system,system-ui,sans-serif}
main{max-width:420px;margin:0 auto;padding:32px 24px;display:flex;flex-direction:column;gap:16px}
a{display:block;border-radius:12px;padding:16px 24px;text-align:center;text-decoration:none;font-weight:600;background:${c.colors.primary};color:${c.colors.textOnPrimary}}
</style>
</head>
<body>
<main>
<h1>${name}</h1>
<a href="${appStoreUrl(c)}">Download on the App Store</a>
<a href="${escapeHtml(playStoreUrl(c, null))}">Get it on Google Play</a>
</main>
</body>
</html>
`;
}

/** Every file of the site. Rewrites for Netlify (_redirects) and Vercel (vercel.json) send /join/* to the one page. */
export function buildSite(c: SiteConfig): SiteFile[] {
  return [
    { path: 'index.html', contents: homePage(c) },
    { path: 'join/index.html', contents: joinPage(c) },
    { path: '.well-known/apple-app-site-association', contents: appleAppSiteAssociation(c) },
    { path: '.well-known/assetlinks.json', contents: assetLinks(c) },
    {
      path: '_redirects',
      contents: '/join/*  /join/index.html  200\n',
    },
    {
      path: '_headers',
      contents: '/.well-known/apple-app-site-association\n  Content-Type: application/json\n',
    },
    {
      path: 'vercel.json',
      contents: JSON.stringify(
        {
          rewrites: [{ source: '/join/:code', destination: '/join/index.html' }],
          headers: [
            {
              source: '/.well-known/apple-app-site-association',
              headers: [{ key: 'Content-Type', value: 'application/json' }],
            },
          ],
        },
        null,
        2,
      ),
    },
  ];
}
