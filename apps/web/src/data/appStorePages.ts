// App Store custom product pages (Oct 2026, docs/app-store-pages-oct2026).
// Each page has its own screenshots, promo text and search keywords; a link
// with ?ppid=<id> opens it instead of the default product page. Until Apple
// approves a page, its link shows the default page, so these are safe to use
// before approval (checked 7 Oct 2026).
//
// The id is the "Product Page ID" at the foot of each page in App Store
// Connect, NOT the id in the App Store Connect URL.

export const APP_STORE_BASE = "https://apps.apple.com/gb/app/mileclear-mileage-tracker-uk/id6759671005";

export type AppStorePage = "gig" | "tax" | "employee" | "personal";

export const APP_STORE_PAGE_IDS: Record<AppStorePage, string> = {
  gig: "e71ed5e2-4340-4718-805f-8661f247ea30", // Delivery & gig drivers
  tax: "202fdc62-90f4-4daf-a940-e15a0a4c2bfa", // Self-employed & tax return
  employee: "9bdbdf1e-92bc-4688-96b7-143c2bf40964", // Employees claiming mileage
  personal: "92f31bb0-01fa-464f-839d-f1702a298966", // Everyday personal drivers
};

/** App Store link, opening a custom product page when one is given. */
export function appStoreUrl(page?: AppStorePage): string {
  return page ? `${APP_STORE_BASE}?ppid=${APP_STORE_PAGE_IDS[page]}` : APP_STORE_BASE;
}

/** Which custom page a mileclear.com/app?from= channel should open. An
 *  explicit ?page= wins; otherwise the channel name is matched by keyword
 *  (e.g. "flex-group" and "deliveroo-fb" are delivery drivers). Unknown
 *  channels, the billboard and "press" get the default page. */
export function pageForChannel(from: string, explicit?: string | null): AppStorePage | undefined {
  const p = (explicit ?? "").trim().toLowerCase();
  if (p === "gig" || p === "tax" || p === "employee" || p === "personal") return p;
  if (/uber|deliveroo|just-?eat|flex|evri|dpd|yodel|stuart|gophr|courier|delivery|gig/.test(from)) return "gig";
  if (/employee|employer|milesheet|nhs|carer|staff|team/.test(from)) return "employee";
  if (/tax|sole|self-?employed|self-?assessment|accountant|mtd|(^|-)sa(-|$)/.test(from)) return "tax";
  if (/personal|everyday|commute|family/.test(from)) return "personal";
  return undefined;
}
