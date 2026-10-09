// All tour copy and the rules for which stops a driver sees. Pure.
// Copy rules: plain UK English, sentence case, no em dashes, no "HMRC",
// "Pro" never "Premium". `data-tour` values are a contract with the Shell,
// HomeGrid, SetupChecklist and e2e/tour.spec.ts.

export type StepId = "opening" | "home" | "trips" | "slot3" | "more" | "mode" | "account";
export type HomeKind = "figure" | "empty" | "personal" | "setup" | "none";
export type Side = "right" | "below" | "above" | "left" | "center";
export type Align = "start" | "end" | "center";
export type Shape = "md" | "circle" | "pill" | "none";

export interface TourCtx {
  /** The view actually shown. */
  mode: "work" | "personal";
  /** The Settings choice. Only "both" shows the switch. */
  baseMode: "work" | "personal" | "both";
  isCompanyDriver: boolean;
  isGigDriver: boolean;
  isEmployee: boolean;
  workType: string | null;
  unclassified: number;
  existingAccount: boolean;
  /** What Home is showing, read from the page when the tour starts. */
  homeKind: HomeKind;
}

export interface TourStep {
  id: StepId;
  /** `data-tour` values to try, in order. Empty for the opening stop. */
  target: string[];
  title: string;
  body: string;
  /** Read out after the body: what is highlighted. Empty for the opening stop. */
  srWhere: string;
  side: Side;
  align: Align;
  /** Padding around the target for the ring, px. */
  pad: number;
  shape: Shape;
  /** A page target that may need scrolling into view. */
  page: boolean;
}

export function tripsBody(baseMode: TourCtx["baseMode"], unclassified: number): string {
  if (baseMode === "personal") {
    return "Every trip your phone recorded, newest first. Fix one, or add a trip you made without the app.";
  }
  const base = "New trips wait in the Inbox until you mark them Business or Personal.";
  if (unclassified <= 0) return base;
  return `${base} ${unclassified} waiting now.`;
}

function homeStep(ctx: TourCtx): TourStep | null {
  const common = { side: "below" as const, align: "start" as const, pad: 6, shape: "md" as const, page: true };
  switch (ctx.homeKind) {
    case "figure":
      return {
        ...common,
        id: "home",
        target: ["home-hero"],
        title: "Your business miles",
        body: "Business miles this tax year and roughly what they are worth, from the trips your phone recorded. It updates as you sort trips.",
        srWhere: "Highlighted: your business miles on Home.",
      };
    case "empty":
      return {
        ...common,
        id: "home",
        target: ["home-hero"],
        title: "Your business miles",
        body: "Once you mark trips as Business, your miles and what they are worth show up here.",
        srWhere: "Highlighted: your business miles on Home.",
      };
    case "personal":
      return {
        ...common,
        id: "home",
        target: ["home-hero"],
        title: "Your driving at a glance",
        body: "Miles and trips from what your phone recorded, kept up to date for you.",
        srWhere: "Highlighted: your driving summary on Home.",
      };
    case "setup":
      return {
        ...common,
        id: "home",
        target: ["home-setup"],
        title: "A couple of things first",
        body: "Add your vehicle and record a first trip with the app. These go away once they are done.",
        srWhere: "Highlighted: your setup list on Home.",
      };
    default:
      return null;
  }
}

function slot3Step(ctx: TourCtx): TourStep {
  const base = { id: "slot3" as const, target: ["nav-slot3"], side: "right" as const, align: "center" as const, pad: 4, shape: "md" as const, page: false };
  if (ctx.mode === "personal") {
    return {
      ...base,
      title: "Insights",
      body: "Your driving over time: monthly miles, patterns and how you compare with drivers near you.",
      srWhere: "Highlighted: Insights in the main menu.",
    };
  }
  let body: string;
  if (ctx.isCompanyDriver) body = "Your business miles and downloads for the tax year.";
  else if (ctx.isGigDriver) body = "What you may owe, what to put by each week, your Self Assessment figures and downloads.";
  else if (ctx.isEmployee) body = "Your mileage claim, Mileage Allowance Relief and downloads for the tax year.";
  else body = "Your tax figures and downloads. Tell us how you work in Settings so we can show the right ones.";
  return { ...base, title: "Tax", body, srWhere: "Highlighted: Tax in the main menu." };
}

function moreStep(ctx: TourCtx): TourStep {
  let body: string;
  if (ctx.mode === "personal") body = "Vehicles, fuel, saved places, achievements, help and settings. Tax is in here too.";
  else if (ctx.isCompanyDriver) body = "Vehicles, fuel, saved places, your odometer log, help and settings.";
  else body = "Vehicles, earnings, expenses, invoices, fuel, saved places, help and settings.";
  return {
    id: "more",
    target: ["nav-more"],
    title: "Everything else",
    body,
    srWhere: "Highlighted: More in the main menu.",
    side: "right",
    align: "center",
    pad: 4,
    shape: "md",
    page: false,
  };
}

/** The stops for this driver, before any are dropped for a missing target. */
export function buildTourSteps(ctx: TourCtx): TourStep[] {
  const steps: TourStep[] = [];

  steps.push({
    id: "opening",
    target: [],
    title: ctx.existingAccount ? "Your dashboard has a new look" : "Welcome to MileClear on the web",
    body: ctx.existingAccount
      ? "It now works like the app: the same four places and the same figures. Your phone still records your trips. This is where you check and sort them."
      : "Your phone records your trips. This is where you check them, sort them and see what they are worth, on a bigger screen.",
    srWhere: "",
    side: "center",
    align: "center",
    pad: 0,
    shape: "none",
    page: false,
  });

  const home = homeStep(ctx);
  if (home) steps.push(home);

  steps.push({
    id: "trips",
    target: ["nav-trips"],
    title: ctx.baseMode === "personal" ? "All your trips" : "Sort your trips here",
    body: tripsBody(ctx.baseMode, ctx.unclassified),
    srWhere: "Highlighted: Trips in the main menu.",
    side: "right",
    align: "center",
    pad: 4,
    shape: "md",
    page: false,
  });

  steps.push(slot3Step(ctx));
  steps.push(moreStep(ctx));

  if (ctx.baseMode === "both") {
    steps.push({
      id: "mode",
      target: ["mode-toggle"],
      title: "Work or Personal",
      body: "Switch what Home shows. Work puts tax first, Personal shows your everyday driving. Your trips stay the same.",
      srWhere: "Highlighted: the Work and Personal switch.",
      side: "below",
      align: "end",
      pad: 6,
      shape: "pill",
      page: false,
    });
  }

  steps.push({
    id: "account",
    target: ["avatar"],
    title: "Your account",
    body: "Your profile, your plan, settings and a link to get the app. You can take this tour again from Help.",
    srWhere: "Highlighted: your account button.",
    side: "below",
    align: "end",
    pad: 6,
    shape: "circle",
    page: false,
  });

  return steps;
}
