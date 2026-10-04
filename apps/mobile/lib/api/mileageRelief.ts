import { apiRequest } from "./index";
import type { MileageReliefData } from "@mileclear/shared";

/** Business miles per claimable tax year, for the Mileage Allowance Relief screen. */
export function fetchMileageRelief() {
  return apiRequest<{ data: MileageReliefData }>("/mileage-relief");
}
