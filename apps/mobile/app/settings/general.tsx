import { useEffect } from "react";
import { useRouter } from "expo-router";

/**
 * Deprecated. /settings/general was split into /settings/profile and
 * /settings/preferences on 17 May 2026 (Anthony's settings IA audit).
 * Old TestFlight builds may still link here — redirect to the closest
 * match. Remove once build 67- is no longer in the wild.
 */
export default function GeneralRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings/profile" as never);
  }, [router]);
  return null;
}
