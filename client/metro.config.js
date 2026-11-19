// Metro config for the npm-workspaces monorepo plus one resolver fix.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Watch the whole workspace so @badmintonsmash/shared (symlinked) rebuilds on change.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules'), path.resolve(workspaceRoot, 'node_modules')];

// aws-amplify's dependencies import helpers from tslib. In the Node bundle used for static
// web rendering Metro resolves tslib to its ESM build, which has no default export and fails with
// "Cannot destructure property '__extends'". Always use the CommonJS build.
const tslibCjs = require.resolve('tslib');
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'tslib') {
    return { type: 'sourceFile', filePath: tslibCjs };
  }
  return (upstreamResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
