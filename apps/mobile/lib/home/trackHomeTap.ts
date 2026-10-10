// The real sender for tapEvents, wired to the existing /user/event channel
// (same pattern as lib/rating). Imported by the Home components.

import { apiRequest } from "../api/index";
import { createTapTracker } from "./tapEvents";

export const trackHomeTap = createTapTracker((type, metadata) => {
  apiRequest("/user/event", {
    method: "POST",
    body: JSON.stringify({ type, metadata }),
  }).catch(() => {});
});
