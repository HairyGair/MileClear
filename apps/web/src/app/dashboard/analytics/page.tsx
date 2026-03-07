"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { PageHeader } from "../../../components/dashboard/PageHeader";
import { Card } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { DashboardSkeleton } from "../../../components/ui/LoadingSkeleton";
import type {
  DrivingAnalytics,
  WeeklyReport,
  FrequentRoute,
  ShiftSweetSpot,
  FuelCostBreakdown,
  EarningsDayPattern,
  CommuteTiming,
} from "@mileclear/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`;
}

function formatMiles(miles: number): string {
  return miles.toLocaleString("en-GB", { maximumFractionDigits: 1 });
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function platformLabel(tag: string): string {
  const map: Record<string, string> = {
    uber: "Uber",
    deliveroo: "Deliveroo",
    just_eat: "Just Eat",
    amazon_flex: "Amazon Flex",
    stuart: "Stuart",
    gophr: "Gophr",
    dpd: "DPD",
    yodel: "Yodel",
    evri: "Evri",
    other: "Other",
  };
  return map[tag] ?? tag;
}

function trendLabel(delta: number | null, label: string): string | null {
  if (delta === null) return null;
  if (delta > 0) return `\u2191 ${delta.toFixed(0)}% ${label}`;
  if (delta < 0) return `\u2193 ${Math.abs(delta).toFixed(0)}% ${label}`;
  return `\u2014 ${label}`;
}

const DAY_LABELS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_LABELS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// Delta badge
function DeltaBadge({ delta, label }: { delta: number | null; label: string }) {
  if (delta === null) return null;
  const positive = delta > 0;
  const neutral = delta === 0;
  const color = neutral ? "var(--text-muted)" : positive ? "var(--emerald-500)" : "var(--dash-red)";
  const arrow = neutral ? "\u2014" : positive ? "\u2191" : "\u2193";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.2rem",
        fontSize: "0.75rem",
        fontWeight: 600,
        color,
        background: neutral
          ? "rgba(255,255,255,0.05)"
          : positive
          ? "rgba(16,185,129,0.12)"
          : "rgba(239,68,68,0.12)",
        padding: "0.2rem 0.5rem",
        borderRadius: "20px",
      }}
    >
      {arrow} {Math.abs(delta).toFixed(0)}% {label}
    </span>
  );
}

// Day-of-week indicator dots
function DayDots({ breakdown }: { breakdown: number[] }) {
  const max = Math.max(...breakdown, 1);
  return (
    <div style={{ display: "flex", gap: "3px", alignItems: "flex-end", height: "16px" }}>
      {breakdown.map((count, i) => {
        const intensity = count / max;
        return (
          <div
            key={i}
            title={`${DAY_LABELS_LONG[i]}: ${count} trip${count !== 1 ? "s" : ""}`}
            style={{
              width: "8px",
              height: `${Math.max(4, intensity * 16)}px`,
              borderRadius: "2px",
              background:
                intensity > 0
                  ? `rgba(251,191,36,${0.3 + intensity * 0.7})`
                  : "rgba(255,255,255,0.08)",
              flexShrink: 0,
            }}
          />
        );
      })}
    </div>
  );
}

// Horizontal bar chart for shift sweet spots
function HorizontalBarChart({
  title,
  data,
  highlight,
  formatBar,
  formatSub,
}: {
  title: string;
  data: { label: string; value: number; sub?: string }[];
  highlight: number;
  formatBar: (v: number) => string;
  formatSub?: (item: { label: string; value: number; sub?: string }) => string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div
      style={{
        background: "rgba(10, 17, 32, 0.8)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: "var(--r-lg, 12px)",
        padding: "1.25rem",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "0.9375rem",
          fontWeight: 600,
          color: "var(--text-primary, #f0f2f5)",
          marginBottom: "1rem",
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
        {data.map((item, idx) => {
          const pct = (item.value / max) * 100;
          const isBest = idx === highlight;
          return (
            <div key={idx} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div
                style={{
                  width: "80px",
                  fontSize: "0.75rem",
                  color: isBest ? "var(--amber-400, #fbbf24)" : "var(--text-muted, #8494a7)",
                  fontWeight: isBest ? 600 : 400,
                  flexShrink: 0,
                  textAlign: "right",
                }}
              >
                {item.label}
              </div>
              <div style={{ flex: 1, position: "relative", height: "24px" }}>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(255,255,255,0.04)",
                    borderRadius: "4px",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    height: "100%",
                    width: `${pct}%`,
                    background: isBest
                      ? "linear-gradient(to right, var(--amber-500, #f59e0b), var(--amber-400, #fbbf24))"
                      : "rgba(251,191,36,0.25)",
                    borderRadius: "4px",
                    transition: "width 0.4s ease",
                    boxShadow: isBest ? "0 0 10px rgba(251,191,36,0.3)" : "none",
                  }}
                />
                <span
                  style={{
                    position: "absolute",
                    right: "8px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: isBest ? "var(--amber-400, #fbbf24)" : "var(--text-muted, #8494a7)",
                  }}
                >
                  {formatBar(item.value)}
                </span>
              </div>
              {formatSub && item.sub && (
                <div
                  style={{
                    width: "60px",
                    fontSize: "0.6875rem",
                    color: "var(--text-muted, #8494a7)",
                    flexShrink: 0,
                  }}
                >
                  {item.sub}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Vertical bar chart (days of week / earnings)
function VerticalBarChart({
  title,
  data,
  subtitle,
  formatValue,
}: {
  title: string;
  data: { label: string; value: number; highlight?: boolean }[];
  subtitle?: string;
  formatValue?: (v: number) => string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const fmt = formatValue ?? ((v: number) => v.toFixed(0));

  return (
    <div
      style={{
        background: "rgba(10, 17, 32, 0.8)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: "var(--r-lg, 12px)",
        padding: "1.25rem",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "0.9375rem",
          fontWeight: 600,
          color: "var(--text-primary, #f0f2f5)",
          marginBottom: subtitle ? "0.25rem" : "1.25rem",
        }}
      >
        {title}
      </div>
      {subtitle && (
        <p
          style={{
            fontSize: "0.8125rem",
            color: "var(--text-muted, #8494a7)",
            marginBottom: "1rem",
          }}
        >
          {subtitle}
        </p>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "6px",
          height: "140px",
          padding: "0 2px",
        }}
      >
        {data.map((d, idx) => {
          const heightPct = max > 0 ? (d.value / max) * 100 : 0;
          const isEmpty = d.value === 0;
          const isHighlight = d.highlight ?? false;

          return (
            <div
              key={idx}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-end",
                height: "100%",
                gap: "4px",
                minWidth: 0,
              }}
            >
              <span
                style={{
                  fontSize: "0.5625rem",
                  fontWeight: 600,
                  color: isEmpty
                    ? "transparent"
                    : isHighlight
                    ? "var(--amber-400, #fbbf24)"
                    : "var(--emerald-500)",
                  whiteSpace: "nowrap",
                  lineHeight: 1,
                  marginBottom: "2px",
                }}
              >
                {isEmpty ? "0" : fmt(d.value)}
              </span>
              <div
                style={{
                  width: "100%",
                  height: isEmpty ? "3px" : `${heightPct}%`,
                  background: isEmpty
                    ? "rgba(255,255,255,0.06)"
                    : isHighlight
                    ? "linear-gradient(to top, var(--amber-500, #f59e0b), var(--amber-400, #fbbf24))"
                    : "linear-gradient(to top, #059669, #34d399)",
                  borderRadius: isEmpty ? "2px" : "4px 4px 2px 2px",
                  boxShadow:
                    !isEmpty && isHighlight
                      ? "0 0 8px rgba(251,191,36,0.3)"
                      : !isEmpty
                      ? "0 0 6px rgba(52,211,153,0.2)"
                      : "none",
                  transition: "height 0.3s ease",
                  minHeight: isEmpty ? undefined : "4px",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: "0.5625rem",
                  color: "var(--text-muted, #8494a7)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "100%",
                  textAlign: "center",
                  lineHeight: 1.2,
                }}
              >
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
      <div
        style={{
          height: "1px",
          background: "rgba(255,255,255,0.06)",
          marginTop: "4px",
        }}
      />
    </div>
  );
}

// Hour mini chart for commute timing
function HourMiniChart({ byHour }: { byHour: CommuteTiming["byHour"] }) {
  const filtered = byHour.filter((h) => h.tripCount > 0);
  if (filtered.length === 0) {
    return (
      <p style={{ fontSize: "0.75rem", color: "var(--text-muted, #8494a7)" }}>
        No hourly data available.
      </p>
    );
  }
  const max = Math.max(...filtered.map((h) => h.avgMinutes), 1);
  const best = filtered.reduce((a, b) => (a.avgMinutes < b.avgMinutes ? a : b));

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "48px" }}>
      {filtered.map((h, idx) => {
        const heightPct = (h.avgMinutes / max) * 100;
        const isBest = h.hour === best.hour;
        return (
          <div
            key={idx}
            title={`${h.hour}:00 — ${Math.round(h.avgMinutes)}m avg (${h.tripCount} trip${h.tripCount !== 1 ? "s" : ""})`}
            style={{
              flex: 1,
              height: `${heightPct}%`,
              minHeight: "3px",
              background: isBest
                ? "var(--amber-400, #fbbf24)"
                : "rgba(251,191,36,0.25)",
              borderRadius: "2px 2px 1px 1px",
              boxShadow: isBest ? "0 0 6px rgba(251,191,36,0.4)" : "none",
              cursor: "default",
            }}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Weekly Report
// ---------------------------------------------------------------------------

function WeeklyReportSection({
  report,
  weeksBack,
  onPrev,
  onNext,
  loading,
}: {
  report: WeeklyReport;
  weeksBack: number;
  onPrev: () => void;
  onNext: () => void;
  loading: boolean;
}) {
  const hasMilesDelta = report.milesDelta !== null;
  const hasEarnDelta = report.earningsDelta !== null;
  const hasTripsDelta = report.tripsDelta !== null;

  return (
    <div
      style={{
        background: "rgba(10, 17, 32, 0.9)",
        border: "1px solid rgba(251,191,36,0.2)",
        borderRadius: "var(--r-lg, 12px)",
        padding: "1.5rem",
        marginBottom: "var(--dash-gap, 1.5rem)",
        opacity: loading ? 0.5 : 1,
        transition: "opacity 0.2s",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.25rem",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <div>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.0625rem",
              fontWeight: 700,
              color: "var(--text-primary, #f0f2f5)",
              margin: 0,
            }}
          >
            Weekly Report
          </h2>
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--text-muted, #8494a7)",
              marginTop: "0.125rem",
            }}
          >
            {report.weekLabel}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button
            onClick={onPrev}
            disabled={loading}
            aria-label="Previous week"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              width: "34px",
              height: "34px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: loading ? "not-allowed" : "pointer",
              color: "var(--text-primary, #f0f2f5)",
              fontSize: "1rem",
            }}
          >
            &larr;
          </button>
          <span
            style={{
              fontSize: "0.75rem",
              color: "var(--text-muted, #8494a7)",
              minWidth: "60px",
              textAlign: "center",
            }}
          >
            {weeksBack === 0 ? "This week" : `${weeksBack}w ago`}
          </span>
          <button
            onClick={onNext}
            disabled={loading || weeksBack === 0}
            aria-label="Next week"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              width: "34px",
              height: "34px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: loading || weeksBack === 0 ? "not-allowed" : "pointer",
              color:
                weeksBack === 0
                  ? "var(--text-muted, #8494a7)"
                  : "var(--text-primary, #f0f2f5)",
              fontSize: "1rem",
              opacity: weeksBack === 0 ? 0.4 : 1,
            }}
          >
            &rarr;
          </button>
        </div>
      </div>

      {/* Business + Personal two-col grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "1rem",
          marginBottom: "1rem",
        }}
      >
        {/* Business col */}
        <div
          style={{
            background: "rgba(251,191,36,0.04)",
            border: "1px solid rgba(251,191,36,0.12)",
            borderRadius: "10px",
            padding: "1rem",
          }}
        >
          <div
            style={{
              fontSize: "0.6875rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--amber-400, #fbbf24)",
              marginBottom: "0.75rem",
            }}
          >
            Business
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "0.625rem",
            }}
          >
            <StatMini label="Miles" value={`${formatMiles(report.business.miles)} mi`} />
            <StatMini label="Trips" value={String(report.business.trips)} />
            <StatMini
              label="Earnings"
              value={formatPence(report.business.earningsPence)}
              highlight
            />
            <StatMini
              label="Deduction"
              value={formatPence(report.business.deductionPence)}
              highlight
            />
            <StatMini label="Shifts" value={String(report.business.shifts)} />
            <StatMini
              label="Avg shift"
              value={
                report.business.avgShiftHours > 0
                  ? `${report.business.avgShiftHours.toFixed(1)}h`
                  : "—"
              }
            />
            {report.business.topPlatform && (
              <div style={{ gridColumn: "1 / -1" }}>
                <StatMini
                  label="Top platform"
                  value={platformLabel(report.business.topPlatform)}
                />
              </div>
            )}
          </div>
        </div>

        {/* Personal col */}
        <div
          style={{
            background: "rgba(16,185,129,0.04)",
            border: "1px solid rgba(16,185,129,0.12)",
            borderRadius: "10px",
            padding: "1rem",
          }}
        >
          <div
            style={{
              fontSize: "0.6875rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--emerald-500)",
              marginBottom: "0.75rem",
            }}
          >
            Personal
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "0.625rem",
            }}
          >
            <StatMini label="Miles" value={`${formatMiles(report.personal.miles)} mi`} />
            <StatMini label="Trips" value={String(report.personal.trips)} />
            <StatMini
              label="Avg trip"
              value={`${formatMiles(report.personal.avgTripMiles)} mi`}
            />
            <StatMini
              label="Longest trip"
              value={`${formatMiles(report.personal.longestTripMiles)} mi`}
            />
          </div>
        </div>
      </div>

      {/* Bottom row: totals + streak + deltas */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "0.625rem",
          paddingTop: "0.75rem",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <span style={{ fontSize: "0.8125rem", color: "var(--text-muted, #8494a7)" }}>
          Total: <strong style={{ color: "var(--text-primary, #f0f2f5)" }}>
            {formatMiles(report.totalMiles)} mi
          </strong>{" "}
          &middot;{" "}
          <strong style={{ color: "var(--text-primary, #f0f2f5)" }}>
            {report.totalTrips} trip{report.totalTrips !== 1 ? "s" : ""}
          </strong>
        </span>
        {report.streakDays > 0 && (
          <span
            style={{
              fontSize: "0.8125rem",
              color: "var(--amber-400, #fbbf24)",
              fontWeight: 600,
            }}
          >
            {report.streakDays}-day streak
          </span>
        )}
        {hasMilesDelta && (
          <DeltaBadge delta={report.milesDelta} label="miles" />
        )}
        {hasTripsDelta && (
          <DeltaBadge delta={report.tripsDelta} label="trips" />
        )}
        {hasEarnDelta && (
          <DeltaBadge delta={report.earningsDelta} label="earnings" />
        )}

        {/* Achievements earned this week */}
        {report.newAchievements.length > 0 && (
          <div
            style={{
              width: "100%",
              display: "flex",
              flexWrap: "wrap",
              gap: "0.375rem",
              marginTop: "0.375rem",
            }}
          >
            {report.newAchievements.map((ach, i) => (
              <span
                key={i}
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  padding: "0.2rem 0.5rem",
                  borderRadius: "20px",
                  background: "rgba(251,191,36,0.12)",
                  color: "var(--amber-400, #fbbf24)",
                  border: "1px solid rgba(251,191,36,0.2)",
                }}
              >
                {ach}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatMini({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: "0.9375rem",
          fontWeight: 700,
          color: highlight ? "var(--amber-400, #fbbf24)" : "var(--text-primary, #f0f2f5)",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: "0.625rem",
          color: "var(--text-muted, #8494a7)",
          marginTop: "0.125rem",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Frequent Routes
// ---------------------------------------------------------------------------

function FrequentRoutesSection({ routes }: { routes: FrequentRoute[] }) {
  if (routes.length === 0) {
    return (
      <Card title="Frequent Routes" subtitle="Routes you drive regularly">
        <p style={{ fontSize: "0.875rem", color: "var(--text-muted, #8494a7)", padding: "0.5rem 0" }}>
          No frequent routes detected yet. Keep tracking trips to see patterns here.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Frequent Routes" subtitle="Routes you drive most often">
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {routes.map((route, idx) => (
          <div
            key={idx}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              padding: "0.875rem 1rem",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "8px",
              flexWrap: "wrap",
            }}
          >
            {/* Route label */}
            <div style={{ flex: 1, minWidth: "160px" }}>
              <div
                style={{
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: "var(--text-primary, #f0f2f5)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.375rem",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {route.startAddress}
                </span>
                <span style={{ color: "var(--text-muted, #8494a7)", fontWeight: 400 }}>&rarr;</span>
                <span style={{ maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {route.endAddress}
                </span>
              </div>
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-muted, #8494a7)",
                  marginTop: "0.25rem",
                  display: "flex",
                  gap: "0.75rem",
                  flexWrap: "wrap",
                }}
              >
                <span>avg {formatDuration(route.avgDurationMinutes)}</span>
                <span>fastest {formatDuration(route.fastestDurationMinutes)}</span>
                <span>{formatMiles(route.avgDistanceMiles)} mi</span>
              </div>
            </div>

            {/* Trip count badge */}
            <Badge variant="primary">{route.tripCount} trips</Badge>

            {/* Classification */}
            <Badge variant={route.classification === "business" ? "business" : "personal"}>
              {route.classification === "business" ? "Business" : "Personal"}
            </Badge>

            {/* Day dots */}
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <DayDots breakdown={route.dayBreakdown} />
              <div
                style={{
                  display: "flex",
                  gap: "3px",
                }}
              >
                {DAY_LABELS_SHORT.map((d, i) => (
                  <div
                    key={i}
                    style={{
                      width: "8px",
                      fontSize: "0.4375rem",
                      color: "var(--text-muted, #8494a7)",
                      textAlign: "center",
                    }}
                  >
                    {d[0]}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Shift Sweet Spots
// ---------------------------------------------------------------------------

function ShiftSweetSpotsSection({ sweetSpots }: { sweetSpots: ShiftSweetSpot[] }) {
  if (sweetSpots.length === 0) {
    return (
      <Card title="Shift Sweet Spots" subtitle="Discover your most productive shift durations">
        <p style={{ fontSize: "0.875rem", color: "var(--text-muted, #8494a7)", padding: "0.5rem 0" }}>
          Complete more shifts to see which durations earn you the most per hour.
        </p>
      </Card>
    );
  }

  const best = sweetSpots.reduce(
    (max, s, i) => (s.avgEarningsPerHourPence > sweetSpots[max].avgEarningsPerHourPence ? i : max),
    0
  );

  const chartData = sweetSpots.map((s) => ({
    label: s.durationBucket,
    value: s.avgEarningsPerHourPence,
    sub: `${s.shiftCount} shift${s.shiftCount !== 1 ? "s" : ""}`,
  }));

  return (
    <Card
      title="Shift Sweet Spots"
      subtitle="Average earnings per hour by shift duration"
    >
      <div style={{ marginBottom: "1rem" }}>
        <HorizontalBarChart
          title=""
          data={chartData}
          highlight={best}
          formatBar={(v) => `${formatPence(v)}/hr`}
          formatSub={(item) => item.sub ?? ""}
        />
      </div>

      {/* Best bucket callout */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          padding: "0.75rem 1rem",
          background: "rgba(251,191,36,0.06)",
          border: "1px solid rgba(251,191,36,0.15)",
          borderRadius: "8px",
        }}
      >
        <span style={{ fontSize: "1.25rem" }}>&#9733;</span>
        <div>
          <div
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--amber-400, #fbbf24)",
            }}
          >
            Sweet spot: {sweetSpots[best].durationBucket} shifts
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted, #8494a7)" }}>
            {formatPence(sweetSpots[best].avgEarningsPerHourPence)}/hr avg &middot;{" "}
            {sweetSpots[best].avgTrips.toFixed(1)} trips &middot;{" "}
            {formatMiles(sweetSpots[best].avgMiles)} mi avg
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Fuel Cost Breakdown
// ---------------------------------------------------------------------------

function FuelCostSection({ fuel }: { fuel: FuelCostBreakdown }) {
  const mpg = fuel.actualMpg ?? fuel.estimatedMpg;
  const hasVehicles = fuel.perVehicle.length > 0;
  const hasFillUps = fuel.recentFillUps.length > 0;

  return (
    <Card title="Fuel Cost Breakdown" subtitle="Running costs and fuel efficiency">
      {/* Hero stats */}
      <div
        className="stats-grid"
        style={{ marginBottom: "1.25rem" }}
      >
        <div className="stat-card">
          <div className="stat-card__value stat-card__value--amber">
            {fuel.fuelCostPerMilePence !== null
              ? `${fuel.fuelCostPerMilePence.toFixed(1)}p`
              : "—"}
          </div>
          <div className="stat-card__label">Cost per mile</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value">
            {mpg !== null ? `${mpg.toFixed(1)} MPG` : "—"}
          </div>
          <div className="stat-card__label">
            {fuel.actualMpg !== null ? "Actual MPG" : "Estimated MPG"}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value">
            {formatPence(fuel.totalFuelCostPence)}
          </div>
          <div className="stat-card__label">Total fuel spend</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value">
            {formatMiles(fuel.totalMilesDriven)} mi
          </div>
          <div className="stat-card__label">Total miles driven</div>
        </div>
      </div>

      {/* Per-vehicle table */}
      {hasVehicles && fuel.perVehicle.length > 1 && (
        <div style={{ marginBottom: "1.25rem" }}>
          <h4
            style={{
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: "var(--text-primary, #f0f2f5)",
              marginBottom: "0.625rem",
            }}
          >
            By Vehicle
          </h4>
          <div className="table-wrap" style={{ border: "none", background: "transparent" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>MPG</th>
                  <th>Cost/mile</th>
                  <th>Total cost</th>
                  <th>Miles</th>
                </tr>
              </thead>
              <tbody>
                {fuel.perVehicle.map((v) => (
                  <tr key={v.vehicleId}>
                    <td>
                      {v.make} {v.model}
                      <span
                        style={{
                          marginLeft: "0.375rem",
                          fontSize: "0.6875rem",
                          color: "var(--text-muted, #8494a7)",
                        }}
                      >
                        {v.fuelType}
                      </span>
                    </td>
                    <td>{v.mpg !== null ? v.mpg.toFixed(1) : "—"}</td>
                    <td>
                      {v.costPerMilePence !== null
                        ? `${v.costPerMilePence.toFixed(1)}p`
                        : "—"}
                    </td>
                    <td style={{ color: "var(--emerald-500)", fontWeight: 600 }}>
                      {formatPence(v.totalCostPence)}
                    </td>
                    <td>{formatMiles(v.milesDriven)} mi</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent fill-ups */}
      {hasFillUps && (
        <div>
          <h4
            style={{
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: "var(--text-primary, #f0f2f5)",
              marginBottom: "0.625rem",
            }}
          >
            Recent Fill-ups
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {fuel.recentFillUps.slice(0, 5).map((f, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.625rem 0.875rem",
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  borderRadius: "6px",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-muted, #8494a7)",
                      minWidth: "60px",
                    }}
                  >
                    {new Date(f.date).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  <span style={{ fontSize: "0.8125rem", color: "var(--text-primary, #f0f2f5)" }}>
                    {f.stationName ?? "Unknown station"}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "1rem",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted, #8494a7)" }}>
                    {f.litres.toFixed(1)} L
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted, #8494a7)" }}>
                    {f.costPerLitrePence.toFixed(1)}p/L
                  </span>
                  <span
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      color: "var(--text-primary, #f0f2f5)",
                    }}
                  >
                    {formatPence(f.costPence)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasVehicles && !hasFillUps && (
        <p style={{ fontSize: "0.875rem", color: "var(--text-muted, #8494a7)" }}>
          Log fuel fill-ups to see cost breakdowns and MPG calculations here.
        </p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Earnings by Day
// ---------------------------------------------------------------------------

function EarningsByDaySection({ patterns }: { patterns: EarningsDayPattern[] }) {
  if (patterns.length === 0) {
    return (
      <Card title="Earnings by Day" subtitle="Which days earn you the most">
        <p style={{ fontSize: "0.875rem", color: "var(--text-muted, #8494a7)", padding: "0.5rem 0" }}>
          Add earnings data to see which days of the week are most profitable.
        </p>
      </Card>
    );
  }

  const maxEarn = Math.max(...patterns.map((p) => p.avgEarningsPence), 1);
  const bestDay = patterns.reduce(
    (best, p) => (p.avgEarningsPence > best.avgEarningsPence ? p : best),
    patterns[0]
  );

  const chartData = patterns.map((p) => ({
    label: p.day.slice(0, 3),
    value: p.avgEarningsPence,
    highlight: p.dayIndex === bestDay.dayIndex,
  }));

  const totalEarnings = patterns.reduce((sum, p) => sum + p.totalEarningsPence, 0);
  const totalTrips = patterns.reduce((sum, p) => sum + p.tripCount, 0);

  return (
    <Card title="Earnings by Day" subtitle="Average earnings per day of the week">
      <div style={{ marginBottom: "1rem" }}>
        <VerticalBarChart
          title=""
          data={chartData}
          formatValue={(v) => formatPence(v)}
        />
      </div>

      {/* Summary text */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "1rem",
          padding: "0.75rem 1rem",
          background: "rgba(251,191,36,0.04)",
          border: "1px solid rgba(251,191,36,0.1)",
          borderRadius: "8px",
          alignItems: "center",
        }}
      >
        <div>
          <span style={{ fontSize: "0.875rem", color: "var(--text-muted, #8494a7)" }}>
            Best day:{" "}
          </span>
          <span
            style={{
              fontWeight: 700,
              color: "var(--amber-400, #fbbf24)",
              fontSize: "0.9375rem",
            }}
          >
            {bestDay.day}
          </span>
          <span style={{ fontSize: "0.8125rem", color: "var(--text-muted, #8494a7)" }}>
            {" "}
            — {formatPence(bestDay.avgEarningsPence)} avg
          </span>
        </div>
        <div style={{ fontSize: "0.8125rem", color: "var(--text-muted, #8494a7)" }}>
          Total: {formatPence(totalEarnings)} &middot; {totalTrips} trips
        </div>
      </div>

      {/* Day detail table */}
      <div
        className="table-wrap"
        style={{ border: "none", background: "transparent", marginTop: "1rem" }}
      >
        <table className="table">
          <thead>
            <tr>
              <th>Day</th>
              <th>Avg Earnings</th>
              <th>Total Earnings</th>
              <th>Trips</th>
            </tr>
          </thead>
          <tbody>
            {patterns.map((p) => (
              <tr
                key={p.dayIndex}
                style={
                  p.dayIndex === bestDay.dayIndex
                    ? { background: "rgba(251,191,36,0.04)" }
                    : undefined
                }
              >
                <td>
                  <span
                    style={{
                      fontWeight: p.dayIndex === bestDay.dayIndex ? 700 : undefined,
                      color:
                        p.dayIndex === bestDay.dayIndex
                          ? "var(--amber-400, #fbbf24)"
                          : undefined,
                    }}
                  >
                    {p.day}
                    {p.dayIndex === bestDay.dayIndex && (
                      <span
                        style={{
                          marginLeft: "0.4rem",
                          fontSize: "0.625rem",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          color: "var(--amber-400, #fbbf24)",
                          opacity: 0.7,
                        }}
                      >
                        best
                      </span>
                    )}
                  </span>
                </td>
                <td style={{ fontWeight: 600 }}>{formatPence(p.avgEarningsPence)}</td>
                <td>{formatPence(p.totalEarningsPence)}</td>
                <td style={{ color: "var(--text-muted, #8494a7)" }}>{p.tripCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Commute Timing
// ---------------------------------------------------------------------------

function CommuteTimingSection({ routes }: { routes: CommuteTiming[] }) {
  if (routes.length === 0) {
    return (
      <Card title="Commute Timing" subtitle="Journey time insights for your regular routes">
        <p style={{ fontSize: "0.875rem", color: "var(--text-muted, #8494a7)", padding: "0.5rem 0" }}>
          No commute patterns detected yet. Regular trips between saved locations will appear here.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Commute Timing" subtitle="Best departure times for your regular routes">
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {routes.map((route, idx) => (
          <div
            key={idx}
            style={{
              padding: "1rem",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "10px",
            }}
          >
            {/* Route header */}
            <div
              style={{
                fontSize: "0.9375rem",
                fontWeight: 600,
                color: "var(--text-primary, #f0f2f5)",
                marginBottom: "0.5rem",
              }}
            >
              {route.routeLabel}
            </div>
            <div
              style={{
                fontSize: "0.75rem",
                color: "var(--text-muted, #8494a7)",
                marginBottom: "0.875rem",
              }}
            >
              {route.locationFrom} &rarr; {route.locationTo}
            </div>

            {/* Avg / Best / Worst stats */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "0.5rem",
                marginBottom: "0.875rem",
              }}
            >
              <div
                style={{
                  textAlign: "center",
                  padding: "0.5rem",
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: "6px",
                }}
              >
                <div
                  style={{
                    fontSize: "1rem",
                    fontWeight: 700,
                    color: "var(--text-primary, #f0f2f5)",
                  }}
                >
                  {formatDuration(route.avgDurationMinutes)}
                </div>
                <div style={{ fontSize: "0.625rem", color: "var(--text-muted, #8494a7)", marginTop: "2px" }}>
                  avg
                </div>
              </div>
              <div
                style={{
                  textAlign: "center",
                  padding: "0.5rem",
                  background: "rgba(16,185,129,0.06)",
                  borderRadius: "6px",
                  border: "1px solid rgba(16,185,129,0.15)",
                }}
              >
                <div
                  style={{ fontSize: "1rem", fontWeight: 700, color: "var(--emerald-500)" }}
                >
                  {formatDuration(route.bestDurationMinutes)}
                </div>
                <div style={{ fontSize: "0.625rem", color: "var(--emerald-500)", opacity: 0.7, marginTop: "2px" }}>
                  best
                </div>
              </div>
              <div
                style={{
                  textAlign: "center",
                  padding: "0.5rem",
                  background: "rgba(239,68,68,0.06)",
                  borderRadius: "6px",
                  border: "1px solid rgba(239,68,68,0.15)",
                }}
              >
                <div
                  style={{ fontSize: "1rem", fontWeight: 700, color: "var(--dash-red)" }}
                >
                  {formatDuration(route.worstDurationMinutes)}
                </div>
                <div style={{ fontSize: "0.625rem", color: "var(--dash-red)", opacity: 0.7, marginTop: "2px" }}>
                  worst
                </div>
              </div>
            </div>

            {/* Best departure callout */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.625rem",
                padding: "0.625rem 0.875rem",
                background: "rgba(251,191,36,0.06)",
                border: "1px solid rgba(251,191,36,0.15)",
                borderRadius: "6px",
                marginBottom: "0.75rem",
              }}
            >
              <span style={{ fontSize: "0.875rem" }}>&#8987;</span>
              <span
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  color: "var(--amber-400, #fbbf24)",
                }}
              >
                {route.bestDepartureLabel}
              </span>
            </div>

            {/* Hour-by-hour mini chart */}
            {route.byHour.length > 0 && (
              <div>
                <div
                  style={{
                    fontSize: "0.6875rem",
                    color: "var(--text-muted, #8494a7)",
                    marginBottom: "0.375rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Journey time by hour (shorter = better)
                </div>
                <HourMiniChart byHour={route.byHour} />
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function DrivingAnalyticsPage() {
  const { user } = useAuth();
  const mode = user?.dashboardMode ?? "both";
  const isWorkMode = mode === "work" || mode === "both";

  const [analytics, setAnalytics] = useState<DrivingAnalytics | null>(null);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [weeksBack, setWeeksBack] = useState(0);
  const [loading, setLoading] = useState(true);
  const [weekLoading, setWeekLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load main analytics data on mount
  useEffect(() => {
    async function load() {
      try {
        const res = await api.get<{ data: DrivingAnalytics }>("/analytics");
        setAnalytics(res.data);
        setWeeklyReport(res.data.weeklyReport);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load analytics";
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Load weekly report when week navigation changes
  const loadWeeklyReport = useCallback(
    async (wb: number) => {
      setWeekLoading(true);
      try {
        const res = await api.get<{ data: WeeklyReport }>(
          `/analytics/weekly-report?weeksBack=${wb}`
        );
        setWeeklyReport(res.data);
      } catch {
        // Silently keep current report on week nav error
      } finally {
        setWeekLoading(false);
      }
    },
    []
  );

  const handlePrevWeek = useCallback(() => {
    const next = weeksBack + 1;
    setWeeksBack(next);
    loadWeeklyReport(next);
  }, [weeksBack, loadWeeklyReport]);

  const handleNextWeek = useCallback(() => {
    if (weeksBack === 0) return;
    const next = weeksBack - 1;
    setWeeksBack(next);
    loadWeeklyReport(next);
  }, [weeksBack, loadWeeklyReport]);

  if (loading) {
    return (
      <>
        <PageHeader title="Driving Analytics" subtitle="Patterns, routes, and performance insights" />
        <DashboardSkeleton />
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader title="Driving Analytics" subtitle="Patterns, routes, and performance insights" />
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      </>
    );
  }

  if (!analytics) return null;

  return (
    <>
      <PageHeader
        title="Driving Analytics"
        subtitle="Patterns, routes, and performance insights"
      />

      {/* 1. Weekly Report — always shown */}
      {weeklyReport && (
        <WeeklyReportSection
          report={weeklyReport}
          weeksBack={weeksBack}
          onPrev={handlePrevWeek}
          onNext={handleNextWeek}
          loading={weekLoading}
        />
      )}

      {/* 2. Frequent Routes — always shown */}
      <div style={{ marginBottom: "var(--dash-gap, 1.5rem)" }}>
        <FrequentRoutesSection routes={analytics.frequentRoutes} />
      </div>

      {/* 3. Shift Sweet Spots — business/both mode only */}
      {isWorkMode && analytics.shiftSweetSpots.length > 0 && (
        <div style={{ marginBottom: "var(--dash-gap, 1.5rem)" }}>
          <ShiftSweetSpotsSection sweetSpots={analytics.shiftSweetSpots} />
        </div>
      )}

      {/* 4. Fuel Cost Breakdown — always shown */}
      <div style={{ marginBottom: "var(--dash-gap, 1.5rem)" }}>
        <FuelCostSection fuel={analytics.fuelCost} />
      </div>

      {/* 5. Earnings by Day — business/both mode only */}
      {isWorkMode && (
        <div style={{ marginBottom: "var(--dash-gap, 1.5rem)" }}>
          <EarningsByDaySection patterns={analytics.earningsByDay} />
        </div>
      )}

      {/* 6. Commute Timing — always shown */}
      <div style={{ marginBottom: "var(--dash-gap, 1.5rem)" }}>
        <CommuteTimingSection routes={analytics.commuteTiming} />
      </div>
    </>
  );
}
