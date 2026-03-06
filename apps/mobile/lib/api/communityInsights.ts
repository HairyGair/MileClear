import { apiRequest } from "./index";
import type { CommunityInsights } from "@mileclear/shared";

export function fetchCommunityInsights(lat: number, lng: number) {
  return apiRequest<{ data: CommunityInsights }>(
    `/community-insights?lat=${lat}&lng=${lng}`
  );
}
