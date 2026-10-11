import { useLocalSearchParams } from "expo-router";
import { TutorialFlow } from "../components/tutorial/TutorialFlow";

/**
 * The tour again, from More > Help and how-tos > Take the tour or the What's
 * new sheet's "Take the full tour". Teaching steps only; the phone check
 * shows when something still needs the driver.
 */
export default function TourScreen() {
  const { source } = useLocalSearchParams<{ source?: string }>();
  return <TutorialFlow source={source === "whats_new" ? "whats_new" : "help"} />;
}
