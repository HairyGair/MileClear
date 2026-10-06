/**
 * "You asked, we built" (6 Oct 2026): which ideas are public and where they
 * appear on the board.
 */
import { describe, it, expect } from "vitest";
import { buildBoard, isPublicIdea, legacyListVisibility } from "../../services/feedbackBoard.js";

const item = (o: Partial<{ id: string; userId: string | null; category: string; status: string; createdAt: Date; shippedAt: Date | null; shippedNote: string | null }>) => ({
  id: "x",
  userId: null as string | null,
  category: "feature_request",
  status: "new",
  createdAt: new Date("2026-09-01T00:00:00Z"),
  shippedAt: null as Date | null,
  shippedNote: null as string | null,
  ...o,
});

describe("isPublicIdea", () => {
  it("shows picked-up and built ideas", () => {
    expect(isPublicIdea({ category: "feature_request", status: "planned" })).toBe(true);
    expect(isPublicIdea({ category: "improvement", status: "in_progress" })).toBe(true);
    expect(isPublicIdea({ category: "other", status: "done" })).toBe(true);
  });
  it("hides new and declined ideas, and every bug report", () => {
    expect(isPublicIdea({ category: "feature_request", status: "new" })).toBe(false);
    expect(isPublicIdea({ category: "feature_request", status: "declined" })).toBe(false);
    expect(isPublicIdea({ category: "bug_report", status: "done" })).toBe(false);
  });
});

describe("buildBoard", () => {
  const items = [
    item({ id: "planned-old", status: "planned", createdAt: new Date("2026-09-01") }),
    item({ id: "progress-new", status: "in_progress", createdAt: new Date("2026-09-20") }),
    item({ id: "done-early", status: "done", shippedAt: new Date("2026-09-05"), shippedNote: "Built A" }),
    item({ id: "done-late", status: "done", shippedAt: new Date("2026-10-01"), shippedNote: "Built B" }),
    item({ id: "done-no-note", status: "done", shippedAt: new Date("2026-10-02") }),
    item({ id: "bug-done", status: "done", category: "bug_report", userId: "me" }),
    item({ id: "my-new", status: "new", userId: "me", createdAt: new Date("2026-10-02") }),
    item({ id: "their-new", status: "new", userId: "them" }),
  ];

  it("puts picked-up ideas on the list, newest first", () => {
    expect(buildBoard(items, null).onTheList.map((i) => i.id)).toEqual(["progress-new", "planned-old"]);
  });
  it("lists built ideas by when they shipped, latest first, and never bug reports", () => {
    expect(buildBoard(items, null).built.map((i) => i.id)).toEqual(["done-late", "done-early"]);
  });
  it("leaves a done idea off Built until it has a 'what we built' note", () => {
    expect(buildBoard(items, null).built.some((i) => i.id === "done-no-note")).toBe(false);
  });
  it("shows a driver their own ideas, including new ones, but not their bug reports", () => {
    expect(buildBoard(items, "me").mine.map((i) => i.id)).toEqual(["my-new"]);
  });
  it("shows nobody else's new idea, and no 'mine' when signed out", () => {
    const b = buildBoard(items, null);
    expect([...b.onTheList, ...b.built].some((i) => i.id === "their-new")).toBe(false);
    expect(b.mine).toEqual([]);
  });
  it("caps the built list", () => {
    const many = Array.from({ length: 40 }, (_, n) => item({ id: `d${n}`, status: "done", shippedAt: new Date(2026, 8, n + 1), shippedNote: "Built" }));
    expect(buildBoard(many, null, 30).built).toHaveLength(30);
  });
});

describe("legacyListVisibility", () => {
  it("gives admins everything", () => {
    expect(legacyListVisibility("a", true)).toEqual({});
  });
  it("hides bug reports and other people's unpicked ideas from older apps", () => {
    expect(legacyListVisibility("me", false)).toEqual({
      AND: [{ category: { not: "bug_report" } }, { OR: [{ status: { in: ["planned", "in_progress", "done"] } }, { userId: "me" }] }],
    });
    expect(legacyListVisibility(null, false)).toEqual({
      AND: [{ category: { not: "bug_report" } }, { OR: [{ status: { in: ["planned", "in_progress", "done"] } }] }],
    });
  });
});
