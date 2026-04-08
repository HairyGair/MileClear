/**
 * Expo config plugin: Live Activities (Dynamic Island)
 *
 * Adds:
 * 1. NSSupportsLiveActivities to Info.plist
 * 2. Widget extension target (MileClearWidgets) to the Xcode project
 * 3. Native module (LiveActivityModule) bridging ActivityKit to React Native
 * 4. Copies all Swift source files into the ios/ directory
 */

const {
  withInfoPlist,
  withXcodeProject,
  withDangerousMod,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const WIDGET_TARGET = "MileClearWidgets";
const WIDGET_BUNDLE_ID = "com.mileclear.app.MileClearWidgets";

// ── 1. Info.plist ────────────────────────────────────────────────────────────

function withLiveActivitiesPlist(config) {
  return withInfoPlist(config, (mod) => {
    mod.modResults.NSSupportsLiveActivities = true;
    return mod;
  });
}

// ── 2. Copy source files ─────────────────────────────────────────────────────

function withLiveActivitiesFiles(config) {
  return withDangerousMod(config, [
    "ios",
    (mod) => {
      const iosRoot = mod.modRequest.platformProjectRoot;
      const projectName = mod.modRequest.projectName;
      const pluginDir = __dirname;

      // Copy widget extension files
      const widgetDest = path.join(iosRoot, WIDGET_TARGET);
      fs.mkdirSync(widgetDest, { recursive: true });
      const widgetSrc = path.join(pluginDir, "widget");
      for (const file of fs.readdirSync(widgetSrc)) {
        fs.copyFileSync(
          path.join(widgetSrc, file),
          path.join(widgetDest, file)
        );
      }

      // Copy shared Attributes + LiveActivityIntents + native module files to main app.
      // Copy to BOTH ios/ root and ios/<ProjectName>/ because the Xcode
      // group path resolution varies between Expo SDK versions.
      // LiveActivityIntents.swift must be in both the widget target (so the
      // widget can invoke them from buttons) and the main app target (so
      // iOS can resolve the same intent type when the app is opened via
      // openAppWhenRun).
      const mainAppDir = path.join(iosRoot, projectName);
      const destinations = [iosRoot, mainAppDir];

      for (const dest of destinations) {
        fs.mkdirSync(dest, { recursive: true });
        fs.copyFileSync(
          path.join(widgetSrc, "MileClearAttributes.swift"),
          path.join(dest, "MileClearAttributes.swift")
        );
        fs.copyFileSync(
          path.join(widgetSrc, "LiveActivityIntents.swift"),
          path.join(dest, "LiveActivityIntents.swift")
        );
        const nativeSrc = path.join(pluginDir, "native");
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

function withLiveActivitiesXcode(config) {
  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const projectName = mod.modRequest.projectName;

    addNativeModuleToMainTarget(project, projectName);
    addWidgetExtensionTarget(project, projectName, config);

    return mod;
  });
}

/**
 * Add the native module Swift + ObjC files to the main app target
 */
function addNativeModuleToMainTarget(project, projectName) {
  const mainTargetKey = findMainTargetKey(project, projectName);
  if (!mainTargetKey) return;

  const mainGroupKey = findGroupByName(project, projectName);
  if (!mainGroupKey) return;

  const filesToAdd = [
    { name: "MileClearAttributes.swift", type: "sourcecode.swift" },
    { name: "LiveActivityIntents.swift", type: "sourcecode.swift" },
    { name: "LiveActivityModule.swift", type: "sourcecode.swift" },
    { name: "LiveActivityBridge.m", type: "sourcecode.c.objc" },
  ];

  const mainSourcesPhase = findBuildPhase(project, mainTargetKey, "PBXSourcesBuildPhase");

  for (const file of filesToAdd) {
    // Check if already added
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

/**
 * Create the MileClearWidgets extension target in the Xcode project.
 */
function addWidgetExtensionTarget(project, projectName, config) {
  // Skip if target already exists
  const existingTarget = findTargetByName(project, WIDGET_TARGET);
  if (existingTarget) return;

  const swiftFiles = [
    "MileClearWidgetsBundle.swift",
    "MileClearAttributes.swift",
    "LiveActivityIntents.swift",
    "LiveActivityView.swift",
  ];

  // ── File references ──

  const fileRefUuids = {};
  for (const file of swiftFiles) {
    const uuid = project.generateUuid();
    project.hash.project.objects.PBXFileReference[uuid] = {
      isa: "PBXFileReference",
      lastKnownFileType: "sourcecode.swift",
      path: file,
      sourceTree: '"<group>"',
    };
    project.hash.project.objects.PBXFileReference[`${uuid}_comment`] = file;
    fileRefUuids[file] = uuid;
  }

  const infoPlistUuid = project.generateUuid();
  project.hash.project.objects.PBXFileReference[infoPlistUuid] = {
    isa: "PBXFileReference",
    lastKnownFileType: "text.plist.xml",
    path: "Info.plist",
    sourceTree: '"<group>"',
  };
  project.hash.project.objects.PBXFileReference[`${infoPlistUuid}_comment`] = "Info.plist";

  // ── Group ──

  const groupChildren = swiftFiles.map((f) => ({
    value: fileRefUuids[f],
    comment: f,
  }));
  groupChildren.push({ value: infoPlistUuid, comment: "Info.plist" });

  const groupUuid = project.generateUuid();
  project.hash.project.objects.PBXGroup[groupUuid] = {
    isa: "PBXGroup",
    children: groupChildren,
    path: WIDGET_TARGET,
    sourceTree: '"<group>"',
  };
  project.hash.project.objects.PBXGroup[`${groupUuid}_comment`] = WIDGET_TARGET;

  // Add group to main project group
  const mainGroupUuid = project.getFirstProject().firstProject.mainGroup;
  project.hash.project.objects.PBXGroup[mainGroupUuid].children.push({
    value: groupUuid,
    comment: WIDGET_TARGET,
  });

  // ── Build files ──

  const buildFileUuids = {};
  for (const file of swiftFiles) {
    const uuid = project.generateUuid();
    project.hash.project.objects.PBXBuildFile[uuid] = {
      isa: "PBXBuildFile",
      fileRef: fileRefUuids[file],
      fileRef_comment: file,
    };
    project.hash.project.objects.PBXBuildFile[`${uuid}_comment`] = `${file} in Sources`;
    buildFileUuids[file] = uuid;
  }

  // ── Build phases ──

  const sourcesBPUuid = project.generateUuid();
  ensureSection(project, "PBXSourcesBuildPhase");
  project.hash.project.objects.PBXSourcesBuildPhase[sourcesBPUuid] = {
    isa: "PBXSourcesBuildPhase",
    buildActionMask: 2147483647,
    files: swiftFiles.map((f) => ({
      value: buildFileUuids[f],
      comment: `${f} in Sources`,
    })),
    runOnlyForDeploymentPostprocessing: 0,
  };
  project.hash.project.objects.PBXSourcesBuildPhase[`${sourcesBPUuid}_comment`] = "Sources";

  const frameworksBPUuid = project.generateUuid();
  ensureSection(project, "PBXFrameworksBuildPhase");
  project.hash.project.objects.PBXFrameworksBuildPhase[frameworksBPUuid] = {
    isa: "PBXFrameworksBuildPhase",
    buildActionMask: 2147483647,
    files: [],
    runOnlyForDeploymentPostprocessing: 0,
  };
  project.hash.project.objects.PBXFrameworksBuildPhase[`${frameworksBPUuid}_comment`] = "Frameworks";

  const resourcesBPUuid = project.generateUuid();
  ensureSection(project, "PBXResourcesBuildPhase");
  project.hash.project.objects.PBXResourcesBuildPhase[resourcesBPUuid] = {
    isa: "PBXResourcesBuildPhase",
    buildActionMask: 2147483647,
    files: [],
    runOnlyForDeploymentPostprocessing: 0,
  };
  project.hash.project.objects.PBXResourcesBuildPhase[`${resourcesBPUuid}_comment`] = "Resources";

  // ── Product reference ──

  const productUuid = project.generateUuid();
  project.hash.project.objects.PBXFileReference[productUuid] = {
    isa: "PBXFileReference",
    explicitFileType: "\"wrapper.app-extension\"",
    includeInIndex: 0,
    path: `${WIDGET_TARGET}.appex`,
    sourceTree: "BUILT_PRODUCTS_DIR",
  };
  project.hash.project.objects.PBXFileReference[`${productUuid}_comment`] = `${WIDGET_TARGET}.appex`;

  // Add to Products group
  const productsGroupKey = findGroupByName(project, "Products");
  if (productsGroupKey) {
    project.hash.project.objects.PBXGroup[productsGroupKey].children.push({
      value: productUuid,
      comment: `${WIDGET_TARGET}.appex`,
    });
  }

  // ── Build configurations ──

  const commonSettings = {
    CLANG_CXX_LANGUAGE_STANDARD: '"gnu++20"',
    CODE_SIGN_STYLE: "Automatic",
    DEVELOPMENT_TEAM: "EG4MH38B54",
    CURRENT_PROJECT_VERSION: config.ios?.buildNumber || "1",
    GENERATE_INFOPLIST_FILE: "YES",
    INFOPLIST_FILE: `${WIDGET_TARGET}/Info.plist`,
    INFOPLIST_KEY_CFBundleDisplayName: "MileClear",
    INFOPLIST_KEY_NSHumanReadableCopyright: '""',
    IPHONEOS_DEPLOYMENT_TARGET: "16.2",
    LD_RUNPATH_SEARCH_PATHS: '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"',
    MARKETING_VERSION: "1.0",
    PRODUCT_BUNDLE_IDENTIFIER: `"${WIDGET_BUNDLE_ID}"`,
    PRODUCT_NAME: '"$(TARGET_NAME)"',
    SKIP_INSTALL: "YES",
    SWIFT_EMIT_LOC_STRINGS: "YES",
    SWIFT_VERSION: "5.0",
    TARGETED_DEVICE_FAMILY: '"1"',
  };

  const debugConfigUuid = project.generateUuid();
  project.hash.project.objects.XCBuildConfiguration[debugConfigUuid] = {
    isa: "XCBuildConfiguration",
    buildSettings: {
      ...commonSettings,
      DEBUG_INFORMATION_FORMAT: "dwarf",
      SWIFT_OPTIMIZATION_LEVEL: '"-Onone"',
    },
    name: "Debug",
  };
  project.hash.project.objects.XCBuildConfiguration[`${debugConfigUuid}_comment`] = "Debug";

  const releaseConfigUuid = project.generateUuid();
  project.hash.project.objects.XCBuildConfiguration[releaseConfigUuid] = {
    isa: "XCBuildConfiguration",
    buildSettings: {
      ...commonSettings,
      SWIFT_OPTIMIZATION_LEVEL: '"-Owholemodule"',
    },
    name: "Release",
  };
  project.hash.project.objects.XCBuildConfiguration[`${releaseConfigUuid}_comment`] = "Release";

  const configListUuid = project.generateUuid();
  project.hash.project.objects.XCConfigurationList[configListUuid] = {
    isa: "XCConfigurationList",
    buildConfigurations: [
      { value: debugConfigUuid, comment: "Debug" },
      { value: releaseConfigUuid, comment: "Release" },
    ],
    defaultConfigurationIsVisible: 0,
    defaultConfigurationName: "Release",
  };
  project.hash.project.objects.XCConfigurationList[`${configListUuid}_comment`] = `Build configuration list for PBXNativeTarget "${WIDGET_TARGET}"`;

  // ── Native target ──

  const targetUuid = project.generateUuid();
  project.hash.project.objects.PBXNativeTarget[targetUuid] = {
    isa: "PBXNativeTarget",
    buildConfigurationList: configListUuid,
    buildConfigurationList_comment: `Build configuration list for PBXNativeTarget "${WIDGET_TARGET}"`,
    buildPhases: [
      { value: sourcesBPUuid, comment: "Sources" },
      { value: frameworksBPUuid, comment: "Frameworks" },
      { value: resourcesBPUuid, comment: "Resources" },
    ],
    buildRules: [],
    dependencies: [],
    name: `"${WIDGET_TARGET}"`,
    productName: `"${WIDGET_TARGET}"`,
    productReference: productUuid,
    productReference_comment: `${WIDGET_TARGET}.appex`,
    productType: '"com.apple.product-type.app-extension"',
  };
  project.hash.project.objects.PBXNativeTarget[`${targetUuid}_comment`] = WIDGET_TARGET;

  // Add to project targets
  const projectObj = project.getFirstProject().firstProject;
  projectObj.targets.push({
    value: targetUuid,
    comment: WIDGET_TARGET,
  });

  // ── Target dependency + embed ──

  const mainTargetKey = findMainTargetKey(project, projectName);
  if (!mainTargetKey) return;

  const rootObjectKey =
    Object.keys(project.hash.project.objects.PBXProject || {}).find(
      (k) => !k.endsWith("_comment")
    ) || projectObj.rootObject;

  // Container item proxy
  const proxyUuid = project.generateUuid();
  ensureSection(project, "PBXContainerItemProxy");
  project.hash.project.objects.PBXContainerItemProxy[proxyUuid] = {
    isa: "PBXContainerItemProxy",
    containerPortal: rootObjectKey,
    containerPortal_comment: "Project object",
    proxyType: 1,
    remoteGlobalIDString: targetUuid,
    remoteInfo: `"${WIDGET_TARGET}"`,
  };
  project.hash.project.objects.PBXContainerItemProxy[`${proxyUuid}_comment`] = "PBXContainerItemProxy";

  // Target dependency
  const depUuid = project.generateUuid();
  ensureSection(project, "PBXTargetDependency");
  project.hash.project.objects.PBXTargetDependency[depUuid] = {
    isa: "PBXTargetDependency",
    target: targetUuid,
    target_comment: WIDGET_TARGET,
    targetProxy: proxyUuid,
    targetProxy_comment: "PBXContainerItemProxy",
  };
  project.hash.project.objects.PBXTargetDependency[`${depUuid}_comment`] = "PBXTargetDependency";

  const mainTarget = project.hash.project.objects.PBXNativeTarget[mainTargetKey];
  mainTarget.dependencies = mainTarget.dependencies || [];
  mainTarget.dependencies.push({
    value: depUuid,
    comment: "PBXTargetDependency",
  });

  // Embed App Extensions build phase
  const embedBuildFileUuid = project.generateUuid();
  project.hash.project.objects.PBXBuildFile[embedBuildFileUuid] = {
    isa: "PBXBuildFile",
    fileRef: productUuid,
    fileRef_comment: `${WIDGET_TARGET}.appex`,
    settings: { ATTRIBUTES: ["RemoveHeadersOnCopy"] },
  };
  project.hash.project.objects.PBXBuildFile[`${embedBuildFileUuid}_comment`] = `${WIDGET_TARGET}.appex in Embed App Extensions`;

  const embedPhaseUuid = project.generateUuid();
  ensureSection(project, "PBXCopyFilesBuildPhase");
  project.hash.project.objects.PBXCopyFilesBuildPhase[embedPhaseUuid] = {
    isa: "PBXCopyFilesBuildPhase",
    buildActionMask: 2147483647,
    dstPath: '""',
    dstSubfolderSpec: 13,
    files: [
      {
        value: embedBuildFileUuid,
        comment: `${WIDGET_TARGET}.appex in Embed App Extensions`,
      },
    ],
    name: '"Embed App Extensions"',
    runOnlyForDeploymentPostprocessing: 0,
  };
  project.hash.project.objects.PBXCopyFilesBuildPhase[`${embedPhaseUuid}_comment`] = "Embed App Extensions";

  mainTarget.buildPhases.push({
    value: embedPhaseUuid,
    comment: "Embed App Extensions",
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ensureSection(project, name) {
  if (!project.hash.project.objects[name]) {
    project.hash.project.objects[name] = {};
  }
}

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

function findTargetByName(project, name) {
  const targets = project.hash.project.objects.PBXNativeTarget || {};
  return Object.keys(targets).find(
    (k) =>
      !k.endsWith("_comment") &&
      (targets[k].name === name || targets[k].name === `"${name}"`)
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

module.exports = function withLiveActivities(config) {
  config = withLiveActivitiesPlist(config);
  config = withLiveActivitiesFiles(config);
  config = withLiveActivitiesXcode(config);
  return config;
};
