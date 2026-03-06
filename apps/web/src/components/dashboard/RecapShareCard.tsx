"use client";

import { useRef, useState, useCallback } from "react";
import html2canvas from "html2canvas";
import { getDistanceEquivalent } from "@mileclear/shared";

interface RecapShareCardProps {
  period: "daily" | "weekly" | "monthly" | "yearly";
  label: string;
  miles: number;
  trips: number;
  deductionPence: number;
  totalMiles: number;
  busiestDay?: string | null;
  busiestDayMiles?: number;
  businessMiles?: number;
  equiv?: string | null;
  region?: string;
}

function formatMilesReadable(miles: number): string {
  if (miles < 100) return miles.toFixed(1);
  return Math.round(miles).toLocaleString("en-GB");
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function prevMonthName(current: string): string {
  const idx = MONTH_NAMES.findIndex(
    (m) => m.toLowerCase() === current.toLowerCase(),
  );
  if (idx === -1) return "last month";
  return MONTH_NAMES[(idx + 11) % 12];
}

export function RecapShareModal({
  open,
  onClose,
  ...data
}: RecapShareCardProps & { open: boolean; onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [capturing, setCapturing] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!cardRef.current) return;
    setCapturing(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
      });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      const periodLabel = data.period === "daily" ? "today" : data.period === "yearly" ? "year" : data.label.toLowerCase().replace(/\s+/g, "-");
      a.download = `mileclear-recap-${periodLabel}.png`;
      a.click();
    } finally {
      setCapturing(false);
    }
  }, [data.period, data.label]);

  const handleShare = useCallback(async () => {
    if (!cardRef.current) return;
    if (!navigator.share) {
      // Fallback to download
      await handleDownload();
      return;
    }
    setCapturing(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
      });
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) return;
      const file = new File([blob], "mileclear-recap.png", { type: "image/png" });
      await navigator.share({
        title: `My ${data.period === "daily" ? "Daily" : data.label} Driving Recap`,
        files: [file],
      });
    } catch {
      // Share dismissed or unsupported — try download
      await handleDownload();
    } finally {
      setCapturing(false);
    }
  }, [data.period, data.label, handleDownload]);

  const handleCopyText = useCallback(() => {
    const avg = data.trips > 0 ? data.miles / data.trips : 0;
    const avgStr = avg < 10 ? avg.toFixed(1) : String(Math.round(avg));
    const tripWord = data.trips === 1 ? "trip" : "trips";
    const lines = [
      `My ${data.period === "daily" ? "today's" : data.label} driving recap:`,
      `- ${formatMilesReadable(data.miles)} miles across ${data.trips} ${tripWord}`,
      `- Average trip: ${avgStr} miles`,
    ];
    if (data.deductionPence > 0) {
      lines.push(`- \u00A3${(data.deductionPence / 100).toFixed(2)} HMRC deduction`);
    }
    lines.push(
      `- ${Math.round(data.totalMiles).toLocaleString("en-GB")} total miles tracked!`,
      "",
      "Tracked with MileClear \u2014 your mileage journal",
      "https://apps.apple.com/app/mileclear/id6740041879",
    );
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [data]);

  if (!open) return null;

  const avg = data.trips > 0 ? data.miles / data.trips : 0;
  const milesStr = formatMilesReadable(data.miles);
  const avgStr = avg < 10 ? avg.toFixed(1) : String(Math.round(avg));
  const totalStr = Math.round(data.totalMiles).toLocaleString("en-GB");
  const tripWord = data.trips === 1 ? "trip" : "trips";
  const deductionStr = data.deductionPence > 0
    ? `\u00A3${(data.deductionPence / 100).toFixed(2)}`
    : null;
  const year = new Date().getFullYear();
  const distanceEquiv = data.equiv ?? getDistanceEquivalent(data.miles, data.region);

  const periodLabel = data.period === "daily"
    ? "DAILY RECAP"
    : data.period === "yearly"
      ? "YEAR IN REVIEW"
      : data.period === "weekly"
        ? "WEEKLY RECAP"
        : "DRIVING RECAP";

  const periodHeading = data.period === "daily" || data.period === "yearly" || data.period === "weekly"
    ? data.label.toUpperCase()
    : `${data.label.toUpperCase()} ${year}`;

  return (
    <div className="modal-overlay" onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div className="recap-share-modal">
        <div className="recap-share-modal__header">
          <h2 className="recap-share-modal__title">Share Your Recap</h2>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="recap-share-modal__body">
          {/* The capturable card */}
          <div ref={cardRef} className="recap-card">
            <div className="recap-card__glow" />

            {/* Corner accents */}
            <div className="recap-card__corner recap-card__corner--tl" />
            <div className="recap-card__corner recap-card__corner--tr" />
            <div className="recap-card__corner recap-card__corner--bl" />
            <div className="recap-card__corner recap-card__corner--br" />

            {/* Top accent */}
            <div className="recap-card__accent" />

            {/* Wordmark */}
            <div className="recap-card__wordmark">
              <span className="recap-card__word-mile">Mile</span>
              <span className="recap-card__word-clear">Clear</span>
            </div>

            {/* Label with flanking lines */}
            <div className="recap-card__label-row">
              <div className="recap-card__label-line" />
              <span className="recap-card__label">{periodLabel}</span>
              <div className="recap-card__label-line" />
            </div>

            {/* Period heading */}
            <div className="recap-card__heading">{periodHeading}</div>

            {/* Hero miles */}
            <div className="recap-card__hero">{milesStr}</div>
            <div className="recap-card__hero-unit">miles driven</div>

            {/* Stats row */}
            <div className="recap-card__stats">
              <div className="recap-card__stat">
                <span className="recap-card__stat-value">{data.trips}</span>
                <span className="recap-card__stat-label">{tripWord}</span>
              </div>
              <div className="recap-card__stat-divider" />
              <div className="recap-card__stat">
                <span className="recap-card__stat-value">{avgStr}</span>
                <span className="recap-card__stat-label">avg miles</span>
              </div>
              {deductionStr && (
                <>
                  <div className="recap-card__stat-divider" />
                  <div className="recap-card__stat">
                    <span className="recap-card__stat-value" style={{ color: "#10b981" }}>{deductionStr}</span>
                    <span className="recap-card__stat-label">HMRC deduction</span>
                  </div>
                </>
              )}
            </div>

            {/* Insights */}
            {(data.busiestDay || distanceEquiv || (data.period === "yearly" && (data.businessMiles ?? 0) > 0)) && (
              <div className="recap-card__insights">
                {data.busiestDay && (
                  <div className="recap-card__insight">
                    <div className="recap-card__insight-dot" />
                    <span>Busiest day: <strong>{data.busiestDay}</strong></span>
                  </div>
                )}
                {data.period === "yearly" && (data.businessMiles ?? 0) > 0 && (
                  <div className="recap-card__insight">
                    <div className="recap-card__insight-dot" />
                    <span>{formatMilesReadable(data.businessMiles!)} business miles claimed</span>
                  </div>
                )}
                {distanceEquiv && (
                  <div className="recap-card__insight">
                    <div className="recap-card__insight-dot" />
                    <span>{distanceEquiv}</span>
                  </div>
                )}
              </div>
            )}

            {/* Divider */}
            <div className="recap-card__divider" />

            {/* Lifetime total */}
            <div className="recap-card__lifetime">{totalStr} total miles tracked</div>

            {/* Bottom accent */}
            <div className="recap-card__accent" style={{ marginTop: 24 }} />

            {/* Footer */}
            <div className="recap-card__footer">
              <div className="recap-card__footer-wordmark">
                <span className="recap-card__word-mile" style={{ fontSize: 13 }}>Mile</span>
                <span className="recap-card__word-clear" style={{ fontSize: 13 }}>Clear</span>
              </div>
              <span className="recap-card__footer-tagline">Your mileage journal</span>
            </div>
          </div>
        </div>

        <div className="recap-share-modal__actions">
          <button
            className="btn btn--primary"
            onClick={handleShare}
            disabled={capturing}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            {capturing ? "Preparing..." : "Share Image"}
          </button>
          <button
            className="btn btn--secondary"
            onClick={handleDownload}
            disabled={capturing}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download
          </button>
          <button
            className="btn btn--ghost"
            onClick={handleCopyText}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {copied ? "Copied!" : "Copy Text"}
          </button>
        </div>
      </div>
    </div>
  );
}
