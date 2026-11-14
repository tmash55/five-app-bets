// Metro config: adds the optional private roster pack.
//
// `@roster-extra` resolves to `private/roster/index.ts` when that folder exists
// on the machine doing the build (a family build), and to an empty pack
// otherwise. `private/` is gitignored, so store and CI builds can never
// include it.
const fs = require('node:fs');
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const privatePack = path.join(__dirname, 'private', 'roster', 'index.ts');
const emptyPack = path.join(__dirname, 'src', 'data', 'rosterExtra.empty.ts');
const usePrivate = process.env.BUCKET_SQUAD_PUBLIC !== '1' && fs.existsSync(privatePack);

const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@roster-extra') {
    return { type: 'sourceFile', filePath: usePrivate ? privatePack : emptyPack };
  }
  return upstream ? upstream(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
