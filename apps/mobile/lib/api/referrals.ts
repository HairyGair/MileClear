import { apiRequest } from "./index";
import type { ReferralSummary } from "@mileclear/shared";

/** Fetch the invite screen payload: code, share URL, progress, statuses. */
export async function fetchReferralSummary(): Promise<ReferralSummary> {
  const res = await apiRequest<{ data: ReferralSummary }>("/referrals");
  return res.data;
}

export interface ApplyReferralResult {
  ok: boolean;
  /** Present on failure: a user-facing message from the API. */
  error?: string;
}

/**
 * Catch-up path: a user who installed first and got a code later enters it
 * here (valid within their first week of signup). Registration handles the
 * inline case. Never throws — returns a structured result. apiRequest throws
 * an ApiError whose message is the API's user-facing error string.
 */
export async function applyReferralCode(code: string): Promise<ApplyReferralResult> {
  try {
    await apiRequest("/referrals/apply", {
      method: "POST",
      body: JSON.stringify({ code: code.trim().toUpperCase() }),
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "That referral code isn't valid.",
    };
  }
}
