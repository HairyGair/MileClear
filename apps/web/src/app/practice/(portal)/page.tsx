"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { practicePeriods, ukDateKey, type PracticePeriodKey } from "@mileclear/shared";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FilterChips,
  Icon,
  Menu,
  SelectField,
  Skeleton,
  StatusChip,
  useToast,
} from "../../../components/dashboard/kit";
import { Banner, PracticeHead, usePractice } from "../../../components/practice/PracticeShell";
import { UpdateChip, WaitingChip } from "../../../components/practice/chips";
import { RequestDialog } from "../../../components/practice/RequestDialog";
import {
  dayMonth,
  daysSince,
  downloadAuthed,
  errorText,
  lastTripText,
  milesText,
  papi,
  timeOfDay,
  vehicleWord,
  workWord,
  type ClientList,
  type ClientRow,
  type EndedRow,
  type WaitingRow,
} from "../../../lib/practice";

type Filter = "all" | "to_sort" | "quiet" | "not_sent" | "ending" | "ended";
type SortKey = "name" | "miles" | "toSort" | "update" | "lastTrip";

const FILTER_LABEL: Record<Filter, string> = {
  all: "All",
  to_sort: "Trips to sort",
  quiet: "Quiet for 14 days",
  not_sent: "Update not sent",
  ending: "Ending soon",
  ended: "Ended",
};

const EMPTY_FILTER_TEXT: Record<Filter, string> = {
  all: "No clients match your search.",
  to_sort: "No clients with trips to sort. Nice.",
  quiet: "Everyone has recorded a trip in the last 14 days.",
  not_sent: "Nobody is waiting to send this quarter's update.",
  ending: "Nobody's sharing ends in the next 30 days.",
  ended: "No ended clients.",
};

function isQuiet(c: ClientRow): boolean {
  const d = daysSince(c.lastTripAt);
  return d === null || d >= 14;
}
function notSent(c: ClientRow): boolean {
  return c.update.state === "due" || c.update.state === "overdue" || c.update.state === "not_due";
}
function endingSoon(c: ClientRow): boolean {
  return !!c.endsAt && new Date(c.endsAt).getTime() - Date.now() <= 30 * 86_400_000;
}

function updateRank(c: ClientRow): number {
  const u = c.update;
  if (u.state === "overdue") return 0;
  if (u.state === "due") return 1 + u.daysLeft / 1000;
  if (u.state === "not_due") return 2;
  if (u.state === "sent") return 3;
  return 4;
}

function readParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}
function writeParams(params: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
    else url.searchParams.delete(k);
  }
  window.history.replaceState(null, "", url.toString());
}

export default function ClientListPage() {
  const router = useRouter();
  const toast = useToast();
  const { me, reload: reloadMe } = usePractice();
  const periods = useMemo(() => practicePeriods(ukDateKey(new Date())), []);
  const [periodKey, setPeriodKey] = useState<PracticePeriodKey>("due");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "toSort", dir: "desc" });
  const [data, setData] = useState<ClientList | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showWaiting, setShowWaiting] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [claimHidden, setClaimHidden] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);
  const waitingRef = useRef<HTMLDivElement>(null);

  // URL keeps the filter and period, so a bookmark works.
  useEffect(() => {
    const f = readParam("filter") as Filter | null;
    if (f && f in FILTER_LABEL) setFilter(f);
    const p = readParam("period") as PracticePeriodKey | null;
    if (p && periods.some((x) => x.key === p)) setPeriodKey(p);
    try {
      setClaimHidden(sessionStorage.getItem("pc_claim_hidden") === "1");
    } catch {
      /* private mode */
    }
  }, [periods]);

  const load = useCallback(() => {
    setError(null);
    papi
      .get<ClientList>(`/practice/clients?period=${periodKey}`)
      .then((d) => {
        setData(d);
        setLoadedAt(new Date().toISOString());
      })
      .catch((e: unknown) => setError(errorText(e, "Couldn't load your clients.")));
  }, [periodKey]);

  useEffect(() => {
    load();
  }, [load]);

  // "/" focuses search.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "/" && t && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const clients = useMemo(() => data?.clients ?? [], [data]);
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
  }, [clients, search]);

  const counts = useMemo(
    () => ({
      all: searched.length,
      to_sort: searched.filter((c) => c.toSort > 0).length,
      quiet: searched.filter(isQuiet).length,
      not_sent: searched.filter(notSent).length,
      ending: searched.filter(endingSoon).length,
      ended: data?.ended.length ?? 0,
    }),
    [searched, data]
  );

  const rows = useMemo(() => {
    const filtered = searched.filter((c) => {
      if (filter === "to_sort") return c.toSort > 0;
      if (filter === "quiet") return isQuiet(c);
      if (filter === "not_sent") return notSent(c);
      if (filter === "ending") return endingSoon(c);
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (c: ClientRow): number | string => {
      switch (sort.key) {
        case "name":
          return c.name.toLowerCase();
        case "miles":
          return c.businessMiles;
        case "toSort":
          return c.toSort;
        case "update":
          return updateRank(c);
        case "lastTrip":
          return c.lastTripAt ? new Date(c.lastTripAt).getTime() : 0;
      }
    };
    return [...filtered].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x < y) return -1 * dir;
      if (x > y) return 1 * dir;
      return a.name.localeCompare(b.name, "en-GB");
    });
  }, [searched, filter, sort]);

  const selectedRows = clients.filter((c) => selected.has(c.clientId));
  const period = data?.period ?? periods.find((p) => p.key === periodKey) ?? periods[0];
  const quarter = data?.quarter;
  const wantsToJoin = (data?.waiting ?? []).filter((w) => w.state === "wants_to_join");
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.clientId));
  const someSelected = rows.some((r) => selected.has(r.clientId));

  function setFilterAndUrl(f: Filter) {
    setFilter(f);
    setSelected(new Set());
    writeParams({ filter: f === "all" ? null : f });
  }

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.clientId)));
  }

  function onRowKey(e: KeyboardEvent<HTMLTableRowElement>, i: number, c: ClientRow) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(0, Math.min(rows.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
      setFocusIndex(next);
      rowRefs.current[next]?.focus();
    } else if (e.key === " ") {
      e.preventDefault();
      toggle(c.clientId);
    } else if (e.key === "Enter") {
      router.push(`/practice/clients/${c.clientId}`);
    } else if (e.key === "Escape") {
      setSelected(new Set());
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setSelected(new Set(rows.map((r) => r.clientId)));
    }
  }

  function headerSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));
  }

  function Th({ k, label, right, className }: { k: SortKey; label: string; right?: boolean; className?: string }) {
    const on = sort.key === k;
    return (
      <th className={`${right ? "is-right " : ""}${className ?? ""}`} aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
        <button type="button" onClick={() => headerSort(k)}>
          {on && <Icon name={sort.dir === "asc" ? "chevron-up" : "chevron-down"} size={10} />}
          {label}
        </button>
      </th>
    );
  }

  async function act(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    try {
      await fn();
      toast.show(ok);
      load();
      reloadMe();
    } catch (e) {
      toast.show(errorText(e), "error");
    } finally {
      setBusy(null);
    }
  }

  async function exportZip(format: "csv" | "pdf" | "summary") {
    if (selectedRows.length === 0) return;
    setBusy("export");
    try {
      const { skipped } = await downloadAuthed(
        "/practice/export",
        { method: "POST", body: JSON.stringify({ clientIds: selectedRows.map((r) => r.clientId), format, period: period.key }) },
        "mileclear-clients.zip"
      );
      toast.show(skipped ? `Downloaded. ${skipped} client${skipped === 1 ? "" : "s"} skipped: not sharing now.` : "Downloaded.");
    } catch (e) {
      toast.show(errorText(e, "Couldn't download. Try again."), "error");
    } finally {
      setBusy(null);
    }
  }

  async function copyJoin() {
    try {
      await navigator.clipboard.writeText(me.practice.joinUrl);
      toast.show("Join link copied");
    } catch {
      toast.show(me.practice.joinUrl);
    }
  }

  const isEmpty = data && data.clients.length === 0 && data.waiting.length === 0 && data.ended.length === 0;
  const showClaim = me.counts.claimable > 0 && !claimHidden;
  const notSentCount = clients.filter((c) => c.update.state === "due" || c.update.state === "overdue").length;
  const daysLeft = quarter ? Math.round((Date.parse(quarter.due) - Date.parse(ukDateKey(new Date()))) / 86_400_000) : null;

  return (
    <>
      <PracticeHead
        title="Clients"
        line={data ? `${data.clients.length} sharing with you` : undefined}
        actions={
          !isEmpty && (
            <div className="pc-period">
              <SelectField
                label="Period"
                value={periodKey}
                onChange={(v) => {
                  setPeriodKey(v as PracticePeriodKey);
                  writeParams({ period: v === "due" ? null : v });
                }}
                options={periods.map((p) => ({ value: p.key, label: `${p.label} (${p.range})` }))}
              />
            </div>
          )
        }
      />

      <div className="pc-strips">
        {showClaim && (
          <Banner
            icon="people-outline"
            tone="amber"
            actions={
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setClaimHidden(true);
                    try {
                      sessionStorage.setItem("pc_claim_hidden", "1");
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  Not now
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={busy === "claim"}
                  onClick={() =>
                    void act("claim", () => papi.post("/practice/claim"), "Asked. Each driver says yes in the app first.")
                  }
                >
                  Add them
                </Button>
              </>
            }
          >
            <strong>
              {me.counts.claimable} driver{me.counts.claimable === 1 ? "" : "s"} shared their records with this email before.
            </strong>{" "}
            Add them to your practice? Each one is asked to say yes in the app first.
          </Banner>
        )}
        {wantsToJoin.length > 0 && (
          <Banner
            icon="people-outline"
            tone="amber"
            actions={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowWaiting(true);
                  setTimeout(() => waitingRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
                }}
              >
                Review
              </Button>
            }
          >
            <strong>
              {wantsToJoin.length} driver{wantsToJoin.length === 1 ? " wants" : "s want"} to share with you.
            </strong>{" "}
            Accept them to see their records.
          </Banner>
        )}
        {!me.practice.checked && (isEmpty || !quarter) ? (
          <Banner icon="information-circle-outline">
            Drivers see your practice as &ldquo;Not checked yet&rdquo; until we check it, usually within one working day.
          </Banner>
        ) : (
          quarter &&
          !isEmpty &&
          !showClaim && (
            <Banner
              icon="calendar-outline"
              actions={
                notSentCount > 0 ? (
                  <button type="button" className="mc-textlink" onClick={() => setFilterAndUrl("not_sent")}>
                    Show them
                  </button>
                ) : undefined
              }
            >
              <strong>
                Next quarterly update: {dayMonth(quarter.start)} to {dayMonth(quarter.end, true)}, due {dayMonth(quarter.due)}.
              </strong>{" "}
              {daysLeft !== null && daysLeft >= 0 ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left. ` : ""}
              {notSentCount > 0 ? `${notSentCount} client${notSentCount === 1 ? " has" : "s have"} not sent it yet.` : ""}
            </Banner>
          )
        )}
      </div>

      {error && data && (
        <div className="pc-strips">
          <Banner icon="cloud-offline-outline" actions={<Button size="sm" variant="secondary" onClick={load}>Try again</Button>}>
            Showing the list from {loadedAt ? timeOfDay(loadedAt) : "earlier"}.
          </Banner>
        </div>
      )}

      {!data && error && <ErrorState title="Couldn't load your clients" body="Check your connection and try again." onRetry={load} />}
      {!data && !error && <Skeleton variant="row" count={8} />}

      {isEmpty && (
        <Card>
          <EmptyState
            icon="people-outline"
            title="Add your first driver"
            body="Invite clients by email, paste a list, or share your join link. Nothing is shared until each driver says yes in the app."
          />
          <div style={{ display: "flex", gap: 12, justifyContent: "center", paddingBottom: 24 }}>
            <Button variant={showClaim ? "secondary" : "primary"} href="/practice/add" icon="add">
              Add clients
            </Button>
            <Button variant="secondary" icon="copy-outline" onClick={() => void copyJoin()}>
              Copy join link
            </Button>
          </div>
        </Card>
      )}

      {data && !isEmpty && (
        <>
          <div className="pc-toolbar">
            <div className="pc-search">
              <Icon name="search-outline" size={18} className="pc-search__icon" />
              <input
                ref={searchRef}
                className="mc-input"
                type="search"
                placeholder="Search clients"
                aria-label="Search clients"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <FilterChips<Filter>
              single
              ariaLabel="Filter clients"
              value={[filter]}
              onChange={(v) => setFilterAndUrl(v[0] ?? "all")}
              options={(Object.keys(FILTER_LABEL) as Filter[])
                .filter((f) => f !== "ended" || counts.ended > 0)
                .map((f) => ({ value: f, label: FILTER_LABEL[f], count: counts[f] }))}
            />
          </div>

          {someSelected && allSelected && filter !== "all" && (
            <p className="pc-muted" style={{ fontSize: 14, marginBottom: 8 }}>
              All {rows.length} clients with {FILTER_LABEL[filter].toLowerCase()} selected.{" "}
              <button type="button" className="mc-textlink" onClick={() => setSelected(new Set())}>
                Clear selection
              </button>
            </p>
          )}

          {filter === "ended" ? (
            <EndedList rows={data.ended} busy={busy} onAskAgain={(r) => void act(`ask-${r.linkId}`, () => papi.post(`/practice/links/${r.linkId}/ask-again`), `Asked ${r.name} again.`)} />
          ) : (
            <Card padded={false}>
              {rows.length === 0 ? (
                <EmptyState
                  size="card"
                  icon="checkmark-circle-outline"
                  title={EMPTY_FILTER_TEXT[filter]}
                  action={{ label: "Show all", onClick: () => { setSearch(""); setFilterAndUrl("all"); } }}
                />
              ) : (
                <div className="pc-tablewrap">
                  <table className="pc-table">
                    <caption className="mc-sr-only">
                      Clients, sorted by {sort.key === "toSort" ? "trips to sort" : sort.key}, {sort.dir === "desc" ? "highest first" : "lowest first"}. {rows.length} clients.
                    </caption>
                    <thead>
                      <tr>
                        <th className="pc-checkcell">
                          <input
                            type="checkbox"
                            className="pc-check"
                            aria-label="Select all shown"
                            checked={allSelected}
                            ref={(el) => {
                              if (el) el.indeterminate = someSelected && !allSelected;
                            }}
                            onChange={toggleAll}
                          />
                        </th>
                        <Th k="name" label="Client" />
                        <Th k="miles" label="Business mi" right className="pc-hide-lt-1024" />
                        <Th k="toSort" label="To sort" right />
                        <th className="pc-hide-lt-1024">Earnings</th>
                        <th className="pc-hide-lt-1280">Expenses</th>
                        <Th k="update" label="Quarterly update" />
                        <Th k="lastTrip" label="Last trip" />
                        <th className="pc-hide-lt-1280">Requests</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((c, i) => {
                        const on = selected.has(c.clientId);
                        const quietDays = daysSince(c.lastTripAt);
                        return (
                          <tr
                            key={c.clientId}
                            ref={(el) => {
                              rowRefs.current[i] = el;
                            }}
                            tabIndex={i === Math.min(focusIndex, rows.length - 1) ? 0 : -1}
                            className={`is-click${on ? " is-selected" : ""}`}
                            onClick={() => router.push(`/practice/clients/${c.clientId}`)}
                            onKeyDown={(e) => onRowKey(e, i, c)}
                            onFocus={() => setFocusIndex(i)}
                            aria-selected={on}
                          >
                            <td className="pc-checkcell" onClick={(e) => e.stopPropagation()}>
                              <input type="checkbox" className="pc-check" aria-label={`Select ${c.name}`} checked={on} onChange={() => toggle(c.clientId)} />
                            </td>
                            <td>
                              <span className="pc-cell-name">{c.name}</span>
                              <span className="pc-cell-sub">
                                {vehicleWord(c.vehicleType)} · {workWord(c.workType)}
                                {c.renewalAskedAt && c.endsAt ? ` · Ends ${dayMonth(c.endsAt)}` : ""}
                              </span>
                            </td>
                            <td className="is-right mc-num pc-hide-lt-1024">{milesText(c.businessMiles)}</td>
                            <td className="is-right">
                              {c.toSort > 0 ? (
                                <span className="pc-cell-big mc-num">{c.toSort}</span>
                              ) : (
                                <span className="pc-ok">
                                  <Icon name="checkmark" size={16} />
                                  None
                                </span>
                              )}
                            </td>
                            <td className="pc-hide-lt-1024">
                              {c.workType === "employee" ? (
                                <span className="pc-muted">Not needed</span>
                              ) : !c.earningsShared ? (
                                <span className="pc-muted">Not shared</span>
                              ) : c.earningsCount ? (
                                `${c.earningsCount} logged`
                              ) : (
                                <span className="pc-warn">
                                  <Icon name="alert-circle-outline" size={16} />
                                  None
                                </span>
                              )}
                            </td>
                            <td className="pc-hide-lt-1280">
                              {!c.expensesShared ? (
                                <span className="pc-muted">Not shared</span>
                              ) : c.expensesCount ? (
                                `${c.expensesCount} logged`
                              ) : (
                                <span className="pc-muted">None</span>
                              )}
                            </td>
                            <td>
                              <UpdateChip update={c.update} />
                            </td>
                            <td>
                              {quietDays === null || quietDays >= 14 ? (
                                <span
                                  className="pc-warn"
                                  title={
                                    quietDays === null
                                      ? "No trips recorded yet."
                                      : `No trips for ${quietDays} days. Their tracking may have stopped, or they may not be driving.`
                                  }
                                >
                                  <Icon name="alert-circle-outline" size={16} />
                                  {lastTripText(c.lastTripAt)}
                                </span>
                              ) : (
                                lastTripText(c.lastTripAt)
                              )}
                            </td>
                            <td className="pc-hide-lt-1280">
                              {c.openRequests > 0 ? (
                                <StatusChip tone="neutral" icon="paper-plane-outline" label={`${c.openRequests} open`} />
                              ) : (
                                <span className="pc-muted">None</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {data.waiting.length > 0 && (
            <div className="pc-group" ref={waitingRef}>
              <button type="button" className="pc-group__head" aria-expanded={showWaiting} onClick={() => setShowWaiting((s) => !s)}>
                <Icon name={showWaiting ? "chevron-down" : "chevron-forward"} size={18} />
                <span className="pc-group__title">Waiting for client</span>
                <span className="mc-count">{data.waiting.length}</span>
                <span className="pc-group__hint">Invited, not answered yet. Resend or cancel from here.</span>
              </button>
              {showWaiting && (
                <div className="pc-group__body">
                  <WaitingList
                    rows={data.waiting}
                    busy={busy}
                    onAction={(r, action) => {
                      const label = r.name || r.email || "client";
                      const msg: Record<string, string> = {
                        accept: `${label} is now in your client list.`,
                        decline: "Declined.",
                        resend: "Invite sent again.",
                        cancel: "Invite cancelled.",
                      };
                      void act(`${action}-${r.linkId}`, () => papi.post(`/practice/links/${r.linkId}/${action}`), msg[action]);
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {selectedRows.length > 0 && (
        <div className="pc-bulkbar" role="region" aria-label="Selected clients">
          <span className="pc-bulkbar__count" aria-live="polite">
            {selectedRows.length} selected
          </span>
          <Button variant="primary" icon="paper-plane-outline" onClick={() => setRequestOpen(true)}>
            Send a request
          </Button>
          <Menu
            ariaLabel="Export"
            align="left"
            triggerClassName="mc-btn mc-btn--secondary mc-btn--md"
            trigger={
              <>
                <Icon name="download-outline" size={18} />
                <span>{busy === "export" ? "Preparing..." : "Export"}</span>
              </>
            }
            items={[
              { label: "Trips CSV (one zip)", onClick: () => void exportZip("csv") },
              { label: "Trips PDF (one zip)", onClick: () => void exportZip("pdf") },
              { label: "Tax year summary PDF (one zip)", onClick: () => void exportZip("summary") },
            ]}
          />
          <Button variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      <RequestDialog
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        period={period}
        targets={selectedRows.map((c) => ({
          clientId: c.clientId,
          name: c.name,
          toSort: c.toSort,
          earningsShared: c.earningsShared,
          expensesShared: c.expensesShared,
        }))}
        onSent={() => {
          load();
          reloadMe();
        }}
      />
    </>
  );
}

function canResend(r: WaitingRow): boolean {
  if (r.state === "invite_expired") return true;
  const last = r.lastResentAt ?? r.invitedAt;
  return !last || Date.now() - new Date(last).getTime() >= 3 * 86_400_000;
}

function WaitingList({
  rows,
  busy,
  onAction,
}: {
  rows: WaitingRow[];
  busy: string | null;
  onAction: (r: WaitingRow, action: "accept" | "decline" | "resend" | "cancel") => void;
}) {
  return (
    <Card padded={false}>
      <div className="pc-tablewrap">
        <table className="pc-table">
          <caption className="mc-sr-only">Clients waiting to answer, or waiting for you</caption>
          <thead>
            <tr>
              <th>Client</th>
              <th>State</th>
              <th className="pc-hide-lt-1024">Invited</th>
              <th className="is-right">
                <span className="mc-sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.linkId}>
                <td>
                  <span className="pc-cell-name">{r.name || r.email || "Unknown"}</span>
                  {r.name && r.email && <span className="pc-cell-sub">{r.email}</span>}
                </td>
                <td>
                  <WaitingChip state={r.state} name={r.name} />
                </td>
                <td className="pc-hide-lt-1024 pc-muted">{r.invitedAt ? dayMonth(r.invitedAt, true) : ""}</td>
                <td className="is-right">
                  <span className="pc-actions">
                    {r.state === "wants_to_join" && (
                      <>
                        <Button size="sm" variant="secondary" loading={busy === `accept-${r.linkId}`} onClick={() => onAction(r, "accept")}>
                          Accept
                        </Button>
                        <Button size="sm" variant="ghost" loading={busy === `decline-${r.linkId}`} onClick={() => onAction(r, "decline")}>
                          Decline
                        </Button>
                      </>
                    )}
                    {(r.state === "invited" || r.state === "invite_expired") && (
                      <>
                        <button
                          type="button"
                          className="mc-textlink"
                          disabled={!canResend(r) || busy === `resend-${r.linkId}`}
                          title={canResend(r) ? undefined : "You can resend 3 days after the last one."}
                          onClick={() => onAction(r, "resend")}
                          style={canResend(r) ? undefined : { opacity: 0.5, cursor: "not-allowed" }}
                        >
                          Resend
                        </button>
                        {r.state !== "invite_expired" && (
                          <button type="button" className="mc-textlink" onClick={() => onAction(r, "cancel")}>
                            Cancel
                          </button>
                        )}
                      </>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function EndedList({ rows, busy, onAskAgain }: { rows: EndedRow[]; busy: string | null; onAskAgain: (r: EndedRow) => void }) {
  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState size="card" title="No ended clients." />
      </Card>
    );
  }
  return (
    <Card padded={false}>
      <table className="pc-table">
        <caption className="mc-sr-only">Clients who stopped sharing, or whose sharing ended</caption>
        <thead>
          <tr>
            <th>Client</th>
            <th>State</th>
            <th>Ended</th>
            <th className="is-right">
              <span className="mc-sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.linkId}>
              <td>
                {r.clientId ? (
                  <Link href={`/practice/clients/${r.clientId}`} className="pc-cell-name">
                    {r.name}
                  </Link>
                ) : (
                  <span className="pc-cell-name">{r.name}</span>
                )}
              </td>
              <td>
                <StatusChip tone="neutral" label={r.endedBy === "driver" || r.endedBy === "report" ? "Stopped sharing" : "Ended"} />
              </td>
              <td className="pc-muted">{r.endedAt ? dayMonth(r.endedAt, true) : ""}</td>
              <td className="is-right">
                {r.endedBy !== "driver" && r.endedBy !== "report" && r.canAskAgain && (
                  <Button size="sm" variant="secondary" loading={busy === `ask-${r.linkId}`} onClick={() => onAskAgain(r)}>
                    Ask again
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
