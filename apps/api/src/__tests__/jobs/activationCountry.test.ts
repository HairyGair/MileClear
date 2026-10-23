import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma.js", () => ({ prisma: {} }));
vi.mock("../../lib/push.js", () => ({ sendPushNotifications: vi.fn() }));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));
vi.mock("../../services/discord.js", () => ({ postFounderAlert: vi.fn(), discordUserLabel: vi.fn() }));
vi.mock("../../services/email.js", () => ({ sendActivationNudgeEmail: vi.fn(), sendBgLocationNudgeEmail: vi.fn() }));
vi.mock("../../services/referral.js", () => ({ resolvePremiumStatus: vi.fn() }));
vi.mock("../../services/subscriptionTruth.js", () => ({ classifyProSource: vi.fn(), loadSandboxTxnIds: vi.fn() }));

import { pushForBlocker } from "../../jobs/activation.js";

describe("activation pushes outside the UK (23 Oct 2026)", () => {
  it("UK drivers still hear about the 55p rate", () => {
    for (const day of [1, 7] as const) {
      expect(pushForBlocker(day, "no_drive_yet", "tok", "ios").body).toContain("55p");
      expect(pushForBlocker(day, "no_drive_yet", "tok", "ios", true).body).toContain("55p");
    }
  });

  it("drivers outside the UK get the same nudge without the rate or a tax deduction", () => {
    for (const day of [1, 7] as const) {
      const body = pushForBlocker(day, "no_drive_yet", "tok", "ios", false).body!;
      expect(body).not.toContain("55p");
      expect(body).not.toMatch(/deduction/i);
      expect(body).toMatch(/Add/);
    }
  });
});
