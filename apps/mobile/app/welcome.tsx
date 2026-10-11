import { TutorialFlow } from "../components/tutorial/TutorialFlow";

/**
 * The first-run tour for a new account, straight after sign-up. The root
 * layout sends a new account here (its redirect props) and lets it through to
 * Home once the tour is finished or skipped. Replays use /tour.
 */
export default function WelcomeScreen() {
  return <TutorialFlow source="auto" />;
}
