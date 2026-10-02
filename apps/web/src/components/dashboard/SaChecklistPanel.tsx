"use client";

// "Ready for 31 January?" Self Assessment checklist on the web Tax page
// (2 Oct 2026). Same data as the app's card and checklist screen
// (GET /self-assessment/checklist). Shown from 1 December to 31 January to
// drivers it is for; admins see it all year as a preview (the API only
// honours ?preview=1 for admins). Renders nothing otherwise, or on error.

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SaChecklist, SaChecklistAction, SaChecklistItem } from "@mileclear/shared";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";

function hrefFor(action: SaChecklistAction, taxYear: string): string {
  const start = parseInt(taxYear.slice(0, 4), 10);
  switch (action) {
    case "unclassified_trips":
      return `/dashboard/trips?filter=unclassified&from=${start}-04-06&to=${start + 1}-04-05`;
    case "add_trip":
      return "/dashboard/trips";
    case "earnings":
      return "/dashboard/earnings";
    case "expenses":
      return "/dashboard/expenses";
    case "vehicles":
      return "/dashboard/vehicles";
    case "profile_name":
      return "/dashboard/settings";
    case "self_assessment":
      return "/dashboard/self-assessment";
    case "sa_pdf":
      // The Exports page carries the PDF download and its Pro gate.
      return "/dashboard/exports";
  }
}

function daysLabel(days: number): string {
  if (days < 0) return "Deadline passed";
  if (days === 0) return "Deadline today";
  if (days === 1) return "1 day to go";
  return `${days} days to go`;
}

const STATUS: Record<SaChecklistItem["status"], { mark: string; color: string; label: string }> = {
  done: { mark: "✓", color: "var(--emerald-400)", label: "Done" },
  attention: { mark: "!", color: "var(--amber-400)", label: "Needs doing" },
  optional: { mark: "•", color: "var(--text-muted)", label: "Optional" },
};

export function SaChecklistPanel() {
  const { user } = useAuth();
  const [checklist, setChecklist] = useState<SaChecklist | null>(null);
  const isAdmin = !!user?.isAdmin;
  const isPremium = !!user?.isPremium;

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ data: SaChecklist }>(`/self-assessment/checklist${isAdmin ? "?preview=1" : ""}`)
      .then((res) => {
        if (!cancelled) setChecklist(res.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (!checklist || !checklist.eligible || !checklist.inSeason) return null;
  const c = checklist;
  const urgent = c.daysToDeadline <= 14;

  return (
    <Card
      title="Ready for 31 January?"
      subtitle={`Your ${c.taxYear} Self Assessment (${c.taxYearLabel})`}
      glow
      action={<Badge variant={urgent ? "danger" : "warning"}>{daysLabel(c.daysToDeadline)}</Badge>}
      style={{ marginBottom: "var(--dash-gap)" }}
    >
      <p style={{ fontWeight: 600, fontSize: "1.05rem", margin: "0 0 0.75rem", color: "var(--text-white)" }}>
        {c.headline}
      </p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.75rem" }}>
        {c.items.map((item) => {
          const st = STATUS[item.status];
          const isPdf = item.action === "sa_pdf";
          const label = isPdf && !isPremium ? "Download PDF (Pro)" : item.actionLabel;
          return (
            <li key={item.id} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
              <span
                aria-label={st.label}
                title={st.label}
                style={{
                  flex: "0 0 auto",
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  border: `1.5px solid ${st.color}`,
                  color: st.color,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  marginTop: 1,
                }}
              >
                {st.mark}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                  {item.title}
                  {item.status === "optional" && (
                    <span style={{ marginLeft: 8, fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 500 }}>
                      Optional
                    </span>
                  )}
                </div>
                <div style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.45 }}>
                  {item.detail}
                </div>
                {item.action && label && (
                  <Link
                    href={hrefFor(item.action, c.taxYear)}
                    style={{ display: "inline-block", marginTop: 4, color: "var(--amber-400)", fontWeight: 600, fontSize: "0.9rem" }}
                  >
                    {label} &rarr;
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p style={{ margin: "1rem 0 0", color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: 1.5 }}>
        You file your return yourself on GOV.UK, or your accountant does it for you. MileClear doesn&apos;t send
        anything on your behalf.
      </p>
    </Card>
  );
}
