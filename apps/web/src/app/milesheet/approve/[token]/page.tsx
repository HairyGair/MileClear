"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatPence } from "@mileclear/shared";
import MilesheetHeader from "../../../../components/milesheet/MilesheetHeader";
import { Badge } from "../../../../components/ui/Badge";
import { PriceQuestion, type PriceAnswer } from "../../../../components/milesheet/PriceQuestion";

// Milesheet (Oct 2026): approve last month from the email, no account
// needed. The link in the monthly email lands here; the token in the path
// is the only credential, and it covers one company for one month. The
// figures come from the same calculation as the portal, so the two never
// disagree. No driver emails are shown.

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";

type Status = "pending" | "approved" | "queried";

interface LinkDriver {
  id: string;
  name: string;
  businessTrips: number;
  businessMiles: number;
  amountPence: number;
  ratePence: number;
  status: Status;
  note: string | null;
  approvedAt: string | null;
  driftMiles: number | null;
  unclassifiedTrips: number;
}

interface LinkMonth {
  orgName: string;
  month: string;
  monthLabel: string;
  monthFinished: boolean;
  approvableFrom: string | null;
  hasAccount: boolean;
  askPrice: boolean;
  totalMiles: number;
  totalAmountPence: number;
  drivers: LinkDriver[];
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    referrerPolicy: "no-referrer",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(typeof body?.error === "string" ? body.error : `HTTP ${res.status}`) as Error & {
      expired?: boolean;
    };
    err.expired = body?.code === "LINK_EXPIRED";
    throw err;
  }
  return body as T;
}

const muted: React.CSSProperties = { color: "var(--text-secondary)" };
const link: React.CSSProperties = { color: "var(--amber-400)" };

function miles(n: number): string {
  return n.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export default function MilesheetApprovePage() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === "string" ? params.token : "";
  const base = `/team/approval-links/${encodeURIComponent(token)}`;

  const [state, setState] = useState<"loading" | "ready" | "expired" | "error">("loading");
  const [data, setData] = useState<LinkMonth | null>(null);
  const [errorText, setErrorText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);
  const [queryId, setQueryId] = useState<string | null>(null);
  const [queryNote, setQueryNote] = useState("");
  const [showPrice, setShowPrice] = useState(false);
  const [priceClosed, setPriceClosed] = useState(false);
  const [invite, setInvite] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [inviteError, setInviteError] = useState("");

  const load = useCallback(() => {
    if (!token) {
      setState("expired");
      return;
    }
    call<{ data: LinkMonth }>(base)
      .then((res) => {
        setData(res.data);
        setState("ready");
      })
      .catch((err: Error & { expired?: boolean }) => {
        if (err.expired) setState("expired");
        else {
          setErrorText(err.message);
          setState("error");
        }
      });
  }, [base, token]);

  useEffect(load, [load]);

  const patchDriver = (id: string, patch: Partial<LinkDriver>) =>
    setData((prev) => (prev ? { ...prev, drivers: prev.drivers.map((d) => (d.id === id ? { ...d, ...patch } : d)) } : prev));

  const decide = async (driver: LinkDriver, status: "approved" | "queried", note?: string) => {
    setBusyId(driver.id);
    setRowError(null);
    try {
      await call(`${base}/approvals`, {
        method: "POST",
        body: JSON.stringify({ driverId: driver.id, status, ...(note ? { note } : {}) }),
      });
      patchDriver(driver.id, {
        status,
        note: status === "queried" ? note ?? null : null,
        approvedAt: status === "approved" ? new Date().toISOString() : null,
        driftMiles: null,
      });
      setQueryId(null);
      setQueryNote("");
      if (status === "approved" && data?.askPrice && !priceClosed) setShowPrice(true);
    } catch (err) {
      const e = err as Error & { expired?: boolean };
      if (e.expired) setState("expired");
      else setRowError({ id: driver.id, text: e.message || "That didn't work. Please try again." });
    } finally {
      setBusyId(null);
    }
  };

  const answerPrice = async (answer: PriceAnswer, comment: string) => {
    await call(`${base}/price-answer`, {
      method: "POST",
      body: JSON.stringify({ answer, ...(comment ? { comment } : {}) }),
    });
  };

  const skipPrice = () => {
    setShowPrice(false);
    setPriceClosed(true);
    void call(`${base}/price-answer`, { method: "POST", body: JSON.stringify({ skip: true }) }).catch(() => undefined);
  };

  const requestInvite = async () => {
    setInvite("sending");
    try {
      await call(`${base}/invite`, { method: "POST" });
      setInvite("sent");
    } catch (err) {
      setInviteError((err as Error).message);
      setInvite("error");
    }
  };

  return (
    <>
      <MilesheetHeader />
      <main className="ms-main">
        <div className="ms-narrow">
          {state === "loading" && (
            <div className="card" style={{ padding: "2rem" }}>
              <p style={muted}>Loading the month…</p>
            </div>
          )}

          {state === "expired" && (
            <div className="card" style={{ padding: "2rem", lineHeight: 1.65 }}>
              <h1 style={{ fontSize: "1.375rem", marginBottom: "0.75rem", color: "var(--text-white)" }}>
                This link has expired
              </h1>
              <p style={muted}>
                Approval links work for 30 days, for one month&rsquo;s mileage. If you have a Milesheet account, you
                can approve any month from the team portal.
              </p>
              <p style={{ marginTop: "1.25rem", display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                <Link href={`/login?next=${encodeURIComponent("/milesheet/portal")}`} style={link}>
                  Sign in to the portal
                </Link>
                <a href="mailto:support@mileclear.com?subject=New%20Milesheet%20approval%20link" style={link}>
                  Ask us for a new link
                </a>
              </p>
            </div>
          )}

          {state === "error" && (
            <div className="card" style={{ padding: "2rem" }}>
              <h1 style={{ fontSize: "1.375rem", marginBottom: "0.75rem", color: "var(--text-white)" }}>
                That didn&rsquo;t load
              </h1>
              <p style={muted}>{errorText || "Something went wrong."}</p>
              <p style={{ marginTop: "1rem" }}>
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => { setState("loading"); load(); }}>
                  Try again
                </button>
              </p>
            </div>
          )}

          {state === "ready" && data && (
            <>
              <p className="ms-eyebrow">{data.orgName}</p>
              <h1 className="ms-hero__title" style={{ fontSize: "clamp(1.5rem, 4vw, 2rem)" }}>
                {data.monthLabel} mileage
              </h1>
              <p className="ms-lede">
                Check each driver&rsquo;s business mileage for {data.monthLabel}, then approve it or send a query back
                to the driver.
              </p>

              <div
                className="card"
                style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", padding: "1rem 1.25rem", marginBottom: "1rem" }}
              >
                <div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>{miles(data.totalMiles)}</div>
                  <div style={{ fontSize: "0.75rem", ...muted }}>business miles</div>
                </div>
                <div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--amber-400)" }}>
                    {formatPence(data.totalAmountPence)}
                  </div>
                  <div style={{ fontSize: "0.75rem", ...muted }}>to reimburse</div>
                </div>
                <div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>
                    {data.drivers.filter((d) => d.status === "approved").length} of {data.drivers.length}
                  </div>
                  <div style={{ fontSize: "0.75rem", ...muted }}>approved</div>
                </div>
              </div>

              {!data.monthFinished && (
                <p style={{ ...muted, fontSize: "0.875rem" }}>
                  {data.monthLabel} is still running. You can approve it from {data.approvableFrom}, and you can query
                  a driver now.
                </p>
              )}

              {showPrice && (
                <div className="card" style={{ padding: "1.25rem", marginBottom: "1rem", borderColor: "var(--amber-400)" }}>
                  <PriceQuestion onAnswer={answerPrice} onSkip={skipPrice} />
                </div>
              )}

              {data.drivers.length === 0 ? (
                <div className="card" style={{ padding: "1.25rem" }}>
                  <p style={muted}>No drivers have mileage to approve for {data.monthLabel}.</p>
                </div>
              ) : (
                <div style={{ display: "grid", gap: "0.75rem" }}>
                  {data.drivers.map((d) => {
                    const busy = busyId === d.id;
                    const canApprove = data.monthFinished && (d.status !== "approved" || d.driftMiles !== null);
                    return (
                      <div key={d.id} className="card" style={{ padding: "1rem 1.25rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", alignItems: "baseline" }}>
                          <strong style={{ fontSize: "1rem" }}>{d.name}</strong>
                          <span>
                            {d.status === "approved" && <Badge variant="success">Approved</Badge>}
                            {d.status === "queried" && <Badge variant="danger">Queried</Badge>}
                            {d.status === "pending" && <Badge variant="warning">Waiting</Badge>}
                          </span>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "1.25rem",
                            flexWrap: "wrap",
                            marginTop: "0.5rem",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          <span>{miles(d.businessMiles)} mi</span>
                          <span style={muted}>
                            {d.businessTrips} trip{d.businessTrips === 1 ? "" : "s"}
                          </span>
                          <span style={muted}>{d.ratePence}p/mi</span>
                          <span style={{ fontWeight: 600 }}>{formatPence(d.amountPence)}</span>
                        </div>
                        {d.unclassifiedTrips > 0 && (
                          <p style={{ fontSize: "0.8125rem", color: "var(--dash-red, #ef4444)", margin: "0.5rem 0 0" }}>
                            This total is incomplete. {d.unclassifiedTrips} trip{d.unclassifiedTrips === 1 ? " hasn't" : "s haven't"} been
                            sorted into business or personal yet.
                          </p>
                        )}
                        {d.driftMiles !== null && (
                          <p style={{ fontSize: "0.8125rem", color: "var(--amber-400)", margin: "0.5rem 0 0" }}>
                            Changed since it was approved: miles moved by {d.driftMiles > 0 ? "+" : ""}
                            {d.driftMiles.toFixed(1)}.
                          </p>
                        )}
                        {d.status === "queried" && d.note && (
                          <p style={{ fontSize: "0.8125rem", margin: "0.5rem 0 0", ...muted }}>Your query: &ldquo;{d.note}&rdquo;</p>
                        )}

                        {queryId === d.id ? (
                          <div style={{ marginTop: "0.75rem" }}>
                            <label htmlFor={`note-${d.id}`} className="form-label">
                              What needs checking? {d.name} will get your note on their phone.
                            </label>
                            <textarea
                              id={`note-${d.id}`}
                              className="form-input"
                              rows={3}
                              maxLength={1000}
                              value={queryNote}
                              onChange={(e) => setQueryNote(e.target.value)}
                              placeholder="e.g. Is the trip on the 14th personal?"
                            />
                            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                              <button
                                type="button"
                                className="btn btn--sm btn--primary"
                                disabled={busy || !queryNote.trim()}
                                onClick={() => decide(d, "queried", queryNote.trim())}
                              >
                                {busy ? "Sending..." : "Send query"}
                              </button>
                              <button
                                type="button"
                                className="btn btn--sm btn--ghost"
                                disabled={busy}
                                onClick={() => {
                                  setQueryId(null);
                                  setQueryNote("");
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
                            {canApprove && (
                              <button
                                type="button"
                                className="btn btn--sm btn--primary"
                                disabled={busy}
                                onClick={() => decide(d, "approved")}
                              >
                                {busy ? "Approving..." : d.status === "approved" ? "Approve again" : "Approve"}
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn--sm btn--ghost"
                              disabled={busy}
                              onClick={() => {
                                setQueryId(d.id);
                                setQueryNote("");
                              }}
                            >
                              Query
                            </button>
                          </div>
                        )}
                        {rowError?.id === d.id && (
                          <p style={{ fontSize: "0.8125rem", color: "var(--dash-red, #ef4444)", margin: "0.5rem 0 0" }}>
                            {rowError.text}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="card" style={{ padding: "1.25rem", marginTop: "1.5rem", lineHeight: 1.6 }}>
                {data.hasAccount ? (
                  <p style={{ margin: 0, ...muted }}>
                    To download the report for payroll or see other months,{" "}
                    <Link href="/milesheet/portal" style={link}>
                      open the team portal
                    </Link>
                    .
                  </p>
                ) : invite === "sent" ? (
                  <p style={{ margin: 0, ...muted }}>
                    We&rsquo;ve emailed you a link to set up your free account. It works for 7 days.
                  </p>
                ) : (
                  <>
                    <p style={{ margin: "0 0 0.75rem", ...muted }}>
                      You don&rsquo;t need an account to approve. With a free account you can also invite the rest of
                      the team, see every month, and download one file for payroll.
                    </p>
                    <button
                      type="button"
                      className="btn btn--sm btn--secondary"
                      disabled={invite === "sending"}
                      onClick={requestInvite}
                    >
                      {invite === "sending" ? "Sending..." : "Create your free account"}
                    </button>
                    {invite === "error" && (
                      <p style={{ fontSize: "0.8125rem", color: "var(--dash-red, #ef4444)", margin: "0.5rem 0 0" }}>
                        {inviteError || "That didn't send. Please try again."}
                      </p>
                    )}
                  </>
                )}
              </div>

              <p style={{ ...muted, fontSize: "0.75rem", marginTop: "1rem" }}>
                This page only shows {data.orgName}&rsquo;s {data.monthLabel} mileage. Please don&rsquo;t forward the
                link.
              </p>
            </>
          )}
        </div>
      </main>
    </>
  );
}
