// Expo config plugin: give the widget extension its own PrivacyInfo.xcprivacy.
//
// WHY THIS EXISTS
//
// app.json `ios.privacyManifests` is handled natively in SDK 57, but core Expo's
// `withPrivacyInfo` writes exactly one manifest, into `ios/<ProjectName>/`, and attaches it
// to the **app** target only. `ExpoWidgetsTarget` is a separately linked binary: it embeds
// the expo-widgets runtime, and expo-widgets ships no privacy manifest of its own. Its
// `WidgetsStorage` reads and writes the App Group's UserDefaults suite, which is a
// required-reason API (NSPrivacyAccessedAPICategoryUserDefaults, reason 1C8F.1 — the App
// Group variant, which nothing in node_modules declares).
//
// The extension is also, deliberately, not a collector: it only reads what the app already
// put in the shared container. So NSPrivacyCollectedDataTypes is empty here, and the real
// collection declarations live in app.json for the app target.
//
// expo-widgets builds its target by hand and gives it no PBXResourcesBuildPhase at all, so
// there is nowhere to attach a resource until one is created. That is the only structural
// change this plugin makes, and it is skipped if a Resources phase already exists.

const fs = require('node:fs');
const path = require('node:path');

const { withDangerousMod, withXcodeProject, IOSConfig } = require('expo/config-plugins');
const plist = require('@expo/plist').default ?? require('@expo/plist');

// Must match the hardcoded target name in expo-widgets'
// plugin/src/ios/withIosWidgets.ts. If expo-widgets ever renames it, this plugin warns
// rather than silently doing nothing.
const TARGET_NAME = 'ExpoWidgetsTarget';
const MANIFEST_NAME = 'PrivacyInfo.xcprivacy';

const WIDGET_PRIVACY_MANIFEST = {
  NSPrivacyTracking: false,
  NSPrivacyTrackingDomains: [],
  NSPrivacyCollectedDataTypes: [],
  NSPrivacyAccessedAPITypes: [
    {
      // expo-widgets' WidgetsStorage: UserDefaults(suiteName: group.com.nikhilsinha.bundles)
      NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
      NSPrivacyAccessedAPITypeReasons: ['1C8F.1'],
    },
    {
      // expo-modules-core's PersistentFileLog stats files inside the container.
      NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
      NSPrivacyAccessedAPITypeReasons: ['C617.1'],
    },
  ],
};

/** Write the manifest next to the extension's generated Swift sources. */
const withWidgetPrivacyFile = (config) =>
  withDangerousMod(config, [
    'ios',
    (cfg) => {
      const targetDir = path.join(cfg.modRequest.platformProjectRoot, TARGET_NAME);
      if (!fs.existsSync(targetDir)) {
        console.warn(
          `[with-widget-privacy-manifest] ${targetDir} does not exist, so no manifest was ` +
            `written. This plugin must be listed BEFORE expo-widgets in app.json "plugins" ` +
            `(mods run last-registered-first, so earlier in the array runs later).`
        );
        return cfg;
      }
      fs.writeFileSync(
        path.join(targetDir, MANIFEST_NAME),
        plist.build(WIDGET_PRIVACY_MANIFEST),
        'utf8'
      );
      return cfg;
    },
  ]);

/** Reference the manifest from the extension target so it is actually copied into the .appex. */
const withWidgetPrivacyResource = (config) =>
  withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;

    const entry = IOSConfig.Target.getNativeTargets(project).find(
      ([, target]) => target.name?.replace(/^"(.*)"$/, '$1') === TARGET_NAME
    );
    if (!entry) {
      console.warn(
        `[with-widget-privacy-manifest] no "${TARGET_NAME}" target in the project; ` +
          `skipping. The extension will ship without a privacy manifest.`
      );
      return cfg;
    }
    const [targetUuid] = entry;

    // A file already linked here means a previous prebuild did this; adding it twice
    // produces a duplicate-resource build failure, which is much worse than doing nothing.
    const relativePath = `${TARGET_NAME}/${MANIFEST_NAME}`;
    if (project.hasFile(relativePath)) return cfg;

    // expo-widgets creates the extension with only Sources / Frameworks / Copy-Pods phases —
    // it has no Resources phase at all, and there is nowhere to put a resource until one
    // exists.
    //
    // Detect that with `buildPhase()`, NOT `pbxResourcesBuildPhaseObj()`. The latter looks
    // up the target's own phases first, and when the target has none it does not fail — it
    // falls through to returning the FIRST 'Resources' phase in the whole project, which is
    // the app target's. Using it here silently copied the widget's manifest into the app
    // bundle and left the .appex with none: the exact bug this plugin exists to fix, in a
    // form that looks like success. (Caught by running this against the real pbxproj.)
    if (!project.buildPhase('Resources', targetUuid)) {
      project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', targetUuid);
    }

    IOSConfig.XcodeUtils.addResourceFileToGroup({
      filepath: relativePath,
      groupName: TARGET_NAME,
      isBuildFile: true,
      project,
      targetUuid,
    });

    console.log(`[with-widget-privacy-manifest] attached ${relativePath} to ${TARGET_NAME}.`);
    return cfg;
  });

// Composed by hand rather than with `withPlugins`, which routes function plugins through
// withStaticPlugin and asserts on `_internal.projectRoot` — an assertion that only holds
// under a real prebuild, and makes the plugin untestable in isolation for no benefit.
// The dangerous mod (file) always runs before the xcodeproj mod (reference) regardless of
// registration order: the mod compiler pins "dangerous" first.
module.exports = (config) => withWidgetPrivacyResource(withWidgetPrivacyFile(config));
