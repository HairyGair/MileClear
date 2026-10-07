import { Redirect } from "expo-router";

// Driving Analytics is now the "Trends" half of the Insights screen. Kept as a
// redirect so old links and saved routes still land somewhere sensible.
export default function AnalyticsRedirect() {
  return <Redirect href={"/insights?view=trends" as never} />;
}
