/**
 * Expo config plugin: Vision OCR
 *
 * Adds:
 * 1. NSCameraUsageDescription to Info.plist
 * 2. VisionOcrModule (Swift) + VisionOcrBridge (ObjC) to the main app target
 */

const {
  withInfoPlist,
  withXcodeProject,
  withDangerousMod,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

// ── 1. Info.plist ─────────────────────────────────────────────────────────────

function withVisionOcrPlist(config) {
  return withInfoPlist(config, (mod) => {
    mod.modResults.NSCameraUsageDescription =
      "MileClear uses the camera to scan receipts for expense tracking";
    return mod;
  });
}

// ── 2. Copy source files ──────────────────────────────────────────────────────

function withVisionOcrFiles(config) {
  return withDangerousMod(config, [
    "ios",
    (mod) => {
      const iosRoot = mod.modRequest.platformProjectRoot;
      const projectName = mod.modRequest.projectName;
      const pluginDir = __dirname;
      const nativeSrc = path.join(pluginDir, "native");

      // Copy to BOTH ios/ root and ios/<ProjectName>/ because the Xcode
      // group path resolution varies between Expo SDK versions.
      const mainAppDir = path.join(iosRoot, projectName);
      const destinations = [iosRoot, mainAppDir];

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

// ── 3. Xcode project modifications ───────────────────────────────────────────

function withVisionOcrXcode(config) {
  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const projectName = mod.modRequest.projectName;

    addNativeModuleToMainTarget(project, projectName);

    return mod;
  });
}

/**
 * Add the native module Swift + ObjC files to the main app target.
 */
function addNativeModuleToMainTarget(project, projectName) {
  const mainTargetKey = findMainTargetKey(project, projectName);
  if (!mainTargetKey) return;

  const mainGroupKey = findGroupByName(project, projectName);
  if (!mainGroupKey) return;

  const filesToAdd = [
    { name: "VisionOcrModule.swift", type: "sourcecode.swift" },
    { name: "VisionOcrBridge.m", type: "sourcecode.c.objc" },
  ];

  const mainSourcesPhase = findBuildPhase(project, mainTargetKey, "PBXSourcesBuildPhase");

  for (const file of filesToAdd) {
    // Skip if already added
    if (fileRefExists(project, file.name, projectName)) continue;

    const fileRefUuid = project.generateUuid();
    project.hash.project.objects.PBXFileReference[fileRefUuid] = {
      isa: "PBXFileReference",
      lastKnownFileType: file.type,
      path: file.name,
      sourceTree: '"<group>"',
    };
    project.hash.project.objects.PBXFileReference[`${fileRefUuid}_comment`] = file.name;

    // Add to main app group
    project.hash.project.objects.PBXGroup[mainGroupKey].children.push({
      value: fileRefUuid,
      comment: file.name,
    });

    // Add build file
    if (mainSourcesPhase) {
      const buildFileUuid = project.generateUuid();
      project.hash.project.objects.PBXBuildFile[buildFileUuid] = {
        isa: "PBXBuildFile",
        fileRef: fileRefUuid,
        fileRef_comment: file.name,
      };
      project.hash.project.objects.PBXBuildFile[`${buildFileUuid}_comment`] = `${file.name} in Sources`;

      const phase = project.hash.project.objects.PBXSourcesBuildPhase[mainSourcesPhase];
      phase.files.push({
        value: buildFileUuid,
        comment: `${file.name} in Sources`,
      });
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Export ────────────────────────────────────────────────────────────────────

module.exports = function withVisionOcr(config) {
  config = withVisionOcrPlist(config);
  config = withVisionOcrFiles(config);
  config = withVisionOcrXcode(config);
  return config;
};
