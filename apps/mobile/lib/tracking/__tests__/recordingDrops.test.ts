// The Android no_coords drop must be queued before the engine snapshot is
// taken (a headless process can be killed while the SDK is being asked).
import { beforeEach, describe, expect, it, vi } from "vitest";

const outbox: Array<{ type: string; metadata: Record<string, unknown> }> = [];
let releaseSnapshot: (v: Record<string, unknown> | null) => void = () => {};

const fakeDb = {
  async runAsync(sql: string, params: unknown[] = []) {
    if (sql.startsWith("INSERT INTO event_outbox")) {
      outbox.push({ type: String(params[0]), metadata: JSON.parse(String(params[1])) });
    }
    return { changes: 1 };
  },
  async getAllAsync() {
    return [];
  },
};

vi.mock("react-native", () => ({ Platform: { OS: "android" }, AppState: { currentState: "background" } }));
vi.mock("../../db/index", () => ({ getDatabase: async () => fakeDb }));
vi.mock("../detection", () => ({ logDetectionEvent: async () => {} }));
vi.mock("../recordingOpen", () => ({
  resolveDropOpen: async () => ({
    fields: { openId: "oabc", openAgeSec: 300, openReason: "motion", via: "headless", fixesSeen: 0, fixesBuffered: 0 },
    closeId: "oabc",
  }),
  markOpenOutcome: async () => {},
  nativeFixAgeSec: async () => 312,
  collectEngineSnapshot: () => new Promise((resolve) => (releaseSnapshot = resolve)),
}));

beforeEach(() => {
  outbox.length = 0;
});

describe("noteRecordingDropped on Android no_coords", () => {
  it("queues the drop at once, before the engine snapshot exists", async () => {
    const { noteRecordingDropped } = await import("../recordingDrops");
    await noteRecordingDropped({ reason: "no_coords", coords: 1 });
    expect(outbox).toHaveLength(1);
    expect(outbox[0].type).toBe("trip.recording_dropped");
    expect(outbox[0].metadata).toMatchObject({ reason: "no_coords", openId: "oabc", nativeFixAgeSec: 312 });
    expect(outbox[0].metadata.engineAtDrop).toBeUndefined();
  });

  it("sends the engine state afterwards as a small event keyed by the same openId", async () => {
    const { noteRecordingDropped } = await import("../recordingDrops");
    await noteRecordingDropped({ reason: "no_coords", coords: 0 });
    releaseSnapshot({ en: true, perm: 4, ps: true });
    await new Promise((r) => setTimeout(r, 5));
    expect(outbox).toHaveLength(2);
    expect(outbox[1].type).toBe("trip.recording_engine_state");
    expect(outbox[1].metadata).toMatchObject({ openId: "oabc", engineAtDrop: { en: true, perm: 4, ps: true } });
  });

  it("a snapshot that never comes costs nothing: the drop is already queued", async () => {
    const { noteRecordingDropped } = await import("../recordingDrops");
    await noteRecordingDropped({ reason: "no_coords", coords: 1 });
    releaseSnapshot(null);
    await new Promise((r) => setTimeout(r, 5));
    expect(outbox).toHaveLength(1);
  });
});
