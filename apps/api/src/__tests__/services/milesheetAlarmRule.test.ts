import { describe, expect, it } from "vitest";
import { invitesStalled, planMilesheetAlarms } from "../../services/milesheetAlarmRule.js";

const NOW = new Date("2026-10-04T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);
const base = { now: NOW, invitesSentInWindow: 0, invitesAcceptedInWindow: 0, paymentFailures: [], lastAlarmAt: new Map<string, Date>() };

describe("Milesheet alarm rule", () => {
  it("fires when 3 or more invites went out in 5 days and nobody accepted", () => {
    expect(invitesStalled(3, 0)).toBe(true);
    expect(invitesStalled(2, 0)).toBe(false);
    expect(invitesStalled(11, 1)).toBe(false);
    const alarms = planMilesheetAlarms({ ...base, invitesSentInWindow: 11 });
    expect(alarms).toHaveLength(1);
    expect(alarms[0].conditionKey).toBe("invites_stalled");
    expect(alarms[0].body).toContain("11 team invites");
  });

  it("stays quiet for 2 days after alarming, then repeats", () => {
    const recent = new Map([["invites_stalled", hoursAgo(47)]]);
    expect(planMilesheetAlarms({ ...base, invitesSentInWindow: 5, lastAlarmAt: recent })).toEqual([]);
    const old = new Map([["invites_stalled", hoursAgo(49)]]);
    expect(planMilesheetAlarms({ ...base, invitesSentInWindow: 5, lastAlarmAt: old })).toHaveLength(1);
  });

  it("follows up a payment failure once the webhook's own alert is 2 days old, once per team", () => {
    const fresh = [{ orgId: "o1", orgName: "Acme", at: hoursAgo(5) }];
    expect(planMilesheetAlarms({ ...base, paymentFailures: fresh })).toEqual([]);
    const older = [
      { orgId: "o1", orgName: "Acme", at: hoursAgo(60) },
      { orgId: "o1", orgName: "Acme", at: hoursAgo(70) },
      { orgId: "o2", orgName: "Beta", at: hoursAgo(80) },
    ];
    const alarms = planMilesheetAlarms({ ...base, paymentFailures: older });
    expect(alarms.map((a) => a.conditionKey).sort()).toEqual(["payment_failed:o1", "payment_failed:o2"]);
    const deduped = planMilesheetAlarms({ ...base, paymentFailures: older, lastAlarmAt: new Map([["payment_failed:o1", hoursAgo(10)]]) });
    expect(deduped.map((a) => a.orgId)).toEqual(["o2"]);
  });

  it("sends nothing when all is well", () => {
    expect(planMilesheetAlarms({ ...base, invitesSentInWindow: 4, invitesAcceptedInWindow: 2 })).toEqual([]);
  });
});
