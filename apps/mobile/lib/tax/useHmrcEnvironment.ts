// Which HMRC service the server is connected to: its test service (sandbox)
// or the real one (production). The MTD screens word themselves from this, so
// they never say "test version" when updates really reach HMRC, or the other
// way round. Fetched once per app run and shared; null while loading or when
// it couldn't be read, and callers then use wording that is true either way.

import { useEffect, useState } from "react";
import { fetchHmrcStatus } from "../api/hmrc";
import type { HmrcEnv } from "./mtdCopy";

let cached: HmrcEnv = null;
let inflight: Promise<HmrcEnv> | null = null;

function load(): Promise<HmrcEnv> {
  if (!inflight) {
    inflight = fetchHmrcStatus()
      .then((res) => {
        cached = res.data.environment ?? null;
        return cached;
      })
      .catch(() => {
        // Let the next screen try again.
        inflight = null;
        return null;
      });
  }
  return inflight;
}

/** Remember the environment from a status the screen fetched itself. */
export function rememberHmrcEnvironment(env: HmrcEnv): void {
  if (env === "sandbox" || env === "production") cached = env;
}

/** The environment plus whether it is still being asked for (false once known or failed). */
export function useHmrcEnvironmentState(): { env: HmrcEnv; loading: boolean } {
  const [state, setState] = useState<{ env: HmrcEnv; loading: boolean }>({ env: cached, loading: !cached });
  useEffect(() => {
    if (cached) {
      setState({ env: cached, loading: false });
      return;
    }
    let alive = true;
    load().then((e) => {
      if (alive) setState({ env: e, loading: false });
    });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

export function useHmrcEnvironment(): HmrcEnv {
  return useHmrcEnvironmentState().env;
}
