import { test, expect } from "@playwright/test";
import { BANNED_COPY, mockSession } from "./fixtures/api";
import { mockRoutes, reply } from "./fixtures/settingsApi";

const BOARD = {
  data: {
    onTheList: [{ id: "i1", title: "Fuel cost per trip", body: "Show what each trip cost in fuel.", status: "planned", category: "feature_request", isOwner: false, displayName: "Jo", createdAt: "2026-10-01T10:00:00.000Z", replies: [], shippedNote: null, shippedAt: null }],
    built: [{ id: "i2", title: "Odometer log", body: "x", status: "done", category: "feature_request", isOwner: true, displayName: "Sam", createdAt: "2026-09-01T10:00:00.000Z", replies: [], shippedNote: "Start and end readings for every day.", shippedAt: "2026-10-09T10:00:00.000Z" }],
    mine: [{ id: "i3", title: "Dark map", body: "A dark map please.", status: "new", category: "feature_request", isOwner: true, displayName: "Sam", createdAt: "2026-10-05T10:00:00.000Z", replies: [{ id: "r1", adminName: "Anthony", body: "Good idea, noted." }], shippedNote: null, shippedAt: null }],
  },
};

function feedbackApi(extra: Parameters<typeof mockRoutes>[1] = {}) {
  return {
    "GET /feedback/board": () => BOARD,
    "GET /support/threads": () => ({ data: [{ threadKey: "t1", subject: "Missing trip on 8 Oct", lastAt: "2026-10-08T09:00:00.000Z", lastDirection: "out", unread: true }] }),
    "GET /feedback/known-issues": () => ({ data: [{ id: "k1", title: "Trips saved late on Android", body: "We're looking at it.", knownIssueStatus: "investigating", replies: [{ id: "kr", adminName: "Anthony", body: "A fix is in testing." }] }] }),
    ...extra,
  };
}

test("Feedback: board, known issues, your ideas and the message list render", async ({ page }) => {
  await mockSession(page);
  await mockRoutes(page, feedbackApi());
  await page.goto("/dashboard/feedback");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Feedback");
  await expect(page.getByRole("button", { name: /Missing trip on 8 Oct/ })).toBeVisible();
  await expect(page.getByRole("img", { name: "New reply" })).toBeVisible();
  await expect(page.getByText("Trips saved late on Android")).toBeVisible();
  await expect(page.getByText("A fix is in testing.")).toBeVisible();
  await expect(page.getByText("Fuel cost per trip")).toBeVisible();
  await expect(page.getByText("Start and end readings for every day.")).toBeVisible();
  await expect(page.getByText("Good idea, noted.")).toBeVisible();
  await expect(page.locator(".mc-btn--primary")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Tell us something" })).toBeVisible();
  const text = await page.locator("body").innerText();
  for (const banned of BANNED_COPY) expect(text).not.toMatch(banned);
});

test("Feedback: opening a conversation and replying posts to the thread and shows the new message", async ({ page }) => {
  await mockSession(page);
  const messages = [
    { id: "m1", direction: "in", body: "My trip from Leeds is missing.", at: "2026-10-08T08:00:00.000Z", fromName: null, attachments: [] },
    { id: "m2", direction: "out", body: "Which day was it?", at: "2026-10-08T09:00:00.000Z", fromName: "Anthony", attachments: [] },
  ];
  const seen = await mockRoutes(
    page,
    feedbackApi({
      "GET /support/threads/t1": () => ({ data: { threadKey: "t1", subject: "Missing trip on 8 Oct", messages } }),
      "POST /support/threads/t1/reply": (req) => {
        messages.push({ id: "m3", direction: "in", body: String(req.body?.body), at: "2026-10-09T09:00:00.000Z", fromName: null, attachments: [] });
        return { data: { ok: true } };
      },
    })
  );
  await page.goto("/dashboard/feedback");
  await page.getByRole("button", { name: /Missing trip on 8 Oct/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Which day was it?")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Send reply" })).toBeDisabled();
  await dialog.getByLabel("Reply").fill("It was Wednesday morning.");
  await dialog.getByRole("button", { name: "Send reply" }).click();
  await expect(dialog.getByText("It was Wednesday morning.")).toBeVisible();
  expect(seen.find((r) => r.path === "/support/threads/t1/reply")?.body).toEqual({ body: "It was Wednesday morning." });
  await dialog.locator(".mc-dialog__foot").getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
});

test("Feedback: reporting a problem starts a private thread; a blank report is refused", async ({ page }) => {
  await mockSession(page);
  const seen = await mockRoutes(
    page,
    feedbackApi({
      "POST /support/report": () => ({ data: { threadKey: "t9" } }),
      "GET /support/threads/t9": () => ({ data: { threadKey: "t9", subject: "Wrong figure", messages: [{ id: "n1", direction: "in", body: "The miles look wrong.", at: "2026-10-09T09:00:00.000Z", fromName: null, attachments: [] }] } }),
    })
  );
  await page.goto("/dashboard/feedback");
  await page.getByRole("button", { name: "Tell us something" }).click();
  const dialog = page.getByRole("dialog", { name: "Tell us something" });
  await expect(dialog.getByText(/goes privately to the MileClear team/)).toBeVisible();
  await dialog.getByRole("button", { name: "Send to MileClear" }).click();
  await expect(dialog.getByText("Tell us what happened first.")).toBeVisible();
  expect(seen.some((r) => r.path === "/support/report")).toBe(false);
  await dialog.getByLabel("What happened?").fill("The miles look wrong.");
  await dialog.getByRole("button", { name: "Send to MileClear" }).click();
  await expect(page.getByRole("dialog").getByText("The miles look wrong.")).toBeVisible();
  expect(seen.find((r) => r.path === "/support/report")?.body).toEqual({ body: "The miles look wrong." });
});

test("Feedback: an idea posts as a feature request", async ({ page }) => {
  await mockSession(page);
  const seen = await mockRoutes(page, feedbackApi({ "POST /feedback/": () => ({ data: { id: "i9" } }) }));
  await page.goto("/dashboard/feedback");
  await page.getByRole("button", { name: "Tell us something" }).click();
  const dialog = page.getByRole("dialog", { name: "Tell us something" });
  await dialog.getByRole("radio", { name: "An idea" }).click();
  await dialog.getByLabel("Your idea in a few words").fill("Show fuel cost per trip");
  await dialog.getByLabel("Tell us more").fill("Per trip, please.");
  await dialog.getByRole("button", { name: "Send idea" }).click();
  await expect(dialog).toBeHidden();
  expect(seen.find((r) => r.path === "/feedback/")?.body).toEqual({ title: "Show fuel cost per trip", body: "Per trip, please.", category: "feature_request" });
});

test("Feedback: a failed load shows a retry, not a blank page", async ({ page }) => {
  await mockSession(page);
  await mockRoutes(page, feedbackApi({ "GET /feedback/board": () => reply(500, { error: "down" }) }));
  await page.goto("/dashboard/feedback");
  await expect(page.getByText("Couldn't load this.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByText("Fuel cost per trip")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Missing trip on 8 Oct/ })).toBeVisible(); // the other sections still load
});

test.describe("phone 390", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("Feedback fits the screen and the thread opens as a sheet", async ({ page }) => {
    await mockSession(page);
    await mockRoutes(page, feedbackApi({ "GET /support/threads/t1": () => ({ data: { threadKey: "t1", subject: "Missing trip on 8 Oct", messages: [] } }) }));
    await page.goto("/dashboard/feedback");
    await expect(page.getByText("Fuel cost per trip")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: /Missing trip on 8 Oct/ }).click();
    const box = await page.getByRole("dialog").boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  });
});
