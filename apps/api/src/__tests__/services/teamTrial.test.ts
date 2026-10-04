/**
 * Milesheet free trial rules (services/teamTrial.ts) and the new-teams
 * switch (services/milesheetNewTeams.ts).
 */
import { describe, it, expect } from "vitest";
import {
  TEAM_TRIAL_DAYS,
  entitledOrgWhere,
  isOrgEntitled,
  stripeTrialEndFor,
  trialDaysLeft,
  trialEmailsEnabled,
  trialEndsAtForNewTeam,
  trialReminderStage,
  trialStateOf,
} from "../../services/teamTrial.js";
import {
  isDuplicateWaitlistRequest,
  newTeamsMode,
  nominationWaitlistMessage,
  SELF_SERVE_WAITLIST_MESSAGE,
} from "../../services/milesheetNewTeams.js";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = new Date("2026-10-04T12:00:00Z");
const at = (ms: number) => new Date(NOW.getTime() + ms);

const plain = { pilotFree: false, stripeSubscriptionId: null, trialEndsAt: null };

describe("newTeamsMode", () => {
  it("defaults to the waiting list when unset, empty or misspelt", () => {
    expect(newTeamsMode({})).toBe("waitlist");
    expect(newTeamsMode({ MILESHEET_NEW_TEAMS: "" })).toBe("waitlist");
    expect(newTeamsMode({ MILESHEET_NEW_TEAMS: "opne" })).toBe("waitlist");
    expect(newTeamsMode({ MILESHEET_NEW_TEAMS: "1" })).toBe("waitlist");
    expect(newTeamsMode({ MILESHEET_NEW_TEAMS: "waitlist" })).toBe("waitlist");
  });

  it("opens only on the word open, any case, ignoring spaces", () => {
    expect(newTeamsMode({ MILESHEET_NEW_TEAMS: "open" })).toBe("open");
    expect(newTeamsMode({ MILESHEET_NEW_TEAMS: " OPEN " })).toBe("open");
  });
});

describe("waiting-list wording", () => {
  it("names the manager and promises no date or price", () => {
    const m = nominationWaitlistMessage("boss@firm.co.uk");
    expect(m).toBe(
      "Milesheet is in a small pilot at the moment. We've added your company to the waiting list and will contact boss@firm.co.uk when places open."
    );
    for (const text of [m, SELF_SERVE_WAITLIST_MESSAGE]) {
      expect(text).not.toMatch(/£|\d+p\b|price|week|month|january|soon/i);
      expect(text).not.toContain("—");
    }
  });
});

describe("isDuplicateWaitlistRequest", () => {
  const row = {
    email: "Boss@Firm.co.uk",
    waitlistSource: "driver_nomination",
    nominatedByUserId: "u1",
    admittedAt: null,
    createdAt: at(-2 * DAY),
  };
  const req = { email: "boss@firm.co.uk", source: "driver_nomination" as const, nominatedByUserId: "u1" };

  it("folds a repeat of the same request into the first", () => {
    expect(isDuplicateWaitlistRequest(row, req, NOW)).toBe(true);
  });
  it("keeps a second driver naming the same manager as a separate request", () => {
    expect(isDuplicateWaitlistRequest(row, { ...req, nominatedByUserId: "u2" }, NOW)).toBe(false);
  });
  it("keeps a different source, an old request, or one already let in", () => {
    expect(isDuplicateWaitlistRequest(row, { ...req, source: "self_serve", nominatedByUserId: null }, NOW)).toBe(false);
    expect(isDuplicateWaitlistRequest({ ...row, createdAt: at(-31 * DAY) }, req, NOW)).toBe(false);
    expect(isDuplicateWaitlistRequest({ ...row, admittedAt: at(-DAY) }, req, NOW)).toBe(false);
  });
});

describe("trialEndsAtForNewTeam", () => {
  it("gives no trial while new teams are on the waiting list", () => {
    expect(trialEndsAtForNewTeam("waitlist", NOW, { creatorHadTrial: false })).toBeNull();
  });
  it("gives 30 days once new teams are open", () => {
    expect(TEAM_TRIAL_DAYS).toBe(30);
    expect(trialEndsAtForNewTeam("open", NOW, { creatorHadTrial: false })).toEqual(at(30 * DAY));
  });
  it("gives one trial per person who starts a team", () => {
    expect(trialEndsAtForNewTeam("open", NOW, { creatorHadTrial: true })).toBeNull();
  });
});

describe("isOrgEntitled / trialStateOf", () => {
  it("a team inside its trial is entitled like a pilot", () => {
    const org = { ...plain, trialEndsAt: at(DAY) };
    expect(isOrgEntitled(org, NOW)).toBe(true);
    expect(trialStateOf(org, NOW)).toBe("active");
  });

  it("a trial that has ended with no subscription entitles nothing", () => {
    const org = { ...plain, trialEndsAt: at(-1) };
    expect(isOrgEntitled(org, NOW)).toBe(false);
    expect(trialStateOf(org, NOW)).toBe("ended");
  });

  it("the trial ends exactly at trialEndsAt", () => {
    const org = { ...plain, trialEndsAt: NOW };
    expect(isOrgEntitled(org, NOW)).toBe(false);
    expect(trialStateOf(org, NOW)).toBe("ended");
  });

  it("a subscription or a pilot covers a team whose trial is over", () => {
    expect(isOrgEntitled({ ...plain, stripeSubscriptionId: "sub_1", trialEndsAt: at(-DAY) }, NOW)).toBe(true);
    expect(trialStateOf({ ...plain, stripeSubscriptionId: "sub_1", trialEndsAt: at(-DAY) }, NOW)).toBe("none");
    expect(isOrgEntitled({ ...plain, pilotFree: true, trialEndsAt: at(-DAY) }, NOW)).toBe(true);
    expect(trialStateOf({ ...plain, pilotFree: true, trialEndsAt: at(-DAY) }, NOW)).toBe("none");
  });

  it("a team that never had a trial is unchanged: pilot or subscribed, else nothing", () => {
    expect(isOrgEntitled(plain, NOW)).toBe(false);
    expect(trialStateOf(plain, NOW)).toBe("none");
    expect(isOrgEntitled({ ...plain, pilotFree: true }, NOW)).toBe(true);
    expect(isOrgEntitled({ ...plain, stripeSubscriptionId: "sub_1" }, NOW)).toBe(true);
  });

  it("the Prisma where matches the rule", () => {
    expect(entitledOrgWhere(NOW)).toEqual({
      OR: [{ pilotFree: true }, { stripeSubscriptionId: { not: null } }, { trialEndsAt: { gt: NOW } }],
    });
  });
});

describe("trialDaysLeft", () => {
  it("rounds part days up and never goes below zero", () => {
    expect(trialDaysLeft(null, NOW)).toBeNull();
    expect(trialDaysLeft(at(30 * DAY), NOW)).toBe(30);
    expect(trialDaysLeft(at(23 * HOUR), NOW)).toBe(1);
    expect(trialDaysLeft(at(6 * DAY + HOUR), NOW)).toBe(7);
    expect(trialDaysLeft(at(-DAY), NOW)).toBe(0);
  });
});

describe("trialReminderStage", () => {
  const trial = (ms: number) => ({ ...plain, trialEndsAt: at(ms) });
  it("is quiet until a week is left", () => {
    expect(trialReminderStage(trial(8 * DAY), NOW)).toBeNull();
    expect(trialReminderStage(trial(7 * DAY + 1), NOW)).toBeNull();
  });
  it("sends the 7-day one inside the last week", () => {
    expect(trialReminderStage(trial(7 * DAY), NOW)).toBe(7);
    expect(trialReminderStage(trial(2 * DAY), NOW)).toBe(7);
  });
  it("sends the 1-day one inside the last day", () => {
    expect(trialReminderStage(trial(DAY), NOW)).toBe(1);
    expect(trialReminderStage(trial(HOUR), NOW)).toBe(1);
  });
  it("sends nothing after the end, or to a team that subscribed or is a pilot", () => {
    expect(trialReminderStage(trial(-HOUR), NOW)).toBeNull();
    expect(trialReminderStage({ ...trial(2 * DAY), stripeSubscriptionId: "sub_1" }, NOW)).toBeNull();
    expect(trialReminderStage({ ...trial(2 * DAY), pilotFree: true }, NOW)).toBeNull();
    expect(trialReminderStage(plain, NOW)).toBeNull();
  });
});

describe("trialEmailsEnabled", () => {
  it("is off unless exactly 1", () => {
    expect(trialEmailsEnabled({})).toBe(false);
    expect(trialEmailsEnabled({ MILESHEET_TRIAL_EMAILS: "true" })).toBe(false);
    expect(trialEmailsEnabled({ MILESHEET_TRIAL_EMAILS: "1" })).toBe(true);
  });
});

describe("stripeTrialEndFor", () => {
  it("carries the rest of the trial into Stripe so nobody pays during it", () => {
    expect(stripeTrialEndFor(at(10 * DAY), NOW)).toBe(Math.floor(at(10 * DAY).getTime() / 1000));
  });
  it("leaves it out with no trial, an ended one, or under 48 hours left", () => {
    expect(stripeTrialEndFor(null, NOW)).toBeUndefined();
    expect(stripeTrialEndFor(at(-DAY), NOW)).toBeUndefined();
    expect(stripeTrialEndFor(at(47 * HOUR), NOW)).toBeUndefined();
  });
});
