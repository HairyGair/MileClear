/**
 * The Discord link flow returns to the phone app by default and to the website
 * when it was started from the web dashboard (`client: "web"` in the state).
 */
import { describe, it, expect } from "vitest";
import { discordReturnUrl, signState, verifyState } from "../../routes/auth/discord.js";

describe("discordReturnUrl", () => {
  it("uses the app deep link when no client is set", () => {
    expect(discordReturnUrl(undefined, { ok: true, username: "sam" })).toBe(
      "mileclear://discord-linked?ok=true&username=sam"
    );
    expect(discordReturnUrl(undefined, { ok: false, reason: "bad_state" })).toBe(
      "mileclear://discord-linked?ok=false&reason=bad_state"
    );
  });

  it("returns to the website settings page for a web link", () => {
    expect(discordReturnUrl("web", { ok: true, username: "sam smith" })).toBe(
      "https://mileclear.com/dashboard/settings/community?discord=linked&username=sam%20smith"
    );
    expect(discordReturnUrl("web", { ok: false, reason: "already_linked_elsewhere" })).toBe(
      "https://mileclear.com/dashboard/settings/community?discord=failed&reason=already_linked_elsewhere"
    );
  });
});

describe("Discord state", () => {
  it("carries the web flag through the signed state", async () => {
    const web = await verifyState(await signState("user-1", "web"));
    expect(web?.uid).toBe("user-1");
    expect(web?.client).toBe("web");
  });

  it("has no client flag for a phone link", async () => {
    const app = await verifyState(await signState("user-2"));
    expect(app?.uid).toBe("user-2");
    expect(app?.client).toBeUndefined();
  });

  it("rejects a tampered state", async () => {
    expect(await verifyState((await signState("user-3", "web")) + "x")).toBeNull();
  });
});
