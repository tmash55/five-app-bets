import { runInNewContext } from 'node:vm';

import {
  appleAppSiteAssociation,
  assetLinks,
  buildSite,
  joinPage,
  playStoreUrl,
  readSiteEnv,
  type SiteConfig,
} from '../invite-site/site';

const fingerprint = Array(32).fill('AB').join(':');
const config: SiteConfig = {
  host: 'invite.example.com',
  appName: 'Called It',
  scheme: 'calledit',
  iosBundleId: 'bet.unjuiced.calledit',
  androidPackage: 'bet.unjuiced.calledit',
  iosAppStoreId: '123456789',
  appleTeamId: 'ABCDE12345',
  androidSha256: [fingerprint],
  colors: { background: '#fff', surface: '#eee', text: '#111', textSecondary: '#666', primary: '#208AEF', textOnPrimary: '#fff' },
};

describe('invite site settings', () => {
  it('refuses to build while anything is missing, listing all of it', () => {
    expect(() => readSiteEnv({})).toThrow(
      /INVITE_LINK_HOST is missing[\s\S]*IOS_APP_STORE_ID is missing[\s\S]*APPLE_TEAM_ID is missing[\s\S]*ANDROID_SHA256_CERT_FINGERPRINTS is missing/,
    );
  });

  it('refuses malformed values', () => {
    expect(() =>
      readSiteEnv({
        INVITE_LINK_HOST: 'https://x.com',
        IOS_APP_STORE_ID: 'id123',
        APPLE_TEAM_ID: 'abc',
        ANDROID_SHA256_CERT_FINGERPRINTS: 'AB:CD',
      }),
    ).toThrow(/bare host name[\s\S]*digits only[\s\S]*10 upper-case[\s\S]*Not a SHA-256/);
  });

  it('reads good values', () => {
    expect(
      readSiteEnv({
        INVITE_LINK_HOST: 'Invite.Example.com',
        IOS_APP_STORE_ID: '123456789',
        APPLE_TEAM_ID: 'ABCDE12345',
        ANDROID_SHA256_CERT_FINGERPRINTS: `${fingerprint.toLowerCase()}, ${fingerprint}`,
      }),
    ).toEqual({ host: 'invite.example.com', iosAppStoreId: '123456789', appleTeamId: 'ABCDE12345', androidSha256: [fingerprint, fingerprint] });
  });
});

describe('invite site files', () => {
  it('lets iOS open /join/ links in the app', () => {
    const aasa = JSON.parse(appleAppSiteAssociation(config));
    expect(aasa.applinks.details[0].appIDs).toEqual(['ABCDE12345.bet.unjuiced.calledit']);
    expect(aasa.applinks.details[0].components[0]['/']).toBe('/join/*');
  });

  it('lets Android verify the domain', () => {
    const links = JSON.parse(assetLinks(config));
    expect(links[0].target).toEqual({
      namespace: 'android_app',
      package_name: 'bet.unjuiced.calledit',
      sha256_cert_fingerprints: [fingerprint],
    });
  });

  it('passes the invite through the Play Store as install referrer', () => {
    expect(playStoreUrl(config, 'ABCD2345')).toBe(
      'https://play.google.com/store/apps/details?id=bet.unjuiced.calledit&referrer=invite%3DABCD2345',
    );
  });

  it('writes every file, with /join/* rewritten to the one page', () => {
    const files = buildSite(config);
    expect(files.map((f) => f.path)).toEqual([
      'index.html',
      'join/index.html',
      '.well-known/apple-app-site-association',
      '.well-known/assetlinks.json',
      '_redirects',
      '_headers',
      'vercel.json',
    ]);
    expect(files.find((f) => f.path === '_redirects')?.contents).toContain('/join/*  /join/index.html  200');
  });
});

/** Runs the join page's script against a tiny fake DOM. */
function runJoinPage(path: string, userAgent: string) {
  const html = joinPage(config);
  const script = /<script>([\s\S]*)<\/script>/.exec(html)![1];
  type El = { hidden: boolean; textContent: string; href: string; onClick?: () => void; addEventListener: unknown };
  const elements: Record<string, El> = {};
  for (const id of ['code', 'get', 'open', 'note', 'bad']) {
    elements[id] = {
      hidden: id !== 'get',
      textContent: '',
      href: '',
      addEventListener: (_: string, fn: () => void) => (elements[id].onClick = fn),
    };
  }
  const document = { getElementById: (id: string) => elements[id] };
  const written: string[] = [];
  const location = { pathname: path, href: '' };
  const navigator = {
    userAgent,
    clipboard: {
      writeText: (t: string) => {
        written.push(t);
        return { then: (ok: () => void) => ok() };
      },
    },
  };
  runInNewContext(script, { document, location, navigator });
  return { elements, location, written };
}

describe('join page', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)';
  const android = 'Mozilla/5.0 (Linux; Android 15; Pixel 9)';

  it('shows the code and an open-in-app link', () => {
    const { elements } = runJoinPage('/join/abcd2345', iphone);
    expect(elements.code.textContent).toBe('ABCD2345');
    expect(elements.open.href).toBe('calledit://join/ABCD2345');
    expect(elements.bad.hidden).toBe(true);
  });

  it('on iPhone copies the invite link, then opens the App Store', () => {
    const page = runJoinPage('/join/ABCD2345/', iphone);
    page.elements.get.onClick!();
    expect(page.written).toEqual(['https://invite.example.com/join/ABCD2345']);
    expect(page.location.href).toBe('https://apps.apple.com/app/id123456789');
  });

  it('on Android opens the Play Store with the invite as referrer', () => {
    const page = runJoinPage('/join/ABCD2345', android);
    page.elements.get.onClick!();
    expect(page.written).toEqual([]);
    expect(page.location.href).toBe(
      'https://play.google.com/store/apps/details?id=bet.unjuiced.calledit&referrer=invite%3DABCD2345',
    );
  });

  it('says so when the code is broken, and still links to the store', () => {
    const page = runJoinPage('/join/NOPE', iphone);
    expect(page.elements.bad.hidden).toBe(false);
    expect(page.elements.open.hidden).toBe(true);
    page.elements.get.onClick!();
    expect(page.written).toEqual([]);
    expect(page.location.href).toBe('https://apps.apple.com/app/id123456789');
  });

  it('escapes the app name in the page', () => {
    expect(joinPage({ ...config, appName: '<b>X</b>' })).not.toContain('<b>X</b>');
  });
});
