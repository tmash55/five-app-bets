// Pure helpers for scripts/new-app.mjs, kept separate so they can be tested.

export const SLUG_PATTERN = /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/;
// Reverse-DNS, each part starts with a letter: com.example.app
export const BUNDLE_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*){2,}$/;

/** Files and folders never copied from the template. */
export const SKIP = new Set(['node_modules', '.expo', 'dist', 'web-build', 'ios', 'android', 'coverage']);

export function shouldCopy(name) {
  if (SKIP.has(name)) return false;
  // Local env files hold the template's own keys.
  if (name.startsWith('.env') && name !== '.env.example') return false;
  return true;
}

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const [key, inline] = arg.slice(2).split('=', 2);
    if (inline !== undefined) {
      args[key] = inline;
    } else {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) throw new Error(`Missing value for --${key}`);
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

export function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Builds and validates the app.identity.json contents for a new app. */
export function buildIdentity(args) {
  const errors = [];
  const name = (args.name ?? '').trim();
  if (!name) errors.push('--name is required, for example --name "Called It".');

  const slug = args.slug ?? slugify(name);
  if ((name || args.slug) && !SLUG_PATTERN.test(slug)) {
    errors.push(`Slug "${slug}" must be 3-40 lowercase letters, digits or dashes, starting with a letter.`);
  }

  const bundleId = args['bundle-id'];
  if (!bundleId) {
    errors.push('--bundle-id is required, for example --bundle-id bet.unjuiced.calledit.');
  } else if (!BUNDLE_ID_PATTERN.test(bundleId)) {
    errors.push(`Bundle ID "${bundleId}" must look like com.company.app (letters and digits only).`);
  }

  const androidPackage = args['android-package'] ?? bundleId;
  if (androidPackage && !BUNDLE_ID_PATTERN.test(androidPackage)) {
    errors.push(`Android package "${androidPackage}" must look like com.company.app.`);
  }

  if (errors.length) {
    const error = new Error(errors.join('\n'));
    error.validation = errors;
    throw error;
  }

  return {
    name,
    slug,
    scheme: slug.replace(/-/g, ''),
    iosBundleIdentifier: bundleId,
    androidPackage,
  };
}

export function envFileFor(args) {
  const lines = [
    `EXPO_PUBLIC_SUPABASE_URL=${args['supabase-url'] ?? ''}`,
    `EXPO_PUBLIC_SUPABASE_ANON_KEY=${args['supabase-anon-key'] ?? ''}`,
    `EXPO_PUBLIC_REVENUECAT_IOS_KEY=${args['revenuecat-ios-key'] ?? ''}`,
    `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=${args['revenuecat-android-key'] ?? ''}`,
    `EXPO_PUBLIC_POSTHOG_KEY=${args['posthog-key'] ?? ''}`,
    `EXPO_PUBLIC_POSTHOG_HOST=${args['posthog-host'] ?? ''}`,
  ];
  return `${lines.join('\n')}\n`;
}
