// The gate on every Directions entry point (DESIGN 1.1, PLAN F6): the
// server says this driver has Directions (Pro, during the test) AND this
// binary has the native voice module. Older binaries never show an entry.

import { useMemo } from "react";
import { useUser } from "../user/context";
import { directionsAvailable } from "./optionalNative";
import { navVoicePresent } from "./voice";

export function useDirectionsAvailable(): boolean {
  const { user } = useUser();
  const present = useMemo(() => navVoicePresent(), []);
  return directionsAvailable({ navigationEnabled: user?.navigationEnabled, navVoicePresent: present });
}
