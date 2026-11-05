import { describe, it, expect } from "vitest";
import { nextAnnouncement } from "../a11y/announceLogic";

describe("nextAnnouncement", () => {
  it("announces a new message", () => {
    expect(nextAnnouncement(null, "Enter your email address")).toBe("Enter your email address");
  });
  it("announces when the message changes", () => {
    expect(nextAnnouncement("Enter your email address", "Enter your password")).toBe("Enter your password");
  });
  it("stays quiet when cleared or unchanged", () => {
    expect(nextAnnouncement("Oops", "")).toBeNull();
    expect(nextAnnouncement("Oops", null)).toBeNull();
    expect(nextAnnouncement("Oops", "Oops")).toBeNull();
  });
});
