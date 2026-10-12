"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getHmrcRatesForTaxYear, practicePeriods, ukDateKey, type PracticePeriodKey } from "@mileclear/shared";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  Menu,
  SelectField,
  Segmented,
  Skeleton,
  StatTile,
  StatusChip,
  UnderlineTabs,
  useToast,
} from "../../../../../components/dashboard/kit";
import { Banner, usePractice } from "../../../../../components/practice/PracticeShell";
import { RequestStatusChip, UpdateChip } from "../../../../../components/practice/chips";
import { RequestDialog } from "../../../../../components/practice/RequestDialog";
import {
  PracticeError,
  dayMonth,
  downloadAuthed,
  errorText,
  firstNameOf,
  milesText,
  papi,
  poundsText,
  timeOfDay,
  vehicleWord,
  workWord,
  type ClientOverview,
  type PracticeRequestRow,
  type TripRow,
} from "../../../../../lib/practice";
import type { PracticeRequestType } from "@mileclear/shared";

type Tab = "overview" | "trips" | "earnings" | "expenses" | "requests" | "details";
const TABS: Tab[] = ["overview", "trips", "earnings", "expenses", "requests", "details"];

interface Blocked {
  code: string | null;
  message: string;
  clientName: string | null;
  endedAt: string | null;
}

function readTab(): Tab {
  if (typeof window === "undefined") return "overview";
  const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
  return t && TABS.includes(t) ? t : "overview";
}

function rateNote(taxYear: string, workType: string): string {
  if (workType === "employee") return `Mileage claim for ${taxYear}`;
  const p = getHmrcRatesForTaxYear(taxYear).car.first10000;
  return `At ${p}p a mile (${taxYear}), 25p after 10,000`;
}

export default function ClientPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const toast = useToast();
  const { me } = usePractice();
  const periods = useMemo(() => practicePeriods(ukDateKey(new Date())), []);
  const [periodKey, setPeriodKey] = useState<PracticePeriodKey>("due");
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<ClientOverview | null>(null);
  const [blocked, setBlocked] = useState<Blocked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestType, setRequestType] = useState<PracticeRequestType>("sort_trips");
  const [exporting, setExporting] = useState(false);
  const [askBusy, setAskBusy] = useState(false);

  useEffect(() => {
    setTab(readTab());
    const p = new URLSearchParams(window.location.search).get("period") as PracticePeriodKey | null;
    if (p && periods.some((x) => x.key === p)) setPeriodKey(p);
  }, [periods]);

  const load = useCallback(() => {
    setError(null);
    papi
      .get<ClientOverview>(`/practice/clients/${id}?period=${periodKey}`)
      .then((d) => {
        setData(d);
        setBlocked(null);
      })
      .catch((e: unknown) => {
        if (e instanceof PracticeError && (e.status === 403 || e.status === 404)) {
          setBlocked({
            code: e.code,
            message: e.message,
            clientName: typeof e.body.clientName === "string" ? e.body.clientName : null,
            endedAt: typeof e.body.endedAt === "string" ? e.body.endedAt : null,
          });
          return;
        }
        setError(errorText(e, "Couldn't load this client."));
      });
  }, [id, periodKey]);

  useEffect(() => {
    load();
  }, [load]);

  function changeTab(t: Tab) {
    setTab(t);
    const url = new URL(window.location.href);
    if (t === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url.toString());
  }

  async function exportFile(format: "csv" | "pdf" | "summary") {
    setExporting(true);
    try {
      await downloadAuthed(`/practice/clients/${id}/export?format=${format}&period=${periodKey}`, {}, "mileclear-export");
      toast.show("Downloaded.");
    } catch (e) {
      toast.show(errorText(e, "Couldn't download. Try again."), "error");
    } finally {
      setExporting(false);
    }
  }

  const back = (
    <Link href="/practice" className="pc-back">
      <Icon name="chevron-back" size={18} />
      Clients
    </Link>
  );

  if (blocked) {
    const name = blocked.clientName ?? "This client";
    const first = firstNameOf(name);
    let title = blocked.message;
    let body: string | undefined;
    let action: { label: string; onClick: () => void } | undefined;
    if (blocked.code === "stopped") {
      title = `${name} stopped sharing with you${blocked.endedAt ? ` on ${dayMonth(blocked.endedAt)}` : ""}.`;
      body = "Records you downloaded before then are yours to keep under your own obligations. MileClear won't show anything new.";
    } else if (blocked.code === "ended") {
      title = `Sharing ended${blocked.endedAt ? ` on ${dayMonth(blocked.endedAt, true)}` : ""}.`;
      body = `${first} was asked to keep sharing and didn't answer.`;
    } else if (blocked.code === "account_closed") {
      title = "This client's account was closed.";
    } else if (blocked.code === "not_answered") {
      title = "Your client hasn't said yes yet.";
      body = "You'll see their records here once they share with you in the app.";
    } else if (blocked.code === "waiting_for_practice") {
      title = "Accept this client first.";
      body = "They asked to share with you. Accept them from your client list.";
    }
    return (
      <>
        {back}
        <Card>
          <EmptyState icon="close-circle-outline" title={title} body={body} action={action ?? { label: "Back to clients", href: "/practice" }} />
          {blocked.code === "ended" && (
            <div style={{ display: "flex", justifyContent: "center", paddingBottom: 24 }}>
              <Button
                variant="primary"
                loading={askBusy}
                onClick={async () => {
                  setAskBusy(true);
                  try {
                    const list = await papi.get<{ ended: { linkId: string; clientId: string | null }[] }>("/practice/clients");
                    const row = list.ended.find((r) => r.clientId === id);
                    if (!row) throw new Error("Couldn't find this client. Try from your client list.");
                    await papi.post(`/practice/links/${row.linkId}/ask-again`);
                    toast.show(`Asked ${first} again.`);
                  } catch (e) {
                    toast.show(errorText(e), "error");
                  } finally {
                    setAskBusy(false);
                  }
                }}
              >
                Ask again
              </Button>
            </div>
          )}
        </Card>
      </>
    );
  }

  if (!data) {
    return (
      <>
        {back}
        {error ? <ErrorState title="Couldn't load this client" onRetry={load} /> : <Skeleton variant="figure" count={5} />}
      </>
    );
  }

  const { client, link, figures } = data;
  const first = firstNameOf(client.name);
  const target = {
    clientId: client.id,
    name: client.name,
    toSort: figures.toSort,
    earningsShared: figures.earningsShared,
    expensesShared: figures.expensesShared,
  };
  const nextQuarter = data.quarters.find((q) => q.due >= ukDateKey(new Date()));

  return (
    <>
      {back}
      <div className="pc-head">
        <div>
          <h1 className="pc-head__title">{client.name}</h1>
          <p className="pc-head__line">
            {workWord(client.workType)} · {vehicleWord(client.vehicleType)}
            {link.startedAt ? ` · Shared since ${dayMonth(link.startedAt, true)}` : ""}
            {link.endsAt ? `, until ${dayMonth(link.endsAt, true)}` : ""}
          </p>
          <div className="pc-chiprow">
            <StatusChip tone="neutral" icon="lock-closed-outline" label="Business records only" />
            {link.sharePersonalTrips ? (
              <StatusChip tone="neutral" label="Personal trips shared" />
            ) : (
              <StatusChip tone="outline" label="Personal trips not shared" />
            )}
          </div>
        </div>
        <div className="pc-head__actions">
          <div className="pc-period">
            <SelectField
              label="Period"
              value={periodKey}
              onChange={(v) => setPeriodKey(v as PracticePeriodKey)}
              options={periods.map((p) => ({ value: p.key, label: `${p.label} (${p.range})` }))}
            />
          </div>
          <Menu
            ariaLabel="Export"
            triggerClassName="mc-btn mc-btn--secondary mc-btn--md"
            trigger={
              <>
                <Icon name="download-outline" size={18} />
                <span>{exporting ? "Preparing..." : "Export"}</span>
                <Icon name="chevron-down" size={14} />
              </>
            }
            items={[
              { label: "Trips CSV", onClick: () => void exportFile("csv") },
              { label: "Trips PDF", onClick: () => void exportFile("pdf") },
              { label: "Tax year summary PDF", onClick: () => void exportFile("summary") },
            ]}
          />
          <Button
            variant="primary"
            icon="paper-plane-outline"
            onClick={() => {
              setRequestType(figures.toSort > 0 ? "sort_trips" : "check_details");
              setRequestOpen(true);
            }}
          >
            Send a request
          </Button>
        </div>
      </div>

      {link.renewalAskedAt && link.endsAt && (
        <div className="pc-strips">
          <Banner icon="time-outline">
            Sharing ends {dayMonth(link.endsAt)}. {first} has been asked to keep sharing.
          </Banner>
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <UnderlineTabs<Tab>
          ariaLabel="Client"
          value={tab}
          onChange={changeTab}
          options={[
            { value: "overview", label: "Overview" },
            { value: "trips", label: "Trips" },
            { value: "earnings", label: "Earnings" },
            { value: "expenses", label: "Expenses" },
            { value: "requests", label: "Requests", count: data.requests.filter((r) => r.status === "open").length },
            { value: "details", label: "Details" },
          ]}
        />
      </div>

      {tab === "overview" && (
        <div className="mc-split">
          <div className="mc-stack">
            <div className="pc-tiles">
              <StatTile label="Business miles" value={milesText(figures.businessMiles)} unit="mi" note={`${figures.businessTrips} business trips`} />
              <StatTile label="Mileage claim" value={poundsText(figures.claimPence)} note={rateNote(data.period.taxYear, client.workType)} />
              <StatTile
                label="Earnings"
                value={figures.earningsShared ? poundsText(figures.earningsPence ?? 0) : null}
                note={figures.earningsShared ? `${figures.earningsCount ?? 0} logged` : client.workType === "employee" ? "Not needed" : "Not shared"}
              />
              <StatTile
                label="Expenses"
                value={figures.expensesShared ? poundsText(figures.expensesPence ?? 0) : null}
                note={figures.expensesShared ? `${figures.expensesCount ?? 0} logged` : "Not shared"}
              />
              <StatTile
                label="To sort"
                value={String(figures.toSort)}
                unit="trips"
                note={figures.toSortFrom ? `Whole tax year · ${dayMonth(figures.toSortFrom)} to ${dayMonth(figures.toSortTo)}` : "Whole tax year"}
              />
            </div>

            <Card title="Quarterly updates" footer={`A green "Sent" means ${first} sent that update from MileClear.`}>
              <div className="pc-quarters">
                {data.quarters.map((q) => (
                  <div key={q.index} className={`pc-quarter${nextQuarter?.index === q.index ? " is-next" : ""}`}>
                    <span className="pc-quarter__q">Q{q.index}</span>
                    <span className="pc-quarter__period">
                      {dayMonth(q.start)} to {dayMonth(q.end)}
                    </span>
                    <span className="pc-quarter__due">Due {dayMonth(q.due)}</span>
                    <span>
                      <UpdateChip update={q.update} />
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Business trips" action={{ label: `See all ${figures.businessTrips}`, onClick: () => changeTab("trips") }}>
              {figures.toSort > 0 && (
                <div className="pc-unsorted">
                  <Icon name="document-text-outline" size={22} />
                  <span style={{ flex: 1 }}>
                    <strong>{figures.toSort} trips not sorted yet</strong>
                    <span className="pc-cell-sub">
                      {figures.toSortFrom ? `${dayMonth(figures.toSortFrom)} to ${dayMonth(figures.toSortTo)}. ` : ""}Addresses show once {first} sorts them.
                    </span>
                  </span>
                  <button
                    type="button"
                    className="mc-textlink"
                    onClick={() => {
                      setRequestType("sort_trips");
                      setRequestOpen(true);
                    }}
                  >
                    Ask {first}
                  </button>
                </div>
              )}
              {data.recentTrips.length === 0 ? (
                <EmptyState size="card" title={`No business trips between ${data.period.range}.`} />
              ) : (
                <TripsTable trips={data.recentTrips} />
              )}
            </Card>
          </div>

          <div className="mc-stack">
            <Card title="Things to chase">
              <div className="pc-chase">
                {data.chase.length === 0 && (
                  <div className="pc-chase__row">
                    <span className="pc-chase__icon is-ok">
                      <Icon name="checkmark" size={18} />
                    </span>
                    <span className="pc-chase__text pc-muted">Nothing to chase right now.</span>
                  </div>
                )}
                {data.chase.map((c) => (
                  <div className="pc-chase__row" key={c.kind}>
                    <span className="pc-chase__icon">
                      <Icon name={c.kind === "quiet" ? "time-outline" : c.kind === "no_earnings" ? "cash-outline" : "document-text-outline"} size={18} />
                    </span>
                    <span className="pc-chase__text">
                      {c.kind === "sort_trips" && `${c.count} trips not sorted`}
                      {c.kind === "no_earnings" && "No earnings logged this period"}
                      {c.kind === "quiet" && `No trips for ${c.days} days`}
                    </span>
                    {c.kind !== "quiet" && (
                      <button
                        type="button"
                        className="mc-textlink"
                        onClick={() => {
                          setRequestType(c.kind === "sort_trips" ? "sort_trips" : "add_earnings");
                          setRequestOpen(true);
                        }}
                      >
                        Ask
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
            <Card title="Requests" action={data.requests.length ? { label: "See all", onClick: () => changeTab("requests") } : undefined}>
              {data.requests.filter((r) => r.status === "open").length === 0 ? (
                <p className="pc-muted" style={{ fontSize: 14 }}>No open requests.</p>
              ) : (
                data.requests
                  .filter((r) => r.status === "open")
                  .slice(0, 3)
                  .map((r) => (
                    <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, fontSize: 14 }}>
                      <span style={{ flex: 1 }}>{r.title}</span>
                      <RequestStatusChip r={r} />
                      {r.dueDate && <span className="pc-muted">Due {dayMonth(r.dueDate)}</span>}
                    </div>
                  ))
              )}
            </Card>
            <AccessNote first={first} loggedAt={data.accessLoggedAt} />
          </div>
        </div>
      )}

      {tab === "trips" && <TripsTab id={id} periodKey={periodKey} first={first} />}
      {tab === "earnings" && <EarningsTab id={id} periodKey={periodKey} />}
      {tab === "expenses" && <ExpensesTab id={id} periodKey={periodKey} />}
      {tab === "requests" && <RequestsTab id={id} />}
      {tab === "details" && <DetailsTab id={id} first={first} />}

      {tab !== "overview" && <AccessNote first={first} />}

      <RequestDialog
        key={`${requestType}-${requestOpen}`}
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        targets={[target]}
        period={data.period}
        initialType={requestType}
        onSent={load}
      />
      <span className="mc-sr-only">{me.practice.name}</span>
    </>
  );
}

function AccessNote({ first, loggedAt }: { first: string; loggedAt?: string }) {
  return (
    <p className="pc-note">
      <Icon name="eye-outline" size={18} />
      <span>
        {first} can see when your practice views or downloads their records.
        {loggedAt && <> This page view was logged at {timeOfDay(loggedAt)}.</>}
      </span>
    </p>
  );
}

function TripsTable({ trips, showClass }: { trips: TripRow[]; showClass?: boolean }) {
  return (
    <div className="pc-tablewrap">
      <table className="pc-table">
        <caption className="mc-sr-only">Trips</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>From</th>
            <th>To</th>
            <th className="is-right">Miles</th>
            <th className="pc-hide-lt-1024">Platform</th>
            <th className="pc-hide-lt-1280">Vehicle</th>
            <th className="pc-hide-lt-1024">Recorded</th>
            {showClass && <th>Type</th>}
          </tr>
        </thead>
        <tbody>
          {trips.map((t) => (
            <tr key={t.id}>
              <td style={{ whiteSpace: "nowrap" }}>{dayMonth(t.startedAt, true)}</td>
              <td>{t.from ?? <span className="pc-muted">Not known</span>}</td>
              <td>{t.to ?? <span className="pc-muted">Not known</span>}</td>
              <td className="is-right mc-num">{milesText(t.miles)}</td>
              <td className="pc-hide-lt-1024">{t.platform ?? <span className="pc-muted">None</span>}</td>
              <td className="pc-hide-lt-1280 pc-muted">{t.vehicle ?? ""}</td>
              <td className="pc-hide-lt-1024 pc-muted">{t.recorded === "tracked" ? "Tracked" : "Added by hand"}</td>
              {showClass && <td>{t.classification === "personal" ? "Personal" : "Business"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function useClientData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    papi
      .get<T>(path)
      .then(setData)
      .catch((e: unknown) => setError(errorText(e, "Couldn't load this.")));
  }, [path]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, reload: load };
}

interface TripsData {
  period: { range: string };
  show: "business" | "personal" | "all";
  personalShared: boolean;
  unsorted: { count: number; from: string | null; to: string | null };
  trips: TripRow[];
  page: number;
  pageSize: number;
  total: number;
}

function TripsTab({ id, periodKey, first }: { id: string; periodKey: string; first: string }) {
  const [show, setShow] = useState<"business" | "personal" | "all">("business");
  const [page, setPage] = useState(1);
  const { data, error, reload } = useClientData<TripsData>(`/practice/clients/${id}/trips?period=${periodKey}&show=${show}&page=${page}`);
  if (error) return <ErrorState title="Couldn't load trips" onRetry={reload} size="card" />;
  if (!data) return <Skeleton variant="row" count={6} />;
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <Card padded={false}>
      <div style={{ padding: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        {data.personalShared ? (
          <>
            <Segmented
              ariaLabel="Which trips"
              value={show}
              onChange={(v) => {
                setShow(v);
                setPage(1);
              }}
              options={[
                { value: "business", label: "Business" },
                { value: "personal", label: "Personal" },
                { value: "all", label: "All" },
              ]}
            />
            <span className="pc-muted" style={{ fontSize: 14 }}>
              {first} chose to share personal trips.
            </span>
          </>
        ) : (
          <span className="pc-muted" style={{ fontSize: 14 }}>
            Business trips. {first} hasn't shared personal trips.
          </span>
        )}
      </div>
      {data.unsorted.count > 0 && (
        <div className="pc-unsorted" style={{ margin: "0 16px 12px" }}>
          <Icon name="document-text-outline" size={22} />
          <span>
            <strong>{data.unsorted.count} trips not sorted yet</strong>
            {data.unsorted.from ? `, ${dayMonth(data.unsorted.from)} to ${dayMonth(data.unsorted.to)}` : ""}. Addresses show once {first} sorts them.
          </span>
        </div>
      )}
      {data.trips.length === 0 ? (
        <EmptyState size="card" title={`No ${show === "business" ? "business " : show === "personal" ? "personal " : ""}trips between ${data.period.range}.`} />
      ) : (
        <TripsTable trips={data.trips} showClass={show === "all"} />
      )}
      {pages > 1 && (
        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end", padding: 16 }}>
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="pc-muted" style={{ fontSize: 14 }}>
            Page {page} of {pages}
          </span>
          <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </Card>
  );
}

const SOURCE: Record<string, string> = { manual: "Added by hand", csv: "CSV", open_banking: "Bank", ocr: "Receipt scan" };

interface EarningsData {
  period: { range: string };
  shared: boolean;
  earnings: { id: string; date: string; platformLabel: string; amountPence: number; source: string }[];
  byPlatform: { platform: string; label: string; totalPence: number }[];
  byMonth: { month: string; totalPence: number }[];
  totalPence: number;
}

function EarningsTab({ id, periodKey }: { id: string; periodKey: string }) {
  const { data, error, reload } = useClientData<EarningsData>(`/practice/clients/${id}/earnings?period=${periodKey}`);
  if (error) return <ErrorState title="Couldn't load earnings" onRetry={reload} size="card" />;
  if (!data) return <Skeleton variant="row" count={4} />;
  if (!data.shared) return <Card><EmptyState size="card" icon="lock-closed-outline" title="Your client doesn't share earnings." /></Card>;
  if (data.earnings.length === 0) return <Card><EmptyState size="card" title={`No earnings logged between ${data.period.range}.`} /></Card>;
  return (
    <div className="mc-split">
      <Card padded={false}>
        <table className="pc-table">
          <caption className="mc-sr-only">Earnings</caption>
          <thead>
            <tr>
              <th>Date</th>
              <th>Platform</th>
              <th className="is-right">Amount</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {data.earnings.map((e) => (
              <tr key={e.id}>
                <td>{dayMonth(e.date, true)}</td>
                <td>{e.platformLabel}</td>
                <td className="is-right mc-num">{poundsText(e.amountPence)}</td>
                <td className="pc-muted">{SOURCE[e.source] ?? e.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="mc-stack">
        <Card title={`Total ${poundsText(data.totalPence)}`}>
          {data.byPlatform.map((p) => (
            <div key={p.platform} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "6px 0" }}>
              <span>{p.label}</span>
              <span className="mc-num">{poundsText(p.totalPence)}</span>
            </div>
          ))}
        </Card>
        <Card title="By month">
          {data.byMonth.map((m) => (
            <div key={m.month} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "6px 0" }}>
              <span>{new Date(`${m.month}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</span>
              <span className="mc-num">{poundsText(m.totalPence)}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

interface ExpensesData {
  period: { range: string };
  shared: boolean;
  expenses: { id: string; date: string; label: string; amountPence: number; description: string | null; vendor: string | null; deductibleWithMileage: boolean }[];
  byCategory: { category: string; label: string; totalPence: number; deductibleWithMileage: boolean }[];
  totalPence: number;
}

function ExpensesTab({ id, periodKey }: { id: string; periodKey: string }) {
  const { data, error, reload } = useClientData<ExpensesData>(`/practice/clients/${id}/expenses?period=${periodKey}`);
  if (error) return <ErrorState title="Couldn't load expenses" onRetry={reload} size="card" />;
  if (!data) return <Skeleton variant="row" count={4} />;
  if (!data.shared) return <Card><EmptyState size="card" icon="lock-closed-outline" title="Your client doesn't share expenses." /></Card>;
  if (data.expenses.length === 0) return <Card><EmptyState size="card" title={`No expenses logged between ${data.period.range}.`} /></Card>;
  return (
    <div className="mc-split">
      <Card padded={false}>
        <table className="pc-table">
          <caption className="mc-sr-only">Expenses</caption>
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th className="pc-hide-lt-1024">Details</th>
              <th className="is-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.expenses.map((e) => (
              <tr key={e.id}>
                <td>{dayMonth(e.date, true)}</td>
                <td>
                  {e.label}
                  {!e.deductibleWithMileage && <span className="pc-cell-sub">Counted with mileage</span>}
                </td>
                <td className="pc-hide-lt-1024 pc-muted">{[e.vendor, e.description].filter(Boolean).join(", ")}</td>
                <td className="is-right mc-num">{poundsText(e.amountPence)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title={`Total ${poundsText(data.totalPence)}`} footer="Counted with mileage: these can't be claimed alongside the mileage rate.">
        {data.byCategory.map((c) => (
          <div key={c.category} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14, padding: "6px 0" }}>
            <span>
              {c.label}
              {!c.deductibleWithMileage && <span className="pc-cell-sub">Counted with mileage</span>}
            </span>
            <span className="mc-num">{poundsText(c.totalPence)}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function RequestsTab({ id }: { id: string }) {
  const toast = useToast();
  const { data, error, reload } = useClientData<PracticeRequestRow[]>(`/practice/clients/${id}/requests`);
  if (error) return <ErrorState title="Couldn't load requests" onRetry={reload} size="card" />;
  if (!data) return <Skeleton variant="row" count={3} />;
  if (data.length === 0) return <Card><EmptyState size="card" icon="paper-plane-outline" title="No requests sent yet." /></Card>;
  return (
    <Card padded={false}>
      <table className="pc-table">
        <caption className="mc-sr-only">Requests</caption>
        <thead>
          <tr>
            <th>Request</th>
            <th>Sent</th>
            <th>Due</th>
            <th>Status</th>
            <th>Reply</th>
            <th className="is-right">
              <span className="mc-sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.id}>
              <td>
                {r.title}
                {r.note && <span className="pc-cell-sub">&ldquo;{r.note}&rdquo;</span>}
              </td>
              <td className="pc-muted">{dayMonth(r.createdAt)}</td>
              <td className="pc-muted">{r.dueDate ? dayMonth(r.dueDate) : ""}</td>
              <td>
                <RequestStatusChip r={r} />
              </td>
              <td>{r.driverReply ? <>&ldquo;{r.driverReply}&rdquo;</> : <span className="pc-muted">None</span>}</td>
              <td className="is-right">
                {r.status === "open" && (
                  <button
                    type="button"
                    className="mc-textlink"
                    onClick={async () => {
                      try {
                        await papi.post(`/practice/requests/${r.id}/cancel`);
                        toast.show("Request cancelled.");
                        reload();
                      } catch (e) {
                        toast.show(errorText(e), "error");
                      }
                    }}
                  >
                    Cancel
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

interface DetailsData {
  name: string;
  email: string;
  workType: string;
  vehicles: { id: string; make: string; model: string; year: number | null; registrationPlate: string | null; vehicleType: string; isPrimary: boolean; providedByOthers: boolean }[];
  usesMtd: boolean;
  link: { startedAt: string | null; endsAt: string | null; shareEarnings: boolean; shareExpenses: boolean; sharePersonalTrips: boolean; startedBy: string };
}

function DetailsTab({ id, first }: { id: string; first: string }) {
  const { data, error, reload } = useClientData<DetailsData>(`/practice/clients/${id}/details`);
  if (error) return <ErrorState title="Couldn't load details" onRetry={reload} size="card" />;
  if (!data) return <Skeleton variant="row" count={4} />;
  const shared = ["Business trips", "Vehicles and mileage claim", data.link.shareEarnings && "Earnings", data.link.shareExpenses && "Expenses", data.link.sharePersonalTrips && "Personal trips"].filter(Boolean).join(", ");
  return (
    <div className="mc-split">
      <Card title="Details">
        <dl className="pc-kv">
          <dt>Contact email</dt>
          <dd>{data.email}</dd>
          <dt>Tax setup</dt>
          <dd>{workWord(data.workType)}</dd>
          <dt>Quarterly updates sent by</dt>
          <dd>{data.usesMtd ? first : `${first} (not using MTD in MileClear yet)`}</dd>
          <dt>Sharing since</dt>
          <dd>{data.link.startedAt ? dayMonth(data.link.startedAt, true) : ""}</dd>
          <dt>Sharing until</dt>
          <dd>{data.link.endsAt ? dayMonth(data.link.endsAt, true) : ""}</dd>
          <dt>What's shared</dt>
          <dd>{shared}</dd>
        </dl>
      </Card>
      <Card title="Vehicles">
        {data.vehicles.length === 0 ? (
          <p className="pc-muted" style={{ fontSize: 14 }}>No vehicles added.</p>
        ) : (
          data.vehicles.map((v) => (
            <div key={v.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--mc-border)", fontSize: 14 }}>
              <strong>
                {v.make} {v.model}
                {v.year ? ` (${v.year})` : ""}
              </strong>
              <span className="pc-cell-sub">
                {vehicleWord(v.vehicleType)}
                {v.registrationPlate ? ` · ${v.registrationPlate}` : ""}
                {v.isPrimary ? " · Main vehicle" : ""}
                {v.providedByOthers ? " · Provided by someone else, not claimed" : ""}
              </span>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
