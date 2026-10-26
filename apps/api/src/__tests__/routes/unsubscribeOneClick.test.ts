/**
 * RFC 8058 one-click unsubscribe: mail clients POST a form body
 * ("List-Unsubscribe=One-Click"). Without a form parser Fastify answered 415
 * and the inbox Unsubscribe button silently did nothing (26 Oct 2026).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";

vi.mock("../../lib/prisma.js", () => ({ prisma: { user: { update: vi.fn() } } }));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));
vi.mock("../../lib/unsubscribeToken.js", () => ({
  verifyUnsubscribeToken: vi.fn((t: string) => (t === "good" ? { userId: "u1" } : null)),
}));

import { unsubscribeRoutes } from "../../routes/unsubscribe/index.js";
import { prisma } from "../../lib/prisma.js";

async function app() {
  const a = await buildApp();
  await a.register(unsubscribeRoutes, { prefix: "/unsubscribe" });
  return a;
}

describe("POST /unsubscribe one-click", () => {
  beforeEach(() => vi.mocked(prisma.user.update).mockReset().mockResolvedValue({} as never));

  it("accepts the urlencoded one-click body and opts the user out", async () => {
    const a = await app();
    const res = await a.inject({
      method: "POST",
      url: "/unsubscribe?token=good",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "List-Unsubscribe=One-Click",
    });
    expect(res.statusCode).toBe(200);
    expect(vi.mocked(prisma.user.update).mock.calls[0][0]).toMatchObject({
      where: { id: "u1" },
      data: { marketingEmailsEnabled: false, marketingEmailsDisabledSource: "one_click" },
    });
    await a.close();
  });

  it("accepts a multipart one-click body", async () => {
    const a = await app();
    const res = await a.inject({
      method: "POST",
      url: "/unsubscribe?token=good",
      headers: { "content-type": "multipart/form-data; boundary=x" },
      payload: '--x\r\nContent-Disposition: form-data; name="List-Unsubscribe"\r\n\r\nOne-Click\r\n--x--\r\n',
    });
    expect(res.statusCode).toBe(200);
    await a.close();
  });

  it("still refuses a bad token", async () => {
    const a = await app();
    const res = await a.inject({
      method: "POST",
      url: "/unsubscribe?token=bad",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "List-Unsubscribe=One-Click",
    });
    expect(res.statusCode).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
    await a.close();
  });
});
