/**
 * Expo config plugin: pin the Google Play Services location version that
 * react-native-background-geolocation compiles against. ANDROID ONLY.
 *
 * The bug this fixes (found on the emulator, 26 Jul 2026):
 *
 *   java.lang.IncompatibleClassChangeError: Found interface
 *   com.google.android.gms.location.FusedLocationProviderClient,
 *   but class was expected
 *
 * ...thrown from com.transistorsoft.locationmanager as soon as the location
 * and geofence managers initialise. Trip capture was dead on Android.
 *
 * Cause: two of our own dependencies disagree.
 *   - react-native-background-geolocation/android/build.gradle:16 defaults
 *     playServicesLocationVersion to "20.0.0"
 *   - expo-location/android/build.gradle:19 hard-declares
 *     play-services-location:21.0.1
 *
 * Gradle resolves to the highest (21.0.1), but RNBG had already compiled
 * itself for 20.x, where FusedLocationProviderClient was a CLASS. In 21.x it
 * became an INTERFACE. The bytecode looks for a class, finds an interface,
 * and throws at runtime rather than build time - which is why the build was
 * green and the app still died.
 *
 * RNBG handles 21.x correctly when it knows about it: build.gradle:77 has an
 * explicit `if (locationMajorVersion >= 21)` branch. It just reads the
 * version from a Gradle ext property nothing in this project was setting.
 * Declaring it here makes RNBG compile the branch that matches the version
 * actually shipped.
 *
 * Keep this value in step with expo-location's declared version. If a future
 * Expo SDK bumps play-services-location, update it here too, or the same
 * crash returns in a slightly different shape.
 */

const { withProjectBuildGradle } = require("@expo/config-plugins");

// Must match expo-location/android/build.gradle.
const PLAY_SERVICES_LOCATION_VERSION = "21.0.1";

const withPlayServicesLocationVersion = (config) =>
  withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") {
      throw new Error(
        "with-play-services-location-version: expected a Groovy build.gradle",
      );
    }

    if (cfg.modResults.contents.includes("playServicesLocationVersion")) {
      return cfg; // already pinned, nothing to do
    }

    // RNBG reads `rootProject.ext` (safeExtGet, its build.gradle:31). Expo's
    // generated root build.gradle has no ext block at all, so one has to be
    // created rather than extended - an earlier version of this plugin
    // searched for `ext {`, matched nothing, and silently did nothing.
    const marker = "buildscript {";
    if (!cfg.modResults.contents.includes(marker)) {
      throw new Error(
        "with-play-services-location-version: no buildscript block found in the root build.gradle",
      );
    }

    cfg.modResults.contents = cfg.modResults.contents.replace(
      marker,
      `${marker}\n  ext {\n    // See plugins/with-play-services-location-version.\n    playServicesLocationVersion = "${PLAY_SERVICES_LOCATION_VERSION}"\n  }`,
    );

    if (!cfg.modResults.contents.includes("playServicesLocationVersion")) {
      throw new Error(
        "with-play-services-location-version: failed to inject the property",
      );
    }

    return cfg;
  });

module.exports = withPlayServicesLocationVersion;
