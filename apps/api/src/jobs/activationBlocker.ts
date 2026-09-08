// What stands between a zero-trip account and its first recorded drive.
//
// Kept free of imports so the activation jobs' one piece of judgement can be
// unit-tested without mocking Prisma, push and Discord.
//
// Three blockers, in the order they are checked:
//
//   web_only       - signed up on the website and the app has never phoned
//                    home. The website only shows what the app recorded, so
//                    the useful thing to tell them is where the app is.
//   no_permission  - the app is installed but cannot see location in the
//                    background, so nothing records by itself. The one switch.
//   no_drive_yet   - installed, permitted, and still nothing. Either they have
//                    not driven since, or they drove without the phone
//                    noticing; the low-effort path is adding a past drive.
//
// "none" means they have a trip and are not this job's problem.

export type ActivationBlocker = "web_only" | "no_permission" | "no_drive_yet" | "none";

export interface ActivationBlockerInput {
  tripCount: number;
  lastHeartbeatAt: Date | null;
  signupPlatform: string | null;
  /** Comma-separated platform list as stored on users.platformsSeen. */
  platformsSeen: string | null;
  bgLocationPermission: string | null;
  /** A push token is proof the app is installed, whatever the other columns say. */
  pushToken: string | null;
  /** The diagnostic dump's own permission snapshot, when one exists. */
  dump?: { capturedAt: Date; backgroundPermission: unknown } | null;
}

function seenOnMobile(platformsSeen: string | null): boolean {
  const seen = (platformsSeen ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  return seen.includes("ios") || seen.includes("android");
}

/**
 * The heartbeat's permission reading can be hours stale, and the gap is
 * exactly when someone has just fixed it (Rakesh Patel, 18 Aug 2026: granted
 * Always at 10:04, heartbeat still said "undetermined"). The dump carries its
 * own snapshot; where it is newer than the heartbeat, believe the dump.
 */
export function effectiveBgPermission(u: ActivationBlockerInput): string | null {
  const dump = u.dump;
  if (dump && (!u.lastHeartbeatAt || dump.capturedAt > u.lastHeartbeatAt)) {
    return typeof dump.backgroundPermission === "string" ? dump.backgroundPermission : null;
  }
  return u.bgLocationPermission;
}

export function classifyActivationBlocker(u: ActivationBlockerInput): ActivationBlocker {
  if (u.tripCount > 0) return "none";

  const appInstalled = u.lastHeartbeatAt !== null || u.pushToken !== null || u.dump != null;
  if (!appInstalled && (u.signupPlatform === "web" || !seenOnMobile(u.platformsSeen))) {
    return "web_only";
  }

  if (effectiveBgPermission(u) !== "granted") return "no_permission";
  return "no_drive_yet";
}
