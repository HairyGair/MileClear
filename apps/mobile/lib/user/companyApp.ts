// Who sees the company-driver version of the app.
//
// Two different questions, kept apart on purpose:
//  - What the driver SEES (no earnings, invoices, platform cards, streaks):
//    this is a presentation rule, so a driver who says "A company car" in
//    Settings gets it as well as a driver in a team. Use `seesCompanyDriverApp`.
//  - What the driver is ENTITLED to (Pro, Milesheet team features): that
//    stays with real team membership only (`isCompanyDriver` on the user
//    context). Never use this helper to unlock Pro.

export function seesCompanyDriverApp(args: {
  isCompanyDriver: boolean;
  workType: string | null | undefined;
}): boolean {
  return args.isCompanyDriver || args.workType === "company";
}
