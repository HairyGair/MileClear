/** Press releases for /press and /press/[slug].
 *
 *  A release only appears (on /press, at /press/<slug> and in the sitemap)
 *  when `published` is true. Until then /press shows "No releases yet" and
 *  /press/<slug> returns a 404, so nothing can be found early.
 *
 *  Copy rules: plain UK English, no em dashes, never a positive adjective
 *  about MileClear next to "HMRC", never say MileClear files tax, and no
 *  traction figures other than the community numbers a release is about. */

export type PressBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "quote"; text: string; cite: string };

export interface PressRelease {
  slug: string;
  title: string;
  /** Sub-headline under the title. */
  standfirst: string;
  /** ISO date (YYYY-MM-DD). Used for the dateline, sorting and the sitemap. */
  date: string;
  /** Town in the dateline ("Sunderland, 5 October 2026"). */
  dateline: string;
  /** One or two sentences for the /press list and the meta description. */
  summary: string;
  published: boolean;
  /** Optional embargo: not live until this instant (ISO), even when published. */
  publishAt?: string;
  body: PressBlock[];
  notesToEditors: PressBlock[];
}

export const PRESS_CONTACT_EMAIL = "support@mileclear.com";

export const PRESS_RELEASES: PressRelease[] = [
  {
    slug: "september-2026-community-numbers",
    title: "Delivery and gig drivers logged 572,000 miles in September, says Sunderland-made app",
    standfirst:
      "MileClear's first monthly community numbers show 785 drivers recording 255,099 business miles, worth an estimated £138,000 in mileage claims, as its Tyne Tunnel billboard goes up",
    // Figures re-checked against mileclear.com/community 2 Oct 2026 ~22:30;
    // quote approved by Anthony 2 Oct (one accuracy edit: "claimed against
    // your tax", not "come off your tax bill").
    date: "2026-10-03",
    publishAt: "2026-10-03T07:15:00Z", // 08:15 BST, with the pitch emails
    dateline: "Sunderland",
    summary:
      "In September 2026, 785 drivers using MileClear recorded 572,493 miles across 55,931 trips, including 255,099 business miles worth an estimated £138,000 in mileage claims.",
    published: true,
    body: [
      {
        type: "p",
        text: "Drivers using MileClear, a free mileage tracker built in Sunderland, recorded 572,493 miles across 55,931 trips in September 2026. Of those, 255,099 were business miles, worth an estimated £138,000 in mileage claims at HMRC's mileage rates. 785 drivers recorded at least one trip during the month, and 532 new drivers joined. The busiest day was Wednesday 30 September, with 2,421 trips and 22,154 miles. The regions with the most active drivers were the South East (130), the North West (92) and Yorkshire and the Humber (78).",
      },
      {
        type: "p",
        text: "MileClear is made by Anthony Gair in Sunderland for delivery riders, couriers, taxi and private hire drivers, and anyone self-employed who drives for work. This week it is on a billboard at the Tyne Tunnel, from 1 to 8 October.",
      },
      {
        type: "quote",
        text: "I kept seeing drivers online saying they'd lost track of their miles, or were writing them in a notebook at the end of a long shift. Those miles are money. If you drive for work, every business mile can be claimed against your tax, and from this April that's 55p a mile for the first 10,000. Most people don't claim what they're owed because keeping the record is a pain. So I built something that keeps it for you. It's made here in Sunderland, it's free, and seeing it up at the Tyne Tunnel is a proud moment.",
        cite: "Anthony Gair, founder of MileClear",
      },
      { type: "h2", text: "What drivers can claim, and why the record matters" },
      {
        type: "p",
        text: "Self-employed drivers can claim business mileage at a flat rate instead of adding up fuel, insurance and repairs. For cars and vans that rate rose on 6 April 2026 from 45p to 55p a mile for the first 10,000 business miles, the first change since 2011, and stays at 25p a mile after that. Claims need a record of each journey. With the 31 January 2027 Self Assessment deadline for the 2025-26 tax year approaching, a missing log can mean claiming less than drivers are entitled to.",
      },
      { type: "h2", text: "How MileClear works" },
      {
        type: "p",
        text: "MileClear records drives automatically in the background on iPhone and Android. In September, 98% of trips were recorded this way rather than typed in. Drivers sort each trip as business or personal, and the app keeps a running total of miles and the mileage claim they add up to. Tracking is free. An optional Pro plan at £4.99 a month adds exports and extra reports. MileClear does not file tax returns; it keeps the record a driver or their accountant needs.",
      },
      { type: "p", text: "New free features added in the last few weeks include:" },
      {
        type: "ul",
        items: [
          "a morning alert for the cheapest fuel near where a driver usually sets off, sent only when it saves at least 3p a litre",
          "Drivers near you, an anonymous comparison of weekly miles with drivers in the same postcode area",
          "a trial of road alerts for closures and delays on the roads a driver uses most",
          "a Ready for 31 January checklist for the 2025-26 Self Assessment return",
        ],
      },
      { type: "h2", text: "Community numbers, every month" },
      {
        type: "p",
        text: "MileClear now publishes its numbers each month at mileclear.com/community. Figures for a region are only shown when enough drivers are in it to keep everyone anonymous.",
      },
    ],
    notesToEditors: [
      {
        type: "p",
        text: "About MileClear. MileClear is a UK mileage tracker for gig, delivery and self-employed drivers, made by Anthony Gair in Sunderland. It is free on iPhone and Android, with an optional Pro plan at £4.99 a month. Figures in this release cover September 2026 and come from mileclear.com/community. The mileage claim figure is an estimate at HMRC's mileage rates, not money claimed or paid.",
      },
      {
        type: "p",
        text: "Images: the founder photo, logos, app screenshots, the October campaign artwork and the Tyne Tunnel billboard design are in the press kit at mileclear.com/press.",
      },
    ],
  },
];

/** Published releases, newest first. */
export function getPublishedReleases(): PressRelease[] {
  return PRESS_RELEASES.filter(isLive).sort((a, b) => b.date.localeCompare(a.date));
}

/** Published, and past its embargo time if it has one. */
function isLive(r: PressRelease): boolean {
  return r.published && (!r.publishAt || Date.now() >= Date.parse(r.publishAt));
}

/** A release by slug, only if it is published. */
export function getPublishedRelease(slug: string): PressRelease | undefined {
  return PRESS_RELEASES.find((r) => r.slug === slug && isLive(r));
}

/** "5 October 2026" from "2026-10-05". */
export function formatPressDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
