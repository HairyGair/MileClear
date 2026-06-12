/**
 * Expo config plugin: modular headers for Google pods.
 *
 * Build 75 attempt 1 (12 Jun 2026) failed at INSTALL_PODS:
 *   "The Swift pod `AppCheckCore` depends upon `GoogleUtilities` and
 *    `RecaptchaInterop`, which do not define modules."
 *
 * AppCheckCore arrives transitively via the GoogleSignIn iOS SDK
 * (@react-native-google-signin) — which the product currently has feature-
 * disabled, but the pod still installs. A new upstream GoogleSignIn /
 * AppCheckCore release broke pod install under static libraries (the EAS
 * default); CocoaPods' own message prescribes the fix applied here:
 * `:modular_headers => true` for the two named pods. Scoped to exactly those
 * pods rather than `use_modular_headers!` globally, which is known to break
 * other pods in this stack.
 */

const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const MODULAR_PODS = ["GoogleUtilities", "RecaptchaInterop"];

module.exports = function withModularHeaders(config) {
  return withDangerousMod(config, [
    "ios",
    (mod) => {
      const podfilePath = path.join(mod.modRequest.platformProjectRoot, "Podfile");
      let contents = fs.readFileSync(podfilePath, "utf8");

      const lines = MODULAR_PODS.filter(
        (pod) => !contents.includes(`pod '${pod}', :modular_headers => true`)
      )
        .map((pod) => `  pod '${pod}', :modular_headers => true`)
        .join("\n");

      if (lines) {
        // Inside the app target, right after use_expo_modules! — the anchor
        // every Expo-generated Podfile has.
        if (!contents.includes("use_expo_modules!")) {
          throw new Error(
            "with-modular-headers: use_expo_modules! anchor not found in Podfile — Expo template changed, update this plugin."
          );
        }
        contents = contents.replace("use_expo_modules!", `use_expo_modules!\n${lines}`);
        fs.writeFileSync(podfilePath, contents);
      }
      return mod;
    },
  ]);
};
