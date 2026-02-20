import { apiRequest } from "./index";
import type { BillingStatus } from "@mileclear/shared";

export function fetchBillingStatus() {
  return apiRequest<{ data: BillingStatus }>("/billing/status");
}

export function createCheckoutSession() {
  return apiRequest<{ data: { url: string } }>("/billing/checkout", {
    method: "POST",
  });
}

export function cancelSubscription() {
  return apiRequest<{ data: { message: string } }>("/billing/cancel", {
    method: "POST",
  });
}
