const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const fs = require("fs");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Monorepo: watch the entire repo so shared packages and hoisted deps resolve
config.watchFolders = [monorepoRoot];

// Resolve from project node_modules first, then monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// pnpm creates symlinks that cause Metro to bundle duplicate copies of React.
// Force ALL react/react-native imports to resolve to the mobile app's copy.
const mobileReactDir = fs.realpathSync(
  path.resolve(projectRoot, "node_modules/react")
);
const mobileRNDir = fs.realpathSync(
  path.resolve(projectRoot, "node_modules/react-native")
);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Pin react to the mobile app's single copy
  if (moduleName === "react" || moduleName.startsWith("react/")) {
    const subpath = moduleName === "react" ? "" : moduleName.slice("react".length);
    return context.resolveRequest(
      { ...context, originModulePath: path.join(mobileReactDir, "index.js") },
      moduleName,
      platform,
    );
  }
  // Pin react-native to the mobile app's single copy
  if (moduleName === "react-native" || moduleName.startsWith("react-native/")) {
    return context.resolveRequest(
      { ...context, originModulePath: path.join(mobileRNDir, "index.js") },
      moduleName,
      platform,
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
