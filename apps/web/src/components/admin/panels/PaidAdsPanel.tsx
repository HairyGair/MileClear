"use client";

// Paid ads: Meta's figures for each boosted post (campaign) beside our own
// link clicks and the sign-ups who told us they found MileClear on Facebook.
// Meta's numbers are synced daily at 06:15 by the API (jobs/metaAds.ts).

import { useState } from "react";
import { api } from "@/lib/api";
import { Ago } from "../Ago";
import { DataTable, Grid, KpiCard, LoadState, LoadingSkeleton, Notice, Panel, Spinner, formatNumber, formatPence, useAdminData } from "../ui";

interface PaidAdCampaign {
  id: string;
  name: string;
  status: string | null;
  objective: string | null;
  startTime: string | null;
  stopTime: string | null;
  currency: string;
  spendPence: number;
  impressions: number;
  reach: number;
  metaLinkClicks: number;
  fromSource: string | null;
  ourClicks: number;
  facebookSignups: number;
  instagramSignups: number;
  allSignups: number;
  costPerMetaClickPence: number | null;
  costPerOurClickPence: number | null;
  costPerFacebookSignupPence: number | null;
}

interface PaidAds {
  configured: boolean;
  syncing: boolean;
  accountName: string | null;
  currency: string;
  lastSyncedAt: string | null;
  totals: {
    spendPence: number;
    metaLinkClicks: number;
    ourClicks: number;
    facebookSignups: number;
    costPerFacebookSignupPence: number | null;
  };
  campaigns: PaidAdCampaign[];
  daily: Array<{ date: string; spendPence: number; linkClicks: number }>;
  knownSources: string[];
}

const NOTE = "Our clicks count mileclear.com/app?from=NAME links. Point each boosted post at its own link and pick it here.";

function money(pence: number | null, currency: string): string {
  if (pence == null) return "-";
  if (currency === "GBP") return formatPence(pence);
  return `${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function dateRange(start: string | null, stop: string | null): string {
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
  if (!start) return "-";
  return stop ? `${fmt(start)} to ${fmt(stop)}` : `From ${fmt(start)}`;
}

function statusLabel(s: string | null): string {
  if (!s) return "-";
  return s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
}

function ChannelCell({ row, sources, onSaved }: { row: PaidAdCampaign; sources: string[]; onSaved: () => void }) {
  const [value, setValue] = useState(row.fromSource ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = [...new Set([...(row.fromSource ? [row.fromSource] : []), ...sources])];

  async function change(next: string) {
    const before = value;
    setValue(next);
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/paid-ads/campaigns/${encodeURIComponent(row.id)}/channel`, { fromSource: next || null });
      onSaved();
    } catch (e) {
      setValue(before);
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--adm-s2)" }}>
      <label htmlFor={`paid-ads-channel-${row.id}`} className="adm-sr">Link for {row.name}</label>
      <select
        id={`paid-ads-channel-${row.id}`}
        className="adm-ctl-select"
        value={value}
        disabled={busy}
        onChange={(e) => void change(e.target.value)}
        onClick={(e) => e.stopPropagation()}
      >
        <option value="">Not set</option>
        {options.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      {busy && <Spinner label="Saving" />}
      {error && <span role="alert" style={{ color: "var(--adm-bad, #ef4444)", fontSize: "0.75rem" }}>{error}</span>}
    </span>
  );
}

export function PaidAdsPanel() {
  const { data, error, loading, reload } = useAdminData<PaidAds>("/admin/paid-ads");
  const [refreshing, setRefreshing] = useState(false);
  const [result, setResult] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  async function refresh() {
    setRefreshing(true);
    setResult(null);
    try {
      const r = await api.post<{ data: { campaigns: number; dailyRows: number } }>("/admin/paid-ads/refresh");
      setResult({ tone: "good", text: `Updated ${formatNumber(r.data.campaigns)} campaigns from Meta.` });
      reload();
    } catch (e) {
      setResult({ tone: "bad", text: e instanceof Error ? e.message : "Couldn't refresh from Meta." });
    } finally {
      setRefreshing(false);
    }
  }

  const actions =
    data?.configured ? (
      <>
        <span className="adm-note" style={{ margin: 0 }}>
          {data.lastSyncedAt ? <>Synced <Ago iso={data.lastSyncedAt} /></> : "Not synced yet"}
        </span>
        <button type="button" className="adm-btn adm-btn--sm" onClick={() => void refresh()} disabled={refreshing}>
          {refreshing ? <Spinner /> : null} Refresh from Meta
        </button>
      </>
    ) : null;

  return (
    <Panel
      title="Paid ads"
      subtitle="What Meta says each boosted post did, beside the clicks and sign-ups we see ourselves."
      actions={actions}
    >
      <LoadState
        data={data}
        loading={loading}
        error={error}
        onRetry={reload}
        errorTitle="Couldn't load the paid ads figures."
        skeleton={<LoadingSkeleton variant="chart" height={200} />}
      >
        {(d) => {
          if (!d.configured && d.campaigns.length === 0) {
            return <Notice title="Not connected to Meta yet.">Set META_ADS_TOKEN and META_AD_ACCOUNT_ID on the API server.</Notice>;
          }
          const cur = d.currency;
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s4)" }}>
              {!d.configured && <Notice tone="warn" title="Not connected to Meta yet.">These are the last figures we synced.</Notice>}
              {result && <Notice tone={result.tone}>{result.text}</Notice>}
              <Grid min={160} gap="sm">
                <KpiCard label="Spend" value={money(d.totals.spendPence, cur)} tone="accent" hint={d.accountName ?? undefined} />
                <KpiCard label="Meta link clicks" value={d.totals.metaLinkClicks} />
                <KpiCard label="Our link clicks" value={d.totals.ourClicks} hint="Only campaigns with a link picked" />
                <KpiCard label="Sign-ups who said Facebook" value={d.totals.facebookSignups} tone="good" hint="Joined while a campaign ran" />
                <KpiCard label="Cost per sign-up" value={money(d.totals.costPerFacebookSignupPence, cur)} hint="Spend per Facebook sign-up" />
              </Grid>
              <DataTable
                caption="Meta campaigns with our clicks and sign-ups"
                rows={d.campaigns}
                rowKey={(r) => r.id}
                emptyTitle="No campaigns from Meta yet."
                columns={[
                  {
                    key: "name",
                    header: "Campaign",
                    sortValue: (r) => r.name,
                    render: (r) => (
                      <span>
                        {r.name}
                        <br />
                        <span style={{ color: "var(--adm-text-2)", fontSize: "0.75rem" }}>
                          {statusLabel(r.status)} · {dateRange(r.startTime, r.stopTime)}
                        </span>
                      </span>
                    ),
                  },
                  { key: "spend", header: "Spend", numeric: true, sortValue: (r) => r.spendPence, render: (r) => money(r.spendPence, r.currency) },
                  { key: "reach", header: "Reach", numeric: true, sortValue: (r) => r.reach, render: (r) => formatNumber(r.reach), hideOnMobile: true },
                  { key: "impressions", header: "Impressions", numeric: true, sortValue: (r) => r.impressions, render: (r) => formatNumber(r.impressions), hideOnMobile: true },
                  { key: "metaClicks", header: "Meta clicks", numeric: true, sortValue: (r) => r.metaLinkClicks, render: (r) => formatNumber(r.metaLinkClicks), title: "Link clicks Meta counted" },
                  {
                    key: "costMetaClick",
                    header: "Per Meta click",
                    numeric: true,
                    sortValue: (r) => r.costPerMetaClickPence,
                    render: (r) => money(r.costPerMetaClickPence, r.currency),
                    hideOnMobile: true,
                  },
                  {
                    key: "channel",
                    header: "Link",
                    title: "Which mileclear.com/app?from= link this post points at",
                    sortValue: (r) => r.fromSource ?? "",
                    render: (r) => <ChannelCell key={`${r.id}-${r.fromSource ?? ""}`} row={r} sources={d.knownSources} onSaved={reload} />,
                  },
                  { key: "ourClicks", header: "Our clicks", numeric: true, sortValue: (r) => r.ourClicks, render: (r) => (r.fromSource ? formatNumber(r.ourClicks) : "-") },
                  {
                    key: "costOurClick",
                    header: "Per our click",
                    numeric: true,
                    sortValue: (r) => r.costPerOurClickPence,
                    render: (r) => money(r.costPerOurClickPence, r.currency),
                    hideOnMobile: true,
                  },
                  {
                    key: "fb",
                    header: "Said Facebook",
                    numeric: true,
                    title: "Drivers who joined while this ran and answered Facebook to How did you hear about MileClear",
                    sortValue: (r) => r.facebookSignups,
                    render: (r) => formatNumber(r.facebookSignups),
                  },
                  { key: "ig", header: "Said Instagram", numeric: true, sortValue: (r) => r.instagramSignups, render: (r) => formatNumber(r.instagramSignups), hideOnMobile: true },
                  { key: "all", header: "All sign-ups", numeric: true, title: "Everyone who joined while this ran", sortValue: (r) => r.allSignups, render: (r) => formatNumber(r.allSignups), hideOnMobile: true },
                  {
                    key: "costSignup",
                    header: "Per sign-up",
                    numeric: true,
                    title: "Spend per driver who said Facebook",
                    sortValue: (r) => r.costPerFacebookSignupPence,
                    render: (r) => money(r.costPerFacebookSignupPence, r.currency),
                  },
                ]}
              />
              <p className="adm-note" style={{ margin: 0 }}>{NOTE}</p>
            </div>
          );
        }}
      </LoadState>
    </Panel>
  );
}
