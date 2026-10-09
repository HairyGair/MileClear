// One upgrade path: every Pro gate links to /dashboard/settings/plan?reason=<key>.
// The plan page (package F) reads the same map for its headline.

export const PRO_REASONS = {
  exports: "Download your records",
  odometer_log_csv: "Download your odometer log",
  trends: "See your trends",
  bank: "Bring in your earnings automatically",
  vehicles: "Add more vehicles",
  places: "Save more places",
  certificate: "Share a mileage certificate",
  ticket_defender: "Check fines against your trips",
  invoices: "Send unlimited invoices",
  sa_pdf: "Download your Self Assessment PDF",
  accountant_share: "Share your records with your accountant",
  emsee: "Ask EmSee",
  journey_map: "See your journeys on a map",
  community: "See what drivers near you see",
  insights: "See your business insights",
  csv_import: "Import your earnings from CSV",
  default: "MileClear Pro",
} as const;

export type ProReason = keyof typeof PRO_REASONS;

export function isProReason(value: string | null | undefined): value is ProReason {
  return !!value && Object.prototype.hasOwnProperty.call(PRO_REASONS, value);
}

/** Headline for a reason key. Unknown or missing keys read "MileClear Pro". */
export function proReasonTitle(value: string | null | undefined): string {
  return isProReason(value) ? PRO_REASONS[value] : PRO_REASONS.default;
}

/** The only place a Pro link is built. */
export function planHref(reason: ProReason = "default"): string {
  return `/dashboard/settings/plan?reason=${reason}`;
}
