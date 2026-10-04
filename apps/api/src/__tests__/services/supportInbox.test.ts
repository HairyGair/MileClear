import { describe, it, expect, vi } from "vitest";

vi.mock("../../lib/prisma.js", () => ({ prisma: {} }));

import { parseSupportEmail, normaliseSubject, htmlToText } from "../../services/supportInbox.js";

const NOW = new Date("2026-10-04T20:00:00Z");

function raw(headers: Record<string, string>, body: string, html = false): string {
  const h = Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join("\r\n");
  return `${h}\r\nMIME-Version: 1.0\r\nContent-Type: ${html ? "text/html" : "text/plain"}; charset=utf-8\r\n\r\n${body}\r\n`;
}

describe("parseSupportEmail", () => {
  it("reads a plain message from a driver", async () => {
    const p = await parseSupportEmail(
      raw(
        {
          From: '"Dee Driver" <Dee@Example.com>',
          To: "support@mileclear.com",
          Subject: "Missing trip",
          "Message-ID": "<abc@example.com>",
          Date: "Sun, 04 Oct 2026 19:00:00 +0000",
        },
        "My trip on Friday is missing."
      ),
      NOW
    );
    expect(p).toMatchObject({
      messageId: "abc@example.com",
      fromEmail: "dee@example.com",
      fromName: "Dee Driver",
      subject: "Missing trip",
      isSpam: false,
    });
    expect(p.textBody).toContain("My trip on Friday");
  });

  it("answers the Reply-To for mail relayed from our own address", async () => {
    const p = await parseSupportEmail(
      raw(
        {
          From: "MileClear <noreply@mileclear.com>",
          "Reply-To": "Sam <sam@example.com>",
          To: "support@mileclear.com",
          Subject: "Contact form: Sam",
          "Message-ID": "<relay@mileclear.com>",
        },
        "Hello"
      ),
      NOW
    );
    expect(p.fromEmail).toBe("sam@example.com");
    expect(p.fromName).toBe("Sam");
  });

  it("flags spam and threads replies", async () => {
    const p = await parseSupportEmail(
      raw(
        {
          From: "x@spam.example",
          Subject: "Re: hello",
          "X-Spam-Status": "Yes, score=9.1",
          "In-Reply-To": "<orig@mileclear.com>",
          References: "<a@x> <orig@mileclear.com>",
          "Message-ID": "<s@spam.example>",
        },
        "buy now"
      ),
      NOW
    );
    expect(p.isSpam).toBe(true);
    expect(p.inReplyTo).toBe("orig@mileclear.com");
    expect(p.references).toEqual(["a@x", "orig@mileclear.com"]);
  });

  it("falls back to now for a wild Date header and text for HTML-only mail", async () => {
    const p = await parseSupportEmail(
      raw({ From: "a@b.com", Subject: "Hi", Date: "Mon, 01 Jan 2001 00:00:00 +0000" }, "<p>Hello<br>there</p>", true),
      NOW
    );
    expect(p.receivedAt).toEqual(NOW);
    expect(p.textBody).toBe("Hello\nthere");
    expect(p.messageId).toMatch(/^local-/);
  });
});

describe("normaliseSubject / htmlToText", () => {
  it("strips reply and forward prefixes", () => {
    expect(normaliseSubject("Re: Fwd: RE: Missing  trip")).toBe("missing trip");
    expect(normaliseSubject("AW: Hallo")).toBe("hallo");
  });
  it("drops scripts and styles", () => {
    expect(htmlToText("<style>x{}</style><script>bad()</script><b>ok</b>")).toBe("ok");
  });
});
