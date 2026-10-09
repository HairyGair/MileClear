"use client";

import { useCallback, useRef, useState } from "react";
import type { PeriodRecap } from "@mileclear/shared";
import { getDistanceEquivalent } from "@mileclear/shared";
import { Button, Dialog, ErrorState, Skeleton, useData, useToast } from "../kit";
import { getData } from "./data";
import { miles, pounds } from "./ui";
import s from "./insights.module.css";

export type RecapPeriod = "daily" | "weekly" | "monthly";

export const RECAP_BUTTONS: { period: RecapPeriod; label: string; title: string }[] = [
  { period: "daily", label: "Today", title: "Today" },
  { period: "weekly", label: "This week", title: "This week" },
  { period: "monthly", label: "This month", title: "This month" },
];

const SHARE_URL = "https://mileclear.com/app";

/** The API's share text ends with a sign-off; swap it for the store chooser link. */
export function shareTextWithLink(text: string): string {
  // The server words the figure "tax deduction"; it can be at the employer rate, so say "to claim".
  const neutral = text.replace(/(£[\d,]+(?:\.\d+)?) tax deduction/gu, "$1 to claim");
  const base = neutral.replace(/\n*Track your miles with MileClear[^\n]*$/u, "").trimEnd();
  return `${base}\n\nTrack your miles with MileClear: ${SHARE_URL}`;
}

/** Recap dialog with the capturable share image. */
export function RecapDialog({ period, title, open, onClose }: { period: RecapPeriod; title: string; open: boolean; onClose: () => void }) {
  const { data, error, loading, reload } = useData<PeriodRecap>(open ? `recap-${period}` : null, () => getData(`/gamification/recap?period=${period}`));
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const capture = useCallback(async (): Promise<HTMLCanvasElement | null> => {
    if (!cardRef.current) return null;
    const { default: html2canvas } = await import("html2canvas");
    return html2canvas(cardRef.current, { backgroundColor: null, scale: 2, useCORS: true });
  }, []);

  const download = useCallback(async () => {
    setBusy(true);
    try {
      const canvas = await capture();
      if (!canvas) return;
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `mileclear-recap-${period}.png`;
      a.click();
    } catch {
      toast.show("Couldn't make the image. Try again.", "error");
    } finally {
      setBusy(false);
    }
  }, [capture, period, toast]);

  const copy = useCallback(async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(shareTextWithLink(data.shareText));
      toast.show("Copied");
    } catch {
      toast.show("Couldn't copy. Select the text instead.", "error");
    }
  }, [data, toast]);

  const equiv = data ? getDistanceEquivalent(data.totalMiles) : null;
  const avg = data && data.totalTrips > 0 ? data.totalMiles / data.totalTrips : 0;

  return (
    <Dialog open={open} title={`Recap: ${title}`} onClose={onClose}>
      {loading && !data && <Skeleton variant="card" />}
      {error && <ErrorState size="card" title="Couldn't load this recap" onRetry={reload} />}
      {data && data.totalTrips === 0 && <p className={s.note}>No trips in this period yet.</p>}
      {data && data.totalTrips > 0 && (
        <>
          <div ref={cardRef} className={s.shareCard} data-testid="recap-card">
            <div className={s.shareWord}>
              Mile<span className={s.shareWordClear}>Clear</span>
            </div>
            <div className={s.shareKind}>{period === "daily" ? "DAILY RECAP" : period === "weekly" ? "WEEKLY RECAP" : "MONTHLY RECAP"}</div>
            <div className={s.shareHeading}>{data.label}</div>
            <div className={s.shareHero}>{data.totalMiles < 100 ? data.totalMiles.toFixed(1) : Math.round(data.totalMiles).toLocaleString("en-GB")}</div>
            <div className={s.shareUnit}>miles driven</div>
            <div className={s.shareStats}>
              <div className={s.shareStat}>
                <span className={s.shareStatValue}>{data.totalTrips}</span>
                <span className={s.shareStatLabel}>{data.totalTrips === 1 ? "trip" : "trips"}</span>
              </div>
              <div className={s.shareStat}>
                <span className={s.shareStatValue}>{avg < 10 ? avg.toFixed(1) : Math.round(avg)}</span>
                <span className={s.shareStatLabel}>avg miles</span>
              </div>
              {data.deductionPence > 0 && (
                <div className={s.shareStat}>
                  <span className={s.shareStatValue}>{pounds(data.deductionPence)}</span>
                  <span className={s.shareStatLabel}>mileage claim</span>
                </div>
              )}
            </div>
            {data.busiestDayLabel && <div className={s.shareFoot}>Busiest day: {data.busiestDayLabel}</div>}
            {equiv && <div className={s.shareFoot}>{equiv}</div>}
            <div className={s.shareFoot}>mileclear.com/app</div>
          </div>
          <p className={s.note}>
            {miles(data.businessMiles)} business, {data.totalTrips} {data.totalTrips === 1 ? "trip" : "trips"}.
          </p>
          <pre className={s.shareText}>{shareTextWithLink(data.shareText)}</pre>
          <div className={s.shareActions}>
            <Button variant="secondary" size="sm" onClick={copy}>
              Copy text
            </Button>
            <Button variant="secondary" size="sm" loading={busy} onClick={download}>
              Download image
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
