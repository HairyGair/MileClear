// Words for the GOV.UK hand-off sheets (HMRC redesign spec 4.4): the short
// sheet a driver sees before we send them to a page only HMRC can run. One
// component (components/HmrcHandoffSheet.tsx) shows any of these.
//
// Pure, so the copy is tested. No em dashes; never an adjective about
// MileClear next to "HMRC".

import { isMtdTest, type HmrcEnv } from "./mtdCopy";
import { GOVUK_MTD_SIGN_UP } from "./mtdSignUp";
import { GOVUK_PAY_SELF_ASSESSMENT } from "./mtdBalance";

export type HandoffKind = "signUp" | "connect" | "pay" | "file" | "addBusiness";

/** HMRC's page for signing in to file a Self Assessment return. */
export const GOVUK_FILE_SELF_ASSESSMENT = "https://www.gov.uk/log-in-file-self-assessment-tax-return";

export interface HandoffStep {
  title: string;
  body?: string;
}

export interface HandoffRow {
  label: string;
  value: string;
}

export interface HandoffCopy {
  kind: HandoffKind;
  /** The small pill at the top: where the button takes them. */
  pill: string;
  title: string;
  /** One line on why this happens away from MileClear. */
  why: string | null;
  /** Figures shown as label/value rows (Pay). */
  rows: HandoffRow[];
  /** Numbered "what happens there". */
  steps: HandoffStep[];
  /** "Have ready" box. */
  haveReady: string | null;
  /** "Then come back here" box. */
  comeBack: string | null;
  primary: string;
  /** True when the primary button opens a web page (shows the open icon). */
  primaryOpensWeb: boolean;
  secondary: string | null;
  /** The page the primary button opens; null for Connect (the server gives the sign-in link). */
  url: string | null;
}

export const COME_BACK_TITLE = "Then come back here";
export const HAVE_READY_TITLE = "Have ready";

export function signUpHandoff(): HandoffCopy {
  return {
    kind: "signUp",
    pill: "Opens GOV.UK",
    title: "Sign up with HMRC",
    why: "Only HMRC can sign you up, so this part happens on GOV.UK. It's free and you only do it once.",
    rows: [],
    steps: [
      { title: "Sign in", body: "With your Government Gateway user ID and password." },
      { title: "Check your details", body: "HMRC shows what it has for you and your driving business." },
      {
        title: "Answer a few questions and confirm",
        body: "About your income. HMRC tells you if you can't sign up online yet, and what to do instead.",
      },
    ],
    haveReady: null,
    comeBack: "Tap \"I've done this\" and we'll take you to step 2. We'll keep your place.",
    primary: "Open GOV.UK",
    primaryOpensWeb: true,
    secondary: "I've done this already",
    url: GOVUK_MTD_SIGN_UP,
  };
}

export function connectHandoff(env: HmrcEnv): HandoffCopy {
  const test = isMtdTest(env);
  return {
    kind: "connect",
    pill: "Opens HMRC sign-in",
    title: test ? "Sign in to HMRC's test service" : "Sign in to HMRC",
    why: test
      ? "This is the test version, so nothing reaches your real tax account."
      : null,
    rows: [],
    steps: [
      { title: "Sign in with your Government Gateway user ID" },
      { title: "Enter the code HMRC texts you, if it asks" },
      { title: "Tap to give MileClear permission to send your updates" },
    ],
    haveReady: null,
    comeBack: "You'll come straight back here. If you close the page by mistake, tap Connect again.",
    primary: "Continue to HMRC",
    primaryOpensWeb: false,
    secondary: null,
    url: null,
  };
}

/** What a driver is asked to pay, as the sheet shows it. */
export interface PayFigures {
  amountPence: number;
  /** ISO date to pay by, or null when HMRC gave none. */
  payBy: string | null;
  /** "Was due" when the only date is one already passed (all of it is late). */
  dateLabel: "Pay by" | "Was due";
  /** True when the amount includes money already late. */
  late: boolean;
}

/** "31 January 2027" from "2027-01-31". */
export function longDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
}

/**
 * The amount and date for the Pay sheet from HMRC's balance: what's late
 * plus what's due now; failing that, what's coming up. Null when nothing is owed.
 */
export function payFigures(b: {
  overduePence: number;
  overdueSince: string | null;
  dueNowPence: number;
  dueNowDate: string | null;
  comingUpPence: number;
  comingUpDate: string | null;
}): PayFigures | null {
  const now = b.overduePence + b.dueNowPence;
  if (now > 0) {
    return {
      amountPence: now,
      payBy: b.dueNowPence > 0 ? b.dueNowDate : b.overdueSince,
      dateLabel: b.dueNowPence > 0 ? "Pay by" : "Was due",
      late: b.overduePence > 0,
    };
  }
  if (b.comingUpPence > 0) return { amountPence: b.comingUpPence, payBy: b.comingUpDate, dateLabel: "Pay by", late: false };
  return null;
}

export function payHandoff(figures: PayFigures | null, formatAmount: (pence: number) => string): HandoffCopy {
  const rows: HandoffRow[] = [];
  if (figures) {
    rows.push({ label: "Amount", value: formatAmount(figures.amountPence) });
    if (figures.payBy) {
      rows.push({ label: figures.dateLabel, value: longDate(figures.payBy) });
    }
  }
  return {
    kind: "pay",
    pill: "Opens GOV.UK",
    title: "Pay HMRC",
    why: "Only HMRC takes the payment, so this part happens on GOV.UK.",
    rows,
    steps: [],
    haveReady:
      "Your payment reference is your 10-digit UTR followed by K. Your UTR is on letters from HMRC and in the HMRC app.",
    comeBack: "HMRC can take a few days to show the payment here.",
    primary: "Open GOV.UK",
    primaryOpensWeb: true,
    secondary: null,
    url: GOVUK_PAY_SELF_ASSESSMENT,
  };
}

export function fileHandoff(): HandoffCopy {
  return {
    kind: "file",
    pill: "Opens GOV.UK",
    title: "File your tax return on GOV.UK",
    why: "MileClear doesn't file your tax return, so this part happens on GOV.UK.",
    rows: [],
    steps: [],
    haveReady: "Your figures from Tax > Self Assessment, box by box.",
    comeBack: null,
    primary: "Open GOV.UK",
    primaryOpensWeb: true,
    secondary: "See my figures first",
    url: GOVUK_FILE_SELF_ASSESSMENT,
  };
}

/**
 * HMRC has no self-employed business for the driver (spec 4.9). Only HMRC
 * can add one, and how depends on their HMRC account, so this sheet points at
 * HMRC's own guidance rather than naming screens we can't see.
 */
export function addBusinessHandoff(): HandoffCopy {
  return {
    kind: "addBusiness",
    pill: "Opens GOV.UK",
    title: "Add your self-employment",
    why: "Only HMRC can add a business to your sign-up, so this part happens on GOV.UK.",
    rows: [],
    steps: [
      { title: "Read HMRC's steps", body: "GOV.UK explains how to sign up and which businesses to add." },
      { title: "Add your self-employment", body: "In your HMRC online account, with your Government Gateway login." },
    ],
    haveReady: null,
    comeBack: "When HMRC shows your business, come back and tap Check again.",
    primary: "Open GOV.UK",
    primaryOpensWeb: true,
    secondary: null,
    url: GOVUK_MTD_SIGN_UP,
  };
}
