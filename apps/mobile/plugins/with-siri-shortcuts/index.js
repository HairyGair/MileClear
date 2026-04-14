/**
 * Expo config plugin: Siri Shortcuts via App Intents
 *
 * Adds:
 * 1. App Groups entitlement (group.com.mileclear.app) to the main app
 * 2. Native module files (SiriModule, SiriBridge, SiriIntents, AppShortcuts,
 *    SiriApiClient) copied into ios/ and ios/<ProjectName>/
 * 3. All Swift + ObjC files registered in the main app Xcode target's
 *    Sources build phase
 *
 * No separate extension target is needed - App Intents live in the main app.
 */

const {
  withEntitlementsPlist,
  withXcodeProject,
  withDangerousMod,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

// ── 1. App Groups entitlement ────────────────────────────────────────────────

function withSiriEntitlements(config) {
  return withEntitlementsPlist(config, (mod) => {
    mod.modResults["com.apple.security.application-groups"] = [
      "group.com.mileclear.app",
    ];
    return mod;
  });
}

// ── 2. Copy source files ─────────────────────────────────────────────────────

function withSiriFiles(config) {
  return withDangerousMod(config, [
    "ios",
    (mod) => {
      const iosRoot = mod.modRequest.platformProjectRoot;
      const projectName = mod.modRequest.projectName;
      const pluginDir = __dirname;

      // Copy native module files to BOTH ios/ root and ios/<ProjectName>/
      // because Xcode group path resolution varies between Expo SDK versions.
      const nativeSrc = path.join(pluginDir, "native");
      const destinations = [iosRoot, path.join(iosRoot, projectName)];

      for (const dest of destinations) {
        fs.mkdirSync(dest, { recursive: true });
        for (const file of fs.readdirSync(nativeSrc)) {
          fs.copyFileSync(
            path.join(nativeSrc, file),
            path.join(dest, file)
          );
        }
      }

      return mod;
    },
  ]);
}

// ── 3. Xcode project modifications ──────────────────────────────────────────

function withSiriXcode(config) {
  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const projectName = mod.modRequest.projectName;

    addSiriFilesToMainTarget(project, projectName);

    return mod;
  });
}

/**
 * Add all Siri Swift + ObjC files to the main app target's Sources build phase.
 */
function addSiriFilesToMainTarget(project, projectName) {
  const mainTargetKey = findMainTargetKey(project, projectName);
  if (!mainTargetKey) return;

  const mainGroupKey = findGroupByName(project, projectName);
  if (!mainGroupKey) return;

  const filesToAdd = [
    { name: "SiriIntents.swift", type: "sourcecode.swift" },
    { name: "AppShortcuts.swift", type: "sourcecode.swift" },
    { name: "SiriApiClient.swift", type: "sourcecode.swift" },
    { name: "SiriModule.swift", type: "sourcecode.swift" },
    { name: "SiriBridge.m", type: "sourcecode.c.objc" },
  ];

  const mainSourcesPhase = findBuildPhase(
    project,
    mainTargetKey,
    "PBXSourcesBuildPhase"
  );

  for (const file of filesToAdd) {
    // Skip if already registered in the Xcode project
    if (fileRefExists(project, file.name, projectName)) continue;

    const fileRefUuid = project.generateUuid();
    project.hash.project.objects.PBXFileReference[fileRefUuid] = {
      isa: "PBXFileReference",
      lastKnownFileType: file.type,
      path: file.name,
      sourceTree: '"<group>"',
    };
    project.hash.project.objects.PBXFileReference[`${fileRefUuid}_comment`] =
      file.name;

    // Add to main app group
    project.hash.project.objects.PBXGroup[mainGroupKey].children.push({
      value: fileRefUuid,
      comment: file.name,
    });

    // Add build file and register in Sources phase
    if (mainSourcesPhase) {
      const buildFileUuid = project.generateUuid();
      project.hash.project.objects.PBXBuildFile[buildFileUuid] = {
        isa: "PBXBuildFile",
        fileRef: fileRefUuid,
        fileRef_comment: file.name,
      };
      project.hash.project.objects.PBXBuildFile[`${buildFileUuid}_comment`] =
        `${file.name} in Sources`;

      const phase =
        project.hash.project.objects.PBXSourcesBuildPhase[mainSourcesPhase];
      phase.files.push({
        value: buildFileUuid,
        comment: `${file.name} in Sources`,
      });
    }
  }
}

// ── Helpers (same pattern as with-live-activities) ───────────────────────────

function findMainTargetKey(project, projectName) {
  const targets = project.hash.project.objects.PBXNativeTarget || {};
  return Object.keys(targets).find(
    (k) =>
      !k.endsWith("_comment") &&
      (targets[k].name === projectName ||
        targets[k].name === `"${projectName}"` ||
        targets[k].productType === '"com.apple.product-type.application"')
  );
}

function findGroupByName(project, name) {
  const groups = project.hash.project.objects.PBXGroup || {};
  return Object.keys(groups).find(
    (k) =>
      !k.endsWith("_comment") &&
      (groups[k].name === name ||
        groups[k].name === `"${name}"` ||
        groups[k].path === name ||
        groups[k].path === `"${name}"`)
  );
}

function findBuildPhase(project, targetKey, phaseType) {
  const target = project.hash.project.objects.PBXNativeTarget[targetKey];
  if (!target) return null;
  const phases = project.hash.project.objects[phaseType] || {};
  for (const bp of target.buildPhases || []) {
    const key = typeof bp === "object" ? bp.value : bp;
    if (phases[key]) return key;
  }
  return null;
}

function fileRefExists(project, fileName, groupPath) {
  const groups = project.hash.project.objects.PBXGroup || {};
  const groupKey = findGroupByName(project, groupPath);
  if (!groupKey) return false;
  const group = groups[groupKey];
  if (!group || !group.children) return false;
  const refs = project.hash.project.objects.PBXFileReference || {};
  return group.children.some((child) => {
    const key = typeof child === "object" ? child.value : child;
    const ref = refs[key];
    return ref && (ref.path === fileName || ref.path === `"${fileName}"`);
  });
}

// ── Export ───────────────────────────────────────────────────────────────────

module.exports = function withSiriShortcuts(config) {
  config = withSiriEntitlements(config);
  config = withSiriFiles(config);
  config = withSiriXcode(config);
  return config;
};
