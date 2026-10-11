"use client";

import { useCallback, useEffect, useState } from "react";
import { use } from "react";
import { formatPence, formatMiles, GIG_PLATFORMS } from "@mileclear/shared";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";

// ── Types: the shape GET /accountant/dashboard/:token sends ──────────

interface AccountantDashboardData {
  client: { name: string; email: string };
  taxYear: string;
  availableTaxYears: string[];
  accessExpiresAt: string;
  summary: {
    businessTrips: number;
    businessMiles: number;
    unsortedTrips: number;
    unsortedMiles: number;
    mileageDeductionPence: number;
    vehicles: Array<{
      name: string;
      vehicleType: string;
      businessMiles: number;
      deductionPence: number;
    }>;
    earningsTotalPence: number;
    earningsByPlatform: Array<{ platform: string; totalPence: number }>;
  };
  expenses: {
    categories: Array<{
      category: string;
      label: string;
      totalPence: number;
      deductibleWithMileage: boolean;
    }>;
    totalAllowablePence: number;
    totalNonAllowablePence: number;
  };
  trips: Array<{
    id: string;
    startedAt: string;
    endedAt: string | null;
    distanceMiles: number;
    platformTag: string | null;
    startAddress: string | null;
    endAddress: string | null;
  }>;
  tripsShownLimit: number;
  generatedAt: string;
}

type Problem = "not_found" | "revoked" | "expired" | "invite_expired" | "network";

const PROBLEM_COPY: Record<Problem, { title: string; body: string }> = {
  not_found: {
    title: "Link not recognised",
    body: "This link does not match an invite. Check you opened the whole link from the email, or ask your client to send a new invite from MileClear.",
  },
  revoked: {
    title: "Access removed",
    body: "Your client has removed your access to their records. If you still need them, ask your client to invite you again from MileClear.",
  },
  expired: {
    title: "Access ended",
    body: "Access through this link lasts 12 months, and that time is up. Ask your client to send you a new invite from MileClear.",
  },
  invite_expired: {
    title: "Invite ran out",
    body: "Invites have to be opened within 7 days, and this one was not. Ask your client to send you a new invite from MileClear.",
  },
  network: {
    title: "Could not load the records",
    body: "Something stopped the page loading. Check your connection and try again.",
  },
};

/** Map an API error response to the message the accountant sees. */
async function problemFrom(res: Response): Promise<Problem> {
  try {
    const body = (await res.json()) as { code?: string };
    if (
      body.code === "not_found" ||
      body.code === "revoked" ||
      body.code === "expired" ||
      body.code === "invite_expired"
    ) {
      return body.code;
    }
  } catch {
    // Not JSON: fall through to the status code.
  }
  if (res.status === 404 || res.status === 400) return "not_found";
  if (res.status === 403) return "revoked";
  if (res.status === 410) return "expired";
  return "network";
}

const platformLabel = (value: string | null) =>
  value ? GIG_PLATFORMS.find((p) => p.value === value)?.label ?? value : "";

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** "2025-26" -> "6 April 2025 to 5 April 2026" */
function taxYearRange(taxYear: string): string {
  const start = parseInt(taxYear.slice(0, 4), 10);
  return Number.isFinite(start) ? `6 April ${start} to 5 April ${start + 1}` : "";
}

// ── Skeleton ─────────────────────────────────────────────────────────

function Skeleton({ height = 120, style }: { height?: number; style?: React.CSSProperties }) {
  return (
    <div
      className="accountant-skeleton"
      style={{ height, borderRadius: 12, ...style }}
    />
  );
}

// ── Main component ───────────────────────────────────────────────────

export default function AccountantDashboardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  const [accepted, setAccepted] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [data, setData] = useState<AccountantDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Problem | null>(null);

  // Step 1: accept the invite. Safe on every visit: once accepted, it only
  // confirms the access is still live.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`${API_URL}/accountant/accept/${token}`, { method: "POST" })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(await problemFrom(res));
          setLoading(false);
          return;
        }
        setAccepted(true);
      })
      .catch(() => {
        if (cancelled) return;
        setError("network");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Step 2: load the records for the chosen tax year (the API picks the
  // current one until the accountant chooses).
  const load = useCallback(
    async (year: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const query = year ? `?taxYear=${encodeURIComponent(year)}` : "";
        const res = await fetch(`${API_URL}/accountant/dashboard/${token}${query}`);
        if (!res.ok) {
          setError(await problemFrom(res));
          return;
        }
        const json = (await res.json()) as { data: AccountantDashboardData };
        setData(json.data);
        setSelectedYear(json.data.taxYear);
      } catch {
        setError("network");
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (accepted) void load(null);
  }, [accepted, load]);

  const exportUrl = (format: "csv" | "pdf") =>
    `${API_URL}/accountant/export/${token}?format=${format}&taxYear=${encodeURIComponent(selectedYear ?? "")}`;

  // ── Error states ─────────────────────────────────────────────────

  if (error) {
    const copy = PROBLEM_COPY[error];
    return (
      <div className="accountant-error">
        <h1 className="accountant-error__title">{copy.title}</h1>
        <p className="accountant-error__desc">{copy.body}</p>
        {error === "network" && (
          <button
            className="accountant-btn accountant-btn--primary"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  // ── Loading ──────────────────────────────────────────────────────

  if (loading || !data) {
    return (
      <div className="accountant-dashboard">
        <div className="accountant-toolbar">
          <Skeleton height={32} style={{ width: 220 }} />
          <Skeleton height={36} style={{ width: 140 }} />
        </div>
        <div className="accountant-grid accountant-grid--4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={96} />
          ))}
        </div>
        <div className="accountant-grid accountant-grid--2">
          <Skeleton height={200} />
          <Skeleton height={200} />
        </div>
        <Skeleton height={180} />
      </div>
    );
  }

  const { client, taxYear, summary, expenses, trips } = data;
  const yearOptions = data.availableTaxYears.includes(taxYear)
    ? data.availableTaxYears
    : [taxYear, ...data.availableTaxYears];
  const expenseTotalPence = expenses.totalAllowablePence + expenses.totalNonAllowablePence;

  return (
    <div className="accountant-dashboard">
      {/* Toolbar */}
      <div className="accountant-toolbar">
        <div className="accountant-toolbar__left">
          <h1 className="accountant-toolbar__name">{client.name}</h1>
          <p className="accountant-toolbar__sub">
            Tax year {taxYear}: {taxYearRange(taxYear)}. Business records only.
          </p>
        </div>
        <div className="accountant-toolbar__right">
          <select
            className="accountant-select"
            value={selectedYear ?? taxYear}
            onChange={(e) => void load(e.target.value)}
            aria-label="Tax year"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <a href={exportUrl("pdf")} className="accountant-btn accountant-btn--secondary">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 1v7m0 0l-2.5-2.5M7 8l2.5-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M1 10v2a1 1 0 001 1h10a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            PDF
          </a>
          <a href={exportUrl("csv")} className="accountant-btn accountant-btn--primary">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 1v7m0 0l-2.5-2.5M7 8l2.5-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M1 10v2a1 1 0 001 1h10a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            CSV
          </a>
        </div>
      </div>

      {/* Business mileage */}
      <section className="accountant-section">
        <h2 className="accountant-section__title">Business mileage</h2>
        <div className="accountant-grid accountant-grid--4">
          <div className="accountant-card">
            <div className="accountant-stat">{summary.businessTrips.toLocaleString("en-GB")}</div>
            <div className="accountant-stat__label">Business trips</div>
          </div>
          <div className="accountant-card">
            <div className="accountant-stat accountant-stat--amber">{formatMiles(summary.businessMiles)}</div>
            <div className="accountant-stat__label">Business miles</div>
          </div>
          <div className="accountant-card">
            <div className="accountant-stat accountant-stat--amber">{formatPence(summary.mileageDeductionPence)}</div>
            <div className="accountant-stat__label">Mileage claim at HMRC rates</div>
          </div>
          <div className="accountant-card">
            <div className="accountant-stat">{summary.unsortedTrips.toLocaleString("en-GB")}</div>
            <div className="accountant-stat__label">
              {summary.unsortedTrips === 0
                ? "Trips not sorted yet"
                : `Trips not sorted yet (${formatMiles(summary.unsortedMiles)}), not counted above`}
            </div>
          </div>
        </div>
      </section>

      {/* Vehicles + Earnings */}
      <div className="accountant-grid accountant-grid--2" style={{ marginTop: "1.5rem" }}>
        <section className="accountant-section">
          <h2 className="accountant-section__title">Mileage claim by vehicle</h2>
          {summary.vehicles.length === 0 ? (
            <div className="accountant-card accountant-empty">No business miles recorded for {taxYear}.</div>
          ) : (
            <div className="accountant-table-wrap">
              <table className="accountant-table">
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Business miles</th>
                    <th>Claim</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.vehicles.map((v) => (
                    <tr key={v.name}>
                      <td>
                        {v.name}
                        <span className="accountant-tag">{v.vehicleType}</span>
                      </td>
                      <td>{formatMiles(v.businessMiles)}</td>
                      <td className="accountant-td--amber">{formatPence(v.deductionPence)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="accountant-section">
          <h2 className="accountant-section__title">Earnings by platform</h2>
          {summary.earningsByPlatform.length === 0 ? (
            <div className="accountant-card accountant-empty">No earnings recorded for {taxYear}.</div>
          ) : (
            <div className="accountant-table-wrap">
              <table className="accountant-table">
                <thead>
                  <tr>
                    <th>Platform</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {[...summary.earningsByPlatform]
                    .sort((a, b) => b.totalPence - a.totalPence)
                    .map((e) => (
                      <tr key={e.platform}>
                        <td>{platformLabel(e.platform)}</td>
                        <td className="accountant-td--emerald">{formatPence(e.totalPence)}</td>
                      </tr>
                    ))}
                  <tr>
                    <td><strong>Total</strong></td>
                    <td className="accountant-td--emerald"><strong>{formatPence(summary.earningsTotalPence)}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Expenses */}
      <section className="accountant-section" style={{ marginTop: "1.5rem" }}>
        <h2 className="accountant-section__title">Expenses</h2>
        {expenses.categories.length === 0 ? (
          <div className="accountant-card accountant-empty">No expenses recorded for {taxYear}.</div>
        ) : (
          <div className="accountant-table-wrap">
            <table className="accountant-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Claimable alongside mileage rates</th>
                </tr>
              </thead>
              <tbody>
                {[...expenses.categories]
                  .sort((a, b) => b.totalPence - a.totalPence)
                  .map((row) => (
                    <tr key={row.category}>
                      <td>{row.label}</td>
                      <td>{formatPence(row.totalPence)}</td>
                      <td>
                        {row.deductibleWithMileage ? (
                          <span className="accountant-badge accountant-badge--success">Yes</span>
                        ) : (
                          <span className="accountant-badge accountant-badge--muted">No</span>
                        )}
                      </td>
                    </tr>
                  ))}
                <tr>
                  <td><strong>Total</strong></td>
                  <td><strong>{formatPence(expenseTotalPence)}</strong></td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Business trips */}
      <section className="accountant-section" style={{ marginTop: "1.5rem" }}>
        <h2 className="accountant-section__title">Business trips</h2>
        {trips.length === 0 ? (
          <div className="accountant-card accountant-empty">No business trips recorded for {taxYear}.</div>
        ) : (
          <>
            {summary.businessTrips > trips.length && (
              <p className="accountant-toolbar__sub" style={{ marginBottom: "0.75rem" }}>
                Showing the latest {trips.length} of {summary.businessTrips.toLocaleString("en-GB")}. The CSV and PDF include them all.
              </p>
            )}
            <div className="accountant-table-wrap">
              <table className="accountant-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Miles</th>
                    <th>Platform</th>
                  </tr>
                </thead>
                <tbody>
                  {trips.map((t) => (
                    <tr key={t.id}>
                      <td>{shortDate(t.startedAt)}</td>
                      <td>{t.startAddress ?? ""}</td>
                      <td>{t.endAddress ?? ""}</td>
                      <td>{formatMiles(t.distanceMiles)}</td>
                      <td>{platformLabel(t.platformTag)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <p className="accountant-generated">
        Read only. Personal trips are not shared. This link works until {longDate(data.accessExpiresAt)} unless{" "}
        {client.name} removes your access.
      </p>
    </div>
  );
}
