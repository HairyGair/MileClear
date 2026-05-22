// HMRC deadline calendar — used by /deadline slash command + future
// dashboard countdowns.
//
// Each entry is a recurring rule (month + day) with a label and a
// what-it-means line. nextOccurrences() returns the next N deadlines
// from a given date, accounting for year-wrap.
//
// We keep this in-house rather than calling HMRC's API because (a) the
// dates are stable and well-known, (b) HMRC doesn't expose a clean
// calendar API anyway, and (c) we want to control the explanatory copy.

export interface HmrcDeadlineRule {
  /** Slug for analytics / dedup if we ever post these as reminders. */
  id: string;
  /** Calendar month (1-12). */
  month: number;
  /** Day of month (1-31). 0-based day-of-year would let us span
   *  leap years cleanly but every HMRC date is a fixed gregorian
   *  one, so MM-DD is fine. */
  day: number;
  /** Short label shown next to the countdown. */
  label: string;
  /** One-line explanation of what the deadline is for. */
  what: string;
}

export const HMRC_DEADLINES: HmrcDeadlineRule[] = [
  {
    id: "sa-online-jan31",
    month: 1,
    day: 31,
    label: "Self Assessment (online) + balancing payment",
    what:
      "Online tax returns + final payment for the previous tax year. £100 penalty starts at 23:59.",
  },
  {
    id: "sa-poa-jan31",
    month: 1,
    day: 31,
    label: "1st Payment on Account",
    what:
      "If last year's bill was over £1,000, the first prepayment toward next year's tax is due alongside the SA balancing payment.",
  },
  {
    id: "tax-year-end-apr5",
    month: 4,
    day: 5,
    label: "Tax year ends",
    what:
      "The UK tax year runs 6 April to 5 April. Anything earned by 23:59 on 5 April goes in this year's return.",
  },
  {
    id: "tax-year-start-apr6",
    month: 4,
    day: 6,
    label: "New tax year begins",
    what:
      "Fresh £12,570 personal allowance, fresh 10,000-mile AMAP threshold. From 6 April 2026, the AMAP rate for cars and vans is 55p per mile (up from 45p) for the first 10k miles.",
  },
  {
    id: "sa-poa-jul31",
    month: 7,
    day: 31,
    label: "2nd Payment on Account",
    what:
      "The second prepayment toward your current-year tax bill, if you have payments on account active.",
  },
  {
    id: "sa-register-oct5",
    month: 10,
    day: 5,
    label: "Register for Self Assessment",
    what:
      "If you started self-employed work in the previous tax year and haven't registered yet, today's the deadline. Miss it and the penalty is 100% of tax owed (capped).",
  },
  {
    id: "sa-paper-oct31",
    month: 10,
    day: 31,
    label: "Self Assessment (paper)",
    what:
      "Paper SA returns are due. Online filing buys you 3 more months (until 31 January). Most drivers should be filing online.",
  },
];

export interface UpcomingDeadline extends HmrcDeadlineRule {
  /** Resolved date for the upcoming occurrence. */
  date: Date;
  /** Days from `now` until `date` (inclusive of today). */
  daysAway: number;
}

/**
 * Return the next N HMRC deadlines from `now`, in chronological order.
 * Today counts as 0 days away; a deadline that's already passed today
 * rolls over to next year.
 */
export function nextOccurrences(now: Date, limit = 3): UpcomingDeadline[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const out: UpcomingDeadline[] = [];

  for (const rule of HMRC_DEADLINES) {
    // Try this year first; if past, try next year.
    let date = new Date(today.getFullYear(), rule.month - 1, rule.day);
    if (date < today) {
      date = new Date(today.getFullYear() + 1, rule.month - 1, rule.day);
    }
    const daysAway = Math.round(
      (date.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)
    );
    out.push({ ...rule, date, daysAway });
  }

  return out.sort((a, b) => a.daysAway - b.daysAway).slice(0, limit);
}
