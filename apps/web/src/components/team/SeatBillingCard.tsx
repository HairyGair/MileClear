"use client";

import { useEffect, useState } from "react";
import type { TeamSeatBilling } from "@mileclear/shared";
import { formatPence } from "@mileclear/shared";
import { api } from "../../lib/api";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";

// MileClear Teams Phase 3 (24 Aug 2026). Self-fetching, no props - rendered
// directly on the team portal (apps/web/src/app/dashboard/team/page.tsx).
// Mirrors the 20-seat self-serve checkout cap enforced server-side in
// routes/team/selfServe.ts - keep this in sync if that changes.
const INVOICE_THRESHOLD_SEATS = 20;

function statusBadge(status: TeamSeatBilling["status"]) {
  switch (status) {
    case "active":
      return <Badge variant="success">Active</Badge>;
    case "past_due":
      return <Badge variant="warning">Payment overdue</Badge>;
    case "canceled":
      return <Badge variant="danger">Cancelled</Badge>;
    default:
      return <Badge variant="source">Not subscribed</Badge>;
  }
}

export default function SeatBillingCard() {
  const [billing, setBilling] = useState<TeamSeatBilling | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    api
      .get<{ data: TeamSeatBilling }>("/team/billing")
      .then((res) => setBilling(res.data))
      .catch((err: Error) => setError(err.message || "Could not load billing"))
      .finally(() => setLoading(false));
  }, []);

  const startCheckout = async () => {
    setActionLoading(true);
    setError("");
    try {
      const res = await api.post<{ data: { url: string } }>("/team/billing/checkout");
      window.location.href = res.data.url;
    } catch (err: any) {
      setError(err.message || "Could not start checkout");
      setActionLoading(false);
    }
  };

  const openPortal = async () => {
    setActionLoading(true);
    setError("");
    try {
      const res = await api.post<{ data: { url: string } }>("/team/billing/portal");
      window.location.href = res.data.url;
    } catch (err: any) {
      setError(err.message || "Could not open billing portal");
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="card">
        <div className="card__header">
          <div className="card__title">Billing</div>
        </div>
        <div className="skeleton skeleton--text" style={{ width: "60%" }} />
      </div>
    );
  }

  if (error && !billing) {
    return (
      <div className="card">
        <div className="card__header">
          <div className="card__title">Billing</div>
        </div>
        <div className="alert alert--error">{error}</div>
      </div>
    );
  }

  if (!billing) return null;

  const monthlyTotalPence = billing.pricePerSeatPence * billing.activeSeats;
  const overThreshold = billing.activeSeats >= INVOICE_THRESHOLD_SEATS;

  // Free pilot: say so plainly, nothing to pay, no upsell.
  if (billing.pilotFree) {
    return (
      <div className="card">
        <div className="card__header">
          <div>
            <div className="card__title">Billing</div>
            <div className="card__subtitle">{billing.activeSeats} active driver{billing.activeSeats === 1 ? "" : "s"}</div>
          </div>
          <Badge variant="pro">Free pilot</Badge>
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.6 }}>
          This team is on a free MileClear Teams pilot. There is nothing to pay and no billing to set up.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card__header">
        <div>
          <div className="card__title">Billing</div>
          <div className="card__subtitle">{billing.activeSeats} active driver{billing.activeSeats === 1 ? "" : "s"}</div>
        </div>
        {statusBadge(billing.status)}
      </div>

      {error && <div className="alert alert--error" style={{ marginBottom: "0.75rem" }}>{error}</div>}

      {billing.status === "active" || billing.status === "past_due" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="billing-card">
            <div className="billing-card__status">
              <div
                className={`billing-card__dot billing-card__dot--${billing.status === "active" ? "active" : "inactive"}`}
              />
              <div>
                <div style={{ fontWeight: 600, color: "var(--text-white)" }}>
                  {formatPence(monthlyTotalPence)}/mo
                </div>
                <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                  {formatPence(billing.pricePerSeatPence)}/seat &middot; {billing.activeSeats} seat
                  {billing.activeSeats === 1 ? "" : "s"}
                  {billing.currentPeriodEnd &&
                    ` · renews ${new Date(billing.currentPeriodEnd).toLocaleDateString("en-GB")}`}
                </div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={openPortal} disabled={actionLoading}>
              {actionLoading ? "Opening..." : "Manage billing"}
            </Button>
          </div>
          {billing.status === "past_due" && (
            <p style={{ color: "var(--dash-red)", fontSize: "0.8125rem" }}>
              The last payment did not go through. Update the card in Manage billing to keep driver access.
            </p>
          )}
        </div>
      ) : overThreshold ? (
        <div>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.6, marginBottom: "0.75rem" }}>
            Teams of {INVOICE_THRESHOLD_SEATS}+ drivers are billed by invoice rather than self-serve card billing.
          </p>
          <a href="mailto:gair@mileclear.com" className="btn btn--secondary btn--sm">
            Get in touch about invoicing
          </a>
        </div>
      ) : (
        <div>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.6, marginBottom: "0.75rem" }}>
            {billing.status === "canceled"
              ? "Billing for this team was cancelled. Start it again to keep seats topped up automatically as drivers join."
              : "Start billing to pay per active driver, automatically, as people join or leave."}
            {" "}Currently {formatPence(billing.pricePerSeatPence)}/seat/month.
          </p>
          <Button variant="primary" size="sm" onClick={startCheckout} disabled={actionLoading || billing.activeSeats < 1}>
            {actionLoading ? "Redirecting..." : "Start billing"}
          </Button>
          {billing.activeSeats < 1 && (
            <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginTop: "0.5rem" }}>
              Invite at least one active driver first.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
