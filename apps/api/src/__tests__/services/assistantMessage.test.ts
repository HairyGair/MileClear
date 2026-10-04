/**
 * EmSee message_the_team: private, capped per day, deduplicated, and the
 * driver id always comes from the signed-in request.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    appEvent: { findMany: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    feedback: { create: vi.fn() },
  },
}));
vi.mock("../../lib/push.js", () => ({ sendPushToUser: vi.fn().mockResolvedValue(null) }));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));
vi.mock("../../services/discord.js", () => ({ postFounderAlert: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../services/email.js", () => ({ sendAdminEmail: vi.fn().mockResolvedValue(undefined) }));

import { prisma } from "../../lib/prisma.js";
import { sendAdminEmail } from "../../services/email.js";
import { logEvent } from "../../services/appEvents.js";
import { messageTheTeam, MESSAGE_DAILY_LIMIT } from "../../services/assistantMessage.js";
import { runAssistantTool } from "../../services/assistantTools.js";

const ME = "user-1";
const NOW = new Date("2026-10-04T18:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.appEvent.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: "d@example.com", displayName: "Dee", fullName: null } as never);
});

describe("messageTheTeam", () => {
  it("emails the team with the driver as reply-to and never posts to the public board", async () => {
    const r = await messageTheTeam(ME, { kind: "suggestion", message: "Add a dark map please" }, NOW);
    expect(r.sent).toBe(true);
    const mail = vi.mocked(sendAdminEmail).mock.calls[0][0];
    expect(mail.replyTo).toBe("Dee <d@example.com>");
    expect(mail.text).toContain("Add a dark map please");
    expect(prisma.feedback.create).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.user.findUnique).mock.calls[0][0]).toMatchObject({ where: { id: ME } });
    expect(logEvent).toHaveBeenCalledWith("assistant.message_sent", ME, expect.objectContaining({ kind: "suggestion" }));
  });

  it("escapes HTML in the message", async () => {
    await messageTheTeam(ME, { kind: "other", message: "<script>x</script>" }, NOW);
    expect(vi.mocked(sendAdminEmail).mock.calls[0][0].html).not.toContain("<script>");
  });

  it("stops at the daily limit", async () => {
    vi.mocked(prisma.appEvent.findMany).mockResolvedValue(
      Array.from({ length: MESSAGE_DAILY_LIMIT }, (_, i) => ({ metadata: { message: `m${i}` } })) as never
    );
    const r = await messageTheTeam(ME, { kind: "problem", message: "Another one" }, NOW);
    expect(r.sent).toBe(false);
    expect(sendAdminEmail).not.toHaveBeenCalled();
  });

  it("sends the same text only once a day", async () => {
    vi.mocked(prisma.appEvent.findMany).mockResolvedValue([{ metadata: { message: "Same again" } }] as never);
    const r = await messageTheTeam(ME, { kind: "problem", message: "Same again" }, NOW);
    expect(r.sent).toBe(true);
    expect(sendAdminEmail).not.toHaveBeenCalled();
  });

  it("rejects extra fields through the tool runner", async () => {
    const r = await runAssistantTool(ME, "message_the_team", { kind: "other", message: "hello there", userId: "x" }, NOW);
    expect(r.ok).toBe(false);
    expect(sendAdminEmail).not.toHaveBeenCalled();
  });
});
