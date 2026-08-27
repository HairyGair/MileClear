import { apiRequest } from "./index";

/**
 * Google Play Billing validate call — the Android counterpart to
 * validateApplePurchase in ./billing.ts.
 *
 * Kept in its own module rather than added to billing.ts so the Android work
 * doesn't collide with the parked monetisation changes sitting uncommitted in
 * that file. Fold it in when monetisation unparks.
 */
export function validateGooglePurchase(purchaseToken: string) {
  return apiRequest<{
    data: { isPremium: boolean; premiumExpiresAt: string | null };
  }>("/billing/google/validate", {
    method: "POST",
    body: JSON.stringify({ purchaseToken }),
  });
}
