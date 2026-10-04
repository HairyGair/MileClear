// When should the Milesheet alarm go off? (4 Oct 2026)
//
// Until 4 Oct 2026 every team invite link pointed at the API and 404'd, so
// not one invite was ever accepted and nobody noticed for six weeks. This
// rule catches that shape of failure early: invites are going out but
// nobody is getting in. It also follows up team payment failures: the Stripe
// webhook alerts once at the moment of failure (services/teamBilling.ts), and
// while the failure stays unresolved this repeats it every 2 days for a week.
// The job counts the webhook's own alert as the first one, so a failure is
// never alarmed twice in the same 2 days.
//
// Pure: the job (jobs/milesheetAlarm.ts) counts the events and records each
// alarm it sends as an AppEvent, and this decides. Each condition alarms at
// most once per 2 days.

export const ALARM_WINDOW_DAYS = 5;
export const ALARM_MIN_INVITES = 3;
export const ALARM_REPEAT_DAYS = 2;
export const PAYMENT_FOLLOW_UP_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface MilesheetAlarmInput {
  now: Date;
  /** Invites sent in the last ALARM_WINDOW_DAYS (see invitesInEvent). */
  invitesSentInWindow: number;
  /** team.invite_accepted events in the last ALARM_WINDOW_DAYS. */
  invitesAcceptedInWindow: number;
  /** Unresolved team.payment_failed events from the last PAYMENT_FOLLOW_UP_DAYS
   *  (no later active subscription update for that team). */
  paymentFailures: Array<{ orgId: string; orgName: string; at: Date }>;
  /** When each condition last alarmed, keyed by conditionKey. */
  lastAlarmAt: ReadonlyMap<string, Date>;
}

export interface MilesheetAlarm {
  /** Dedup key, stored on the AppEvent the job writes. */
  conditionKey: string;
  title: string;
  body: string;
  orgId: string | null;
}

export function invitesStalled(sent: number, accepted: number): boolean {
  return sent >= ALARM_MIN_INVITES && accepted === 0;
}

function recentlyAlarmed(key: string, input: MilesheetAlarmInput): boolean {
  const last = input.lastAlarmAt.get(key);
  return !!last && input.now.getTime() - last.getTime() < ALARM_REPEAT_DAYS * DAY_MS;
}

export function planMilesheetAlarms(input: MilesheetAlarmInput): MilesheetAlarm[] {
  const alarms: MilesheetAlarm[] = [];

  if (invitesStalled(input.invitesSentInWindow, input.invitesAcceptedInWindow)) {
    const key = "invites_stalled";
    if (!recentlyAlarmed(key, input)) {
      alarms.push({
        conditionKey: key,
        title: "Milesheet: invites going out, nobody joining",
        body: `${input.invitesSentInWindow} team invites sent in the last ${ALARM_WINDOW_DAYS} days and none accepted. Check an invite link opens and works (until 4 Oct 2026 every link was broken).`,
        orgId: null,
      });
    }
  }

  const latestByOrg = new Map<string, { orgName: string; at: Date }>();
  for (const f of input.paymentFailures) {
    const prev = latestByOrg.get(f.orgId);
    if (!prev || f.at > prev.at) latestByOrg.set(f.orgId, { orgName: f.orgName, at: f.at });
  }
  for (const [orgId, f] of latestByOrg) {
    const key = `payment_failed:${orgId}`;
    if (recentlyAlarmed(key, input)) continue;
    // The webhook alerted at the moment of failure: that is the first alarm.
    if (input.now.getTime() - f.at.getTime() < ALARM_REPEAT_DAYS * DAY_MS) continue;
    alarms.push({
      conditionKey: key,
      title: "Milesheet: team payment still failing",
      body: `${f.orgName}'s seat billing payment failed and has not recovered yet. Stripe retries on its own; drivers keep Pro for now. Check the team page.`,
      orgId,
    });
  }

  return alarms;
}
