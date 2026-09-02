// App entry. Registers the Android headless handler for the native location
// SDK BEFORE expo-router mounts anything, because a headless start (device
// reboot, process killed and recreated, heartbeat while the app is not
// running) loads this bundle and runs ONLY the registered task - no layout,
// no React tree. See lib/tracking/nativeHeadless.ts for why that matters.
import "./lib/tracking/nativeHeadless";
import "expo-router/entry";
