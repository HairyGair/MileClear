import { describe, it, expect } from "vitest";
import {
  discordUserLabel,
  redactEmails,
  scrubDiscordPost,
  EMAIL_HIDDEN,
} from "../../services/discord.js";

// GDPR audit H3 (14 Aug 2026): Discord posts named drivers by email address.
describe("discordUserLabel", () => {
  const id = "1a2b3c4d-0000-4000-8000-000000000000";

  it("uses the first word of the display name and the short id", () => {
    expect(discordUserLabel({ id, displayName: "Sam Driver" })).toBe("Sam (1a2b3c4d)");
  });

  it("falls back to the full name's first word", () => {
    expect(discordUserLabel({ id, displayName: null, fullName: "Alex Example" })).toBe(
      "Alex (1a2b3c4d)"
    );
  });

  it("never uses a name that is an email address", () => {
    expect(discordUserLabel({ id, displayName: "someone@example.com" })).toBe("Driver 1a2b3c4d");
  });

  it("has a nameless form", () => {
    expect(discordUserLabel({ id })).toBe("Driver 1a2b3c4d");
  });
});

describe("redactEmails", () => {
  it("hides third-party addresses and keeps our own", () => {
    expect(redactEmails("from someone@example.co.uk, cc support@mileclear.com")).toBe(
      `from ${EMAIL_HIDDEN}, cc support@mileclear.com`
    );
  });
});

describe("scrubDiscordPost", () => {
  it("scrubs emails and NINOs from content and every embed text part", () => {
    const out = scrubDiscordPost({
      content: "a@b.com",
      embeds: [
        {
          title: "x@y.org paid",
          description: "NINO AB123456C on file for c@d.io",
          fields: [{ name: "User", value: "e@f.net" }],
          footer: { text: "g@h.uk" },
          url: "https://mileclear.com/dashboard/admin?user=1",
        },
      ],
    });
    expect(out.content).toBe(EMAIL_HIDDEN);
    const e = out.embeds![0];
    expect(e.title).toBe(`${EMAIL_HIDDEN} paid`);
    expect(e.description).toBe(`NINO :nino on file for ${EMAIL_HIDDEN}`);
    expect(e.fields![0].value).toBe(EMAIL_HIDDEN);
    expect(e.footer!.text).toBe(EMAIL_HIDDEN);
    expect(e.url).toBe("https://mileclear.com/dashboard/admin?user=1");
  });

  it("lets emails through only when the post opts in, still hiding NINOs", () => {
    const out = scrubDiscordPost({ content: "a@b.com AB123456C", allowEmails: true });
    expect(out.content).toBe("a@b.com :nino");
  });
});
