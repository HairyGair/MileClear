import { test, expect } from "@playwright/test";
import { BANNED_COPY, mockSession, profile } from "./fixtures/api";
import { mockRoutes, profileStore, reply } from "./fixtures/settingsApi";

const FREE_BILLING = { data: { isPremium: false, premiumExpiresAt: null, subscriptionStatus: "none", cancelAtPeriodEnd: false, currentPeriodEnd: null, subscriptionPlatform: "none" } };

test.describe("desktop 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("Settings hub starts with Your plan and Invite a friend", async ({ page }) => {
    await mockSession(page);
    await page.goto("/dashboard/settings");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Settings");
    const rows = page.locator("main a.mc-row, main button.mc-row");
    await expect(rows.nth(0)).toContainText("Your plan");
    await expect(rows.nth(1)).toContainText("Invite a friend, get Pro free");
    await expect(page.getByRole("link", { name: /Business profile/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Privacy policy/ })).toHaveAttribute("href", "/privacy");
  });

  test("company drivers do not see Business profile", async ({ page }) => {
    await mockSession(page, { team: { orgId: "o1", orgName: "Acme Ltd", role: "driver" } });
    await page.goto("/dashboard/settings");
    await expect(page.getByRole("link", { name: /Work and tax/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Business profile/ })).toHaveCount(0);
  });

  test("plan page: free sees the reason headline, price and Upgrade; checkout opens", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: false }) });
    const seen = await mockRoutes(page, {
      "GET /billing/status": () => FREE_BILLING,
      "POST /billing/checkout": () => ({ data: { url: "http://127.0.0.1:3999/fake-stripe" } }),
    });
    await page.context().route("http://127.0.0.1:3999/fake-stripe", (r) => r.fulfill({ contentType: "text/html", body: "<h1>Stripe</h1>" }));
    await page.goto("/dashboard/settings/plan?reason=exports");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your plan");
    await expect(page.getByRole("heading", { name: "Download your records" })).toBeVisible();
    await expect(page.getByText("£4.99 a month. Cancel any time.")).toBeVisible();
    await expect(page.getByText("Everything in Pro")).toBeVisible();
    await expect(page.getByText("EmSee", { exact: true })).toHaveCount(0); // not available in the fixture
    await expect(page.locator(".mc-btn--primary")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Or earn free months by inviting friends" })).toHaveAttribute("href", "/dashboard/invite");
    const popup = page.context().waitForEvent("page");
    await page.getByRole("button", { name: "Upgrade to Pro" }).click();
    const stripe = await popup;
    await expect(stripe).toHaveURL(/fake-stripe/);
    await expect(page).toHaveURL(/settings\/plan/);
    expect(seen.some((r) => r.method === "POST" && r.path === "/billing/checkout")).toBe(true);
  });

  test("plan page: an unknown reason reads MileClear Pro; failed checkout says so", async ({ page }) => {
    await mockSession(page);
    await mockRoutes(page, {
      "GET /billing/status": () => FREE_BILLING,
      "POST /billing/checkout": () => reply(500, { error: "boom" }),
    });
    await page.goto("/dashboard/settings/plan?reason=nonsense");
    await expect(page.getByRole("heading", { name: "MileClear Pro" })).toBeVisible();
    await page.getByRole("button", { name: "Upgrade to Pro" }).click();
    await expect(page.getByText("Couldn't open checkout. Try again in a moment.")).toBeVisible();
  });

  test("plan page: Stripe Pro shows renewal and cancels after a confirm", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true, premiumSource: "subscription" }) });
    let cancelled = false;
    const seen = await mockRoutes(page, {
      "GET /billing/status": () => ({
        data: { isPremium: true, premiumExpiresAt: "2026-11-06T00:00:00.000Z", subscriptionStatus: "active", cancelAtPeriodEnd: cancelled, currentPeriodEnd: "2026-11-06T00:00:00.000Z", subscriptionPlatform: "stripe", premiumSource: "subscription" },
      }),
      "POST /billing/cancel": () => {
        cancelled = true;
        return { data: { ok: true } };
      },
    });
    await page.goto("/dashboard/settings/plan");
    await expect(page.getByText(/^Pro, renews \w{3} 6 Nov/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Upgrade to Pro" })).toHaveCount(0);
    await page.getByRole("button", { name: "Cancel subscription" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(seen.some((r) => r.path === "/billing/cancel")).toBe(false); // nothing sent before the confirm
    await dialog.getByRole("button", { name: "Cancel subscription" }).click();
    await expect(page.getByText(/^Pro until \w{3} 6 Nov.*\(cancelled\)/)).toBeVisible();
    expect(seen.filter((r) => r.path === "/billing/cancel")).toHaveLength(1);
  });

  test("plan page: Apple Pro says manage it on your phone and has no buttons", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true, premiumSource: "subscription" }) });
    await mockRoutes(page, {
      "GET /billing/status": () => ({
        data: { isPremium: true, premiumExpiresAt: "2026-11-06T00:00:00.000Z", subscriptionStatus: "active", cancelAtPeriodEnd: false, currentPeriodEnd: "2026-11-06T00:00:00.000Z", subscriptionPlatform: "apple", premiumSource: "subscription" },
      }),
    });
    await page.goto("/dashboard/settings/plan");
    await expect(page.getByText("You pay through the App Store. Manage it on your phone.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Upgrade|Cancel/ })).toHaveCount(0);
  });

  test("plan page: team Pro names the company and has no buttons", async ({ page }) => {
    await mockSession(page, {
      profile: profile({ isPremium: true, premiumSource: "team" }),
      team: { orgId: "o1", orgName: "Acme Ltd", role: "driver" },
    });
    await mockRoutes(page, {
      "GET /billing/status": () => ({ data: { isPremium: true, premiumExpiresAt: null, subscriptionStatus: "none", cancelAtPeriodEnd: false, currentPeriodEnd: null, subscriptionPlatform: "none", premiumSource: "team" } }),
    });
    await page.goto("/dashboard/settings/plan");
    await expect(page.getByText("Pro through Acme Ltd. Your company pays.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Upgrade|Cancel/ })).toHaveCount(0);
  });

  test("plan page: referral Pro shows the date and still offers Upgrade", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true, premiumSource: "referral" }) });
    await mockRoutes(page, {
      "GET /billing/status": () => ({ data: { isPremium: true, premiumExpiresAt: null, subscriptionStatus: "none", cancelAtPeriodEnd: false, currentPeriodEnd: null, subscriptionPlatform: "none", premiumSource: "referral", referralProUntil: "2026-12-06T00:00:00.000Z" } }),
    });
    await page.goto("/dashboard/settings/plan");
    await expect(page.getByText(/^Pro free until \w{3} 6 Dec/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Upgrade to Pro" })).toBeVisible();
  });

  test("What you see: switching to Personal changes the rail without a reload", async ({ page }) => {
    await mockSession(page);
    const store = profileStore(profile({ dashboardMode: "work" }));
    const seen = await mockRoutes(page, store.handlers);
    await page.goto("/dashboard/settings/preferences");
    const rail = page.getByRole("navigation", { name: "Main" }).first();
    await expect(rail.getByRole("link", { name: /^Tax/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /^Work/ })).toBeChecked();
    await page.getByRole("radio", { name: /^Personal/ }).click();
    await expect(rail.getByRole("link", { name: /^Insights/ })).toBeVisible();
    await expect(rail.getByRole("link", { name: /^Tax/ })).toHaveCount(0);
    expect(seen.find((r) => r.method === "PATCH")?.body).toEqual({ dashboardMode: "personal" });
    await expect(page.getByText("Card order on Home is set in the app. The website shows the standard order.")).toBeVisible();
  });

  test("Work and tax saves the employer rate and clears the second rate with the first", async ({ page }) => {
    await mockSession(page, { profile: profile({ workType: "employee" }) });
    const store = profileStore(profile({ workType: "employee" }));
    const seen = await mockRoutes(page, { ...store.handlers, "GET /hmrc/status": () => ({ data: { connected: false } }) });
    await page.goto("/dashboard/settings/work-tax");
    await expect(page.getByRole("link", { name: /Mileage Allowance Relief/ })).toBeVisible();
    await expect(page.getByLabel("Weekly earnings goal")).toHaveCount(0); // gig-only
    await page.getByLabel("Employer rate per mile").fill("30");
    await page.getByLabel("Rate after 10,000 miles").fill("15");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    const patch = seen.find((r) => r.method === "PATCH");
    expect(patch?.body).toMatchObject({ workType: "employee", employerMileageRatePence: 30, employerMileageRatePenceAfter10k: 15 });
    expect(patch?.body).not.toHaveProperty("taxBasis");

    await page.getByLabel("Employer rate per mile").fill("");
    await page.getByRole("button", { name: "Save" }).click();
    await expect.poll(() => seen.filter((r) => r.method === "PATCH").length).toBe(2);
    expect(seen.filter((r) => r.method === "PATCH")[1].body).toMatchObject({ employerMileageRatePence: null, employerMileageRatePenceAfter10k: null });
  });

  test("Work and tax shows the gig fields and links Quarterly Self Assessment only when connected", async ({ page }) => {
    await mockSession(page, { profile: profile({ workType: "gig" }) });
    await mockRoutes(page, { "GET /hmrc/status": () => ({ data: { connected: true } }) });
    await page.goto("/dashboard/settings/work-tax");
    await expect(page.getByLabel("Weekly earnings goal")).toBeVisible();
    await expect(page.getByLabel("Tax basis")).toBeVisible();
    await expect(page.getByRole("link", { name: /Quarterly Self Assessment/ })).toBeVisible();
    await expect(page.getByLabel("Employer rate per mile")).toHaveCount(0);
  });

  test("Business profile saves and the logo uploads and removes", async ({ page }) => {
    await mockSession(page);
    let hasLogo = false;
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
    const seen = await mockRoutes(page, {
      "GET /user/profile": () => ({ data: profile({ tradingName: "Sam's Couriers", invoicePaymentTermsDays: 14, nextInvoiceNumber: 7 }) }),
      "PATCH /user/profile": () => ({ data: profile() }),
      "DELETE /user/logo": () => {
        hasLogo = false;
        return { data: { ok: true } };
      },
    });
    await page.route("http://127.0.0.1:3999/user/logo", (route) => {
      const m = route.request().method();
      if (m === "OPTIONS") return route.fallback();
      const cors = { "access-control-allow-origin": "*" };
      if (m === "POST") {
        hasLogo = true;
        return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: "{}" });
      }
      if (m === "GET") {
        return hasLogo
          ? route.fulfill({ status: 200, headers: cors, contentType: "image/png", body: png })
          : route.fulfill({ status: 404, headers: cors, contentType: "application/json", body: "{}" });
      }
      return route.fallback();
    });
    await page.goto("/dashboard/settings/business-profile");
    await expect(page.getByLabel("Trading name")).toHaveValue("Sam's Couriers");
    await expect(page.getByLabel("Next invoice number")).toHaveValue("7");
    await page.getByLabel("Trading name").fill("Sam Couriers Ltd");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    expect(seen.find((r) => r.method === "PATCH")?.body).toMatchObject({ tradingName: "Sam Couriers Ltd", invoicePaymentTermsDays: 14, nextInvoiceNumber: 7 });

    await page.getByLabel("Choose a logo file").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: png });
    await expect(page.getByRole("img", { name: "Your business logo" })).toBeVisible();
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("img", { name: "Your business logo" })).toHaveCount(0);
    expect(seen.some((r) => r.method === "DELETE" && r.path === "/user/logo")).toBe(true);
  });

  test("Notifications: free sees Pro toggles disabled; a switch sends the whole set", async ({ page }) => {
    await mockSession(page);
    const seen = await mockRoutes(page, {
      "GET /notifications/preferences": () => ({ data: { weeklySummary: true, morningBriefing: false, fuelAlert: false } }),
      "PUT /notifications/preferences": () => ({ data: { ok: true } }),
    });
    await page.goto("/dashboard/settings/notifications");
    await expect(page.getByRole("switch", { name: /Weekly summary/ })).toBeDisabled();
    await expect(page.getByRole("switch", { name: /Weekly summary/ })).not.toBeChecked();
    await expect(page.getByRole("switch", { name: /Morning briefing/ })).not.toBeChecked();
    await expect(page.getByRole("switch", { name: /Evening summary/ })).toBeChecked();
    await expect(page.getByRole("switch", { name: /Cheapest fuel/ })).not.toBeChecked(); // opt-in keys default off
    await page.getByRole("switch", { name: /Evening summary/ }).click();
    await expect.poll(() => seen.filter((r) => r.method === "PUT").length).toBe(1);
    const put = seen.find((r) => r.method === "PUT")!;
    expect(put.body).toMatchObject({ eveningDigest: false, morningBriefing: false, streakReminder: true, cheapestFuelDaily: false, fuelAlert: false });
    await expect(page.getByText("We always send account and security emails.")).toBeVisible();
  });

  test("Notifications: Pro can switch Pro toggles; the product news email saves", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    const store = profileStore(profile({ isPremium: true }));
    const seen = await mockRoutes(page, {
      ...store.handlers,
      "GET /notifications/preferences": () => ({ data: {} }),
      "PUT /notifications/preferences": () => ({ data: { ok: true } }),
    });
    await page.goto("/dashboard/settings/notifications");
    const weekly = page.getByRole("switch", { name: /Weekly summary/ });
    await expect(weekly).toBeEnabled();
    await expect(weekly).toBeChecked();
    await expect(page.getByText("PRO", { exact: true })).toHaveCount(0);
    await page.getByRole("switch", { name: /Product news/ }).click();
    await expect.poll(() => seen.some((r) => r.method === "PATCH" && r.body?.marketingEmailsEnabled === false)).toBe(true);
  });

  test("Your data: downloads the JSON and shows the trip check result", async ({ page }) => {
    await mockSession(page);
    const seen = await mockRoutes(page, {
      "GET /user/export": () => ({ data: { user: { id: "u-test" } } }),
      "POST /trips/scan-low-confidence": () => ({ data: { scanned: 1204, candidateCount: 3, applied: 0, improved: 0 } }),
    });
    await page.goto("/dashboard/settings/data");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download" }).click();
    expect((await download).suggestedFilename()).toBe("mileclear-data-export.json");
    await page.getByRole("button", { name: "Check" }).click();
    await expect(page.getByText("We checked 1,204 trips and found 3 to look at.")).toBeVisible();
    expect(seen.find((r) => r.path === "/trips/scan-low-confidence")?.body).toEqual({ scanOnly: true });
    await expect(page.getByRole("link", { name: "Open your Inbox" })).toHaveAttribute("href", "/dashboard/trips?view=inbox");
    await expect(page.getByRole("link", { name: /Delete account/ })).toHaveAttribute("href", "/dashboard/profile");
  });

  test("Discord: Link opens the authorise URL in a new tab with client=web", async ({ page }) => {
    await mockSession(page);
    const seen = await mockRoutes(page, {
      "GET /auth/discord/status": () => ({ data: { linked: false, discordUserId: null } }),
      "GET /auth/discord/start": () => ({ data: { url: "http://127.0.0.1:3999/fake-discord" } }),
    });
    await page.route("http://127.0.0.1:3999/fake-discord", (r) => r.fulfill({ contentType: "text/html", body: "<p>Discord</p>" }));
    await page.goto("/dashboard/settings/community");
    await expect(page.getByText("Join drivers on the MileClear Discord.")).toBeVisible();
    const popup = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Link Discord" }).click();
    await (await popup).waitForLoadState();
    expect(seen.find((r) => r.path === "/auth/discord/start")?.query).toBe("?client=web");
    await expect(page.getByText("Finish in the new tab. Come back here when it says you're done.")).toBeVisible();
    await expect(page.getByRole("link", { name: "join the server" })).toHaveAttribute("href", /discord\.gg/);
  });

  test("Discord: coming back with ?discord=linked shows the name; Unlink works", async ({ page }) => {
    await mockSession(page);
    let linked = true;
    const seen = await mockRoutes(page, {
      "GET /auth/discord/status": () => ({ data: { linked, discordUserId: "123" } }),
      "POST /auth/discord/unlink": () => {
        linked = false;
        return { data: { unlinked: true } };
      },
    });
    await page.goto("/dashboard/settings/community?discord=linked&username=sam_d");
    await expect(page.getByText("Linked as sam_d")).toBeVisible();
    await page.getByRole("button", { name: "Unlink" }).click();
    await expect(page.getByRole("button", { name: "Link Discord" })).toBeVisible();
    expect(seen.some((r) => r.path === "/auth/discord/unlink")).toBe(true);
  });

  test("Profile: saves names, requires a password for a new email, and shows the code step", async ({ page }) => {
    await mockSession(page);
    const store = profileStore(profile());
    const seen = await mockRoutes(page, {
      "GET /user/profile": () => ({ data: store.state }),
      "PATCH /user/profile": (req) => {
        Object.assign(store.state, { displayName: req.body?.displayName, fullName: req.body?.fullName });
        if (req.body?.email) store.state.pendingEmail = req.body.email;
        return { data: store.state };
      },
      "POST /auth/verify": () => {
        store.state.email = store.state.pendingEmail as string;
        store.state.pendingEmail = null;
        return { data: { verified: true } };
      },
    });
    await page.goto("/dashboard/profile");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your profile");
    await page.getByLabel("Display name").fill("Sammy");
    await page.getByLabel("Name for your exports").fill("Samuel Tester");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    expect(seen.find((r) => r.method === "PATCH")?.body).toEqual({ displayName: "Sammy", fullName: "Samuel Tester" });

    await page.getByLabel("Email").fill("new@example.test");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Enter your password to change your email.")).toBeVisible();
    expect(seen.filter((r) => r.method === "PATCH")).toHaveLength(1);
    await page.getByLabel("Password", { exact: true }).fill("secret-pass");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("heading", { name: "Confirm your new email" })).toBeVisible();
    expect(seen.filter((r) => r.method === "PATCH")[1].body).toMatchObject({ email: "new@example.test", currentPassword: "secret-pass" });
    await page.getByLabel("Code").fill("123456");
    await page.getByRole("button", { name: "Confirm email" }).click();
    await expect(page.getByRole("heading", { name: "Confirm your new email" })).toHaveCount(0);
    await expect(page.getByLabel("Email")).toHaveValue("new@example.test");
  });

  test("Profile: picking an avatar saves it and updates the picture", async ({ page }) => {
    await mockSession(page);
    const store = profileStore(profile());
    const seen = await mockRoutes(page, store.handlers);
    await page.goto("/dashboard/profile");
    await page.getByRole("button", { name: "Pick an avatar" }).click();
    await page.getByRole("button", { name: "Yellow Taxi" }).click();
    await expect.poll(() => seen.find((r) => r.method === "PATCH")?.body).toEqual({ avatarId: "taxi-yellow" });
    await expect(page.getByRole("button", { name: "Change avatar" })).toBeVisible();
  });

  test("Profile: change password checks the fields then posts", async ({ page }) => {
    await mockSession(page);
    const seen = await mockRoutes(page, {
      "POST /auth/change-password": () => ({ data: { accessToken: "a2", refreshToken: "r2" } }),
    });
    await page.goto("/dashboard/profile");
    await page.getByLabel("Current password").fill("old-password");
    await page.getByLabel("New password", { exact: true }).fill("short");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Your new password needs at least 8 characters.")).toBeVisible();
    await page.getByLabel("New password", { exact: true }).fill("a-long-password");
    await page.getByLabel("Repeat new password").fill("different-one");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("The new passwords don't match.")).toBeVisible();
    await page.getByLabel("Repeat new password").fill("a-long-password");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Password changed")).toBeVisible();
    expect(seen.find((r) => r.path === "/auth/change-password")?.body).toEqual({ currentPassword: "old-password", newPassword: "a-long-password" });
    expect(await page.evaluate(() => localStorage.getItem("mc_access_token"))).toBe("a2");
  });

  test("Profile: delete account asks for the password and only then sends it", async ({ page }) => {
    await mockSession(page);
    const seen = await mockRoutes(page, {
      "DELETE /user/account": (req) => (req.body?.password === "right-pass" ? { message: "Account deleted" } : reply(400, { error: "Password is required" })),
    });
    await page.goto("/dashboard/profile");
    await page.getByRole("button", { name: "Delete account" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Delete your account?" })).toBeVisible();
    expect(seen).toHaveLength(0); // opening the dialog sends nothing
    await dialog.getByRole("button", { name: "Delete my account" }).click();
    await expect(dialog.getByText("Password is required")).toBeVisible();
    await dialog.getByLabel("Your password").fill("right-pass");
    await page.route("http://localhost:3100/", (r) => r.fulfill({ contentType: "text/html", body: "<p>home</p>" }));
    await dialog.getByRole("button", { name: "Delete my account" }).click();
    await expect.poll(() => seen.filter((r) => r.path === "/user/account").length).toBe(2);
    expect(seen[1].body).toEqual({ password: "right-pass" });
    await expect(page).toHaveURL("http://localhost:3100/");
  });

  test("copy sweep over the settings pages", async ({ page }) => {
    await mockSession(page);
    await mockRoutes(page, {
      "GET /billing/status": () => FREE_BILLING,
      "GET /notifications/preferences": () => ({ data: {} }),
      "GET /auth/discord/status": () => ({ data: { linked: false } }),
      "GET /hmrc/status": () => ({ data: { connected: false } }),
    });
    for (const path of [
      "/dashboard/settings",
      "/dashboard/settings/plan",
      "/dashboard/settings/preferences",
      "/dashboard/settings/work-tax",
      "/dashboard/settings/business-profile",
      "/dashboard/settings/notifications",
      "/dashboard/settings/data",
      "/dashboard/settings/community",
      "/dashboard/profile",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.locator("main")).not.toBeEmpty();
      await page.waitForLoadState("networkidle");
      const text = await page.locator("body").innerText();
      for (const banned of BANNED_COPY) expect(text, `${path} contains ${banned}`).not.toMatch(banned);
    }
  });
});

test.describe("phone 390", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const path of [
    "/dashboard/settings",
    "/dashboard/settings/plan?reason=exports",
    "/dashboard/settings/preferences",
    "/dashboard/settings/work-tax",
    "/dashboard/settings/notifications",
    "/dashboard/profile",
  ]) {
    test(`${path} fits a 390px screen without sideways scrolling`, async ({ page }) => {
      await mockSession(page);
      await mockRoutes(page, {
        "GET /billing/status": () => FREE_BILLING,
        "GET /notifications/preferences": () => ({ data: {} }),
        "GET /hmrc/status": () => ({ data: { connected: false } }),
      });
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("the delete dialog is a sheet that fits the phone", async ({ page }) => {
    await mockSession(page);
    await page.goto("/dashboard/profile");
    await page.getByRole("button", { name: "Delete account" }).click();
    const box = await page.getByRole("dialog").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  });
});
