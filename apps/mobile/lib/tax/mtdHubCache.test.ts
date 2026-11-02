import { describe, it, expect, beforeEach } from "vitest";
import { readHubCache, writeHubCache, invalidateHubCache, newHubOwner, HUB_CACHE_MS } from "./mtdHubCache";

describe("hub cache", () => {
  beforeEach(() => invalidateHubCache());

  it("the same hub reuses its read within a minute", () => {
    const owner = newHubOwner();
    writeHubCache("u1", owner, "read", 1000);
    expect(readHubCache("u1", owner, 1000 + HUB_CACHE_MS - 1)).toBe("read");
  });

  it("expires after a minute", () => {
    const owner = newHubOwner();
    writeHubCache("u1", owner, "read", 1000);
    expect(readHubCache("u1", owner, 1000 + HUB_CACHE_MS)).toBeNull();
  });

  it("a freshly opened hub never reuses another hub's read", () => {
    const first = newHubOwner();
    writeHubCache("u1", first, "before the send", 1000);
    const second = newHubOwner();
    expect(readHubCache("u1", second, 1500)).toBeNull();
  });

  it("another user never sees it", () => {
    const owner = newHubOwner();
    writeHubCache("u1", owner, "read", 1000);
    expect(readHubCache("u2", owner, 1500)).toBeNull();
  });

  it("invalidate clears it", () => {
    const owner = newHubOwner();
    writeHubCache("u1", owner, "read", 1000);
    invalidateHubCache();
    expect(readHubCache("u1", owner, 1500)).toBeNull();
  });
});
