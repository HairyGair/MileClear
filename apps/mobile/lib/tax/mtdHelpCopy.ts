// Words for the three quarterly-updates help screens (SPEC 4.7, 4.8) and the
// routes the hub links to. Plain English, no em dashes, never an adjective
// about MileClear next to HMRC.
//
// The penalty facts were checked on GOV.UK on 1 Nov 2026:
//   https://www.gov.uk/guidance/penalties-for-making-tax-digital-for-income-tax
//   https://www.gov.uk/guidance/use-making-tax-digital-for-income-tax/send-quarterly-updates
// Re-check both before the 2027-28 tax year starts: that is when points begin.

/** Routes for the hub's help (?) menu and anything else that links to them. */
export const MTD_EXPLAINER_ROUTE = "/tax-mtd-explainer";
export const MTD_LATE_ROUTE = "/tax-mtd-late";
export const MTD_SENDS_ROUTE = "/tax-mtd-sends";

export const GOVUK_MTD_PENALTIES = "https://www.gov.uk/guidance/penalties-for-making-tax-digital-for-income-tax";
export const GOVUK_MTD_SEND_UPDATES =
  "https://www.gov.uk/guidance/use-making-tax-digital-for-income-tax/send-quarterly-updates";

export type ExplainerArt = "rhythm" | "free" | "running" | "dates" | "sends";

export interface ExplainerCard {
  art: ExplainerArt;
  title: string;
  body: string;
  /** Optional boxed tip: bold lead + text. */
  tip?: { lead: string; text: string };
  /** The last card carries the finish button. */
  last?: boolean;
}

export const EXPLAINER_CARDS: readonly ExplainerCard[] = [
  {
    art: "rhythm",
    title: "HMRC wants to hear from you every 3 months",
    body: "Instead of only once a year, you send a short update of your earnings and costs four times a year. MileClear works it out from your trips and earnings.",
  },
  {
    art: "free",
    title: "Sending an update costs nothing",
    body: "You don't pay anything when you send one. HMRC uses it to give you an estimate of your tax bill as the year goes on.",
  },
  {
    art: "running",
    title: "Each update is a running total",
    body: "Every update covers everything from 6 April up to the end of the latest quarter. Not just the last three months.",
    tip: {
      lead: "Made a mistake?",
      text: "Fix it in MileClear. Your next update carries the right totals, so you don't need to go back and redo old ones.",
    },
  },
  {
    art: "dates",
    title: "Four dates to remember",
    body: "Then you finish the year by 31 January. We remind you before each one.",
  },
  {
    art: "sends",
    title: "What MileClear sends",
    body: "Your self-employed driving earnings, mileage and costs. Not rent, a job or other income: those go to HMRC another way. Finishing the year isn't in MileClear yet.",
    last: true,
  },
];

/** The four dates on card 4. */
export const DEADLINE_DATES = ["7 August", "7 November", "7 February", "7 May"] as const;

export interface HelpSection {
  heading?: string;
  body: string;
}

export const LATE_TITLE = "Missed a deadline?";
export const LATE_SECTIONS: readonly HelpSection[] = [
  {
    body: "Send it as soon as you can. You can still send a late update from the quarterly updates screen, the same way as an on-time one.",
  },
  {
    heading: "Penalties for late updates",
    body: "For the 2026-27 tax year, HMRC says there are no penalties for missing a quarterly update deadline.",
  },
  {
    heading: "From 2027-28",
    body: "Each late update, or late tax return, gets a penalty point. At 4 points HMRC charges a £200 penalty. Points drop off by themselves after 24 months while you're under the limit.",
  },
  {
    heading: "You still have to send them",
    body: "You need to have sent your quarterly updates before you can send your tax return using software.",
  },
  {
    heading: "Paying late is separate",
    body: "A late tax return still gets penalty points this year. Tax paid late costs interest from the first day it is late, and more charges if it stays late.",
  },
  {
    heading: "Something wrong with MileClear?",
    body: "If you couldn't send because of a problem with MileClear, tell us from More > Tell us about a problem and we'll help.",
  },
];

export const SENDS_TITLE = "What MileClear sends, and what it doesn't";
export const SENDS_SECTIONS: readonly (HelpSection & { icon: "checkmark-circle" | "close-circle" })[] = [
  {
    icon: "checkmark-circle",
    heading: "What goes to HMRC",
    body: "Totals only: your self-employed earnings from driving, your business mileage claimed at the mileage rate, and the costs you've logged that can be claimed with it. Your National Insurance number goes with it, so HMRC knows who it's from.",
  },
  {
    icon: "close-circle",
    heading: "What doesn't",
    body: "Individual trips, routes, receipts and invoices stay in MileClear. Fuel, insurance and repairs aren't sent as separate costs, because the mileage rate already covers them.",
  },
  {
    icon: "close-circle",
    heading: "Other income",
    body: "A job, rent, savings or any other business isn't included. Those go to HMRC another way.",
  },
  {
    icon: "close-circle",
    heading: "Finishing the year",
    body: "The end-of-year step, where you confirm your figures, isn't in MileClear yet. You do that with HMRC, or with other software.",
  },
  {
    icon: "checkmark-circle",
    heading: "You check it first",
    body: "Nothing is sent until you've looked at the figures and pressed send.",
  },
];
