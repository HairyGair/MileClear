"use client";

import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { safeGet, safeSet } from "../../../lib/dashboard/mode";
import { useData } from "../../../lib/dashboard/useData";
import { formatMiles } from "../../../lib/dashboard/format";
import { Button } from "../kit/Button";

interface Improvement {
  improvedTripCount: number;
  milesGained: number;
  lastImprovementAt: string | null;
}

/** "We improved N of your trips" after a behind-the-scenes distance fix. */
export function DataQualityBanner() {
  const { data } = useData("data-quality", () =>
    api.get<{ data: Improvement }>("/user/data-quality-improvement").then((r) => r.data)
  );
  const [hidden, setHidden] = useState(true);
  const stamp = data?.lastImprovementAt ?? "";
  const storageKey = `mc_dq_seen_${stamp}`;

  useEffect(() => {
    setHidden(!data || data.improvedTripCount < 1 || safeGet(storageKey) === "1");
  }, [data, storageKey]);

  if (hidden || !data) return null;
  const n = data.improvedTripCount;
  return (
    <div className="mc-banner" role="status">
      <p className="mc-banner__text">
        We improved {n} of your {n === 1 ? "trip" : "trips"} and recovered {formatMiles(data.milesGained)}.
      </p>
      <Button variant="link" size="sm" href="/dashboard/trips">
        See trips
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          safeSet(storageKey, "1");
          setHidden(true);
        }}
      >
        Dismiss
      </Button>
    </div>
  );
}
