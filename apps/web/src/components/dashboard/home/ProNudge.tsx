"use client";

import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { safeGet, safeSet } from "../../../lib/dashboard/mode";
import { formatPence } from "../../../lib/dashboard/format";
import { planHref } from "../../../lib/dashboard/proReasons";
import { useData } from "../../../lib/dashboard/useData";
import { useMe } from "../../../lib/dashboard/useMe";
import { Button } from "../kit/Button";
import type { GamificationStats } from "@mileclear/shared";

const KEY = "mc_pro_nudge_until";
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

/** One line for free drivers with 5+ trips. Dismissable for 30 days. */
export function ProNudge() {
  const { isPro } = useMe();
  const [hidden, setHidden] = useState(true);
  const { data } = useData(isPro ? null : "gamification-stats", () =>
    api.get<{ data: GamificationStats }>("/gamification/stats").then((r) => r.data)
  );

  useEffect(() => {
    const until = Number(safeGet(KEY) ?? 0);
    setHidden(Date.now() < until);
  }, []);

  if (isPro || hidden || !data || data.totalTrips < 5 || data.deductionPence <= 0) return null;

  return (
    <div className="mc-banner">
      <p className="mc-banner__text">
        Your records are worth {formatPence(data.deductionPence)} this year. Pro lets you download them.
      </p>
      <Button variant="link" size="sm" href={planHref("default")}>
        See Pro
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          safeSet(KEY, String(Date.now() + THIRTY_DAYS));
          setHidden(true);
        }}
      >
        Not now
      </Button>
    </div>
  );
}
