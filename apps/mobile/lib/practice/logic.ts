// Practice accounts: pure helpers for the driver screens (no React, no I/O),
// so the wording and routing are unit-tested.

import type { DriverPracticeLink, DriverPracticeRequest, PracticeRequestType } from "../api/practice";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "31 Jan 2028" from an ISO instant, in UK time. */
export function longDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
}

/** "31 Jan" from an ISO instant (UK time) or a "YYYY-MM-DD" key. */
export function shortDay(value: string | null | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [, m, d] = value.split("-").map((n) => parseInt(n, 10));
    return `${d} ${MONTHS[m - 1]}`;
  }
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
}

/** "Today, 10:42" / "3 Oct" for the access log. */
export function logWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const sameDay =
    d.toLocaleDateString("en-GB", { timeZone: "Europe/London" }) ===
    now.toLocaleDateString("en-GB", { timeZone: "Europe/London" });
  if (sameDay) {
    const t = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
    return `Today, ${t}`;
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "Europe/London",
  });
}

/** The one button on a request card. */
export function requestActionLabel(type: PracticeRequestType): string {
  switch (type) {
    case "sort_trips":
      return "Sort trips";
    case "add_earnings":
      return "Add earnings";
    case "add_expenses":
      return "Add expenses";
    case "check_details":
      return "Check details";
    default:
      return "Open";
  }
}

/** Where the request's button goes, or null to stay put ("Something else"). */
export function requestRoute(type: PracticeRequestType): string | null {
  switch (type) {
    case "sort_trips":
      return "/(tabs)/trips?filter=unclassified";
    case "add_earnings":
      return "/earning-form";
    case "add_expenses":
      return "/expense-form";
    case "check_details":
      return "/vehicles";
    default:
      return null;
  }
}

/** Home ask title: "Smith & Co asked you to sort 12 trips". */
export function requestAskTitle(r: Pick<DriverPracticeRequest, "type" | "countAtSend" | "practiceName">): string {
  const firm = r.practiceName;
  switch (r.type) {
    case "sort_trips":
      return r.countAtSend
        ? `${firm} asked you to sort ${r.countAtSend} trip${r.countAtSend === 1 ? "" : "s"}`
        : `${firm} asked you to sort your trips`;
    case "add_earnings":
      return `${firm} asked you to add your earnings`;
    case "add_expenses":
      return `${firm} asked you to add your expenses`;
    case "check_details":
      return `${firm} asked you to check your details`;
    default:
      return `${firm} sent you a request`;
  }
}

export type HomePracticeAsk =
  | { kind: "consent"; link: DriverPracticeLink }
  | { kind: "renewal"; link: DriverPracticeLink }
  | { kind: "request"; request: DriverPracticeRequest };

/**
 * The one practice thing Home shows: an unanswered ask from a practice
 * first (nothing is shared until the driver answers), then the keep-sharing
 * prompt, then the oldest open request.
 */
export function pickHomePracticeAsk(
  links: DriverPracticeLink[],
  requests: DriverPracticeRequest[]
): HomePracticeAsk | null {
  const asking = links.find((l) => l.state === "asking");
  if (asking) return { kind: "consent", link: asking };
  const renewal = links.find((l) => l.state === "sharing" && l.renewalDue);
  if (renewal) return { kind: "renewal", link: renewal };
  const open = requests.find((r) => r.status === "open");
  if (open) return { kind: "request", request: open };
  return null;
}

/** "Until 31 Jan 2028. We'll ask you before it ends." */
export function durationLine(endsAt: string | null): string {
  return endsAt ? `Until ${longDate(endsAt)}. We'll ask you before it ends.` : "We'll ask you before it ends.";
}

/** "Jane Smith · ICAEW" */
export function practiceSubline(p: { contactName: string | null; professionalBody: string | null }): string {
  return [p.contactName, p.professionalBody].filter(Boolean).join(" · ");
}

/** What a linked card says about scope. */
export function scopeSummary(l: Pick<DriverPracticeLink, "sharePersonalTrips">): string {
  return l.sharePersonalTrips ? "Business and personal" : "Business only";
}
