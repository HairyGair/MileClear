import { apiRequest } from "./index";
import type { CommunityMonthly } from "@mileclear/shared";

/** The community numbers for the latest finished month (public endpoint). */
export function fetchCommunityMonthly() {
  return apiRequest<{ data: CommunityMonthly }>("/community/monthly");
}
