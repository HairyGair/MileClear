/**
 * Expo config plugin: declare English (UK) as the app's language on Android.
 * ANDROID ONLY. Needs a new native build (not an OTA).
 *
 * Why: the app is written in British English only and had no language
 * declared on Android (iOS declares English by default), so an accessibility
 * audit flagged that TalkBack has nothing to go on except the phone's own
 * language. This adds the Android 13+ per-app locale list (res/xml/
 * locales_config.xml, referenced by android:localeConfig) with one entry,
 * en-GB. Older Android versions ignore the attribute.
 *
 * What it does not do: React Native has no way to tag a single piece of text
 * with a language on Android (accessibilityLanguage is iOS only). Whether
 * TalkBack then speaks with an English voice on a phone set to another
 * language has to be checked on a device.
 */

const fs = require("fs");
const path = require("path");
const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");

const LOCALES_XML = `<?xml version="1.0" encoding="utf-8"?>
<locale-config xmlns:android="http://schemas.android.com/apk/res/android">
  <locale android:name="en-GB" />
</locale-config>
`;

module.exports = function withAndroidEnglish(config) {
  config = withAndroidManifest(config, (c) => {
    const app = c.modResults.manifest.application?.[0];
    if (app) app.$["android:localeConfig"] = "@xml/locales_config";
    return c;
  });
  config = withDangerousMod(config, [
    "android",
    async (c) => {
      const dir = path.join(c.modRequest.platformProjectRoot, "app", "src", "main", "res", "xml");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "locales_config.xml"), LOCALES_XML);
      return c;
    },
  ]);
  return config;
};
