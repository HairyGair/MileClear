"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { SavedLocation } from "@mileclear/shared";
import { api } from "@/lib/api";
import {
  Button,
  Card,
  DateRangeField,
  Dialog,
  EmptyState,
  ErrorState,
  FilterChips,
  Icon,
  Menu,
  PageHeader,
  Segmented,
  Skeleton,
  useData,
  useMe,
  useToast,
  useUnclassifiedCount,
} from "@/components/dashboard/kit";
import { formatDay, formatMiles } from "@/lib/dashboard";
import { TripRow } from "@/components/dashboard/trips/TripRow";
import { TripsReviewStrip } from "@/components/dashboard/trips/TripsReviewStrip";
import { ReportMissingDialog } from "@/components/dashboard/trips/ReportMissingDialog";
import { InboxView } from "@/components/dashboard/trips/InboxView";
import { dayKeyToDate, groupByDay } from "@/components/dashboard/trips/lib/days";
import {
  EMPTY_FILTERS,
  PAGE_SIZE,
  activeFilterCount,
  filterQuery,
  pageUrlParams,
  parseFilters,
  parseView,
  rangeLabel,
  type TripFilters,
  type TripsView,
} from "@/components/dashboard/trips/lib/filters";
import { odometerLineFor, type OdometerDayRow } from "@/components/dashboard/trips/lib/odometerLine";
import { PLATFORM_OPTIONS, errorText, platformLabel } from "@/components/dashboard/trips/lib/labels";
import type { MissedProposal, PagedTrips, TripItem } from "@/components/dashboard/trips/lib/types";
import "@/components/dashboard/trips/trips.css";

interface Summary {
  totalTrips: number;
  totalMiles: number;
  businessTrips: number;
  businessMiles: number;
  personalTrips: number;
  personalMiles: number;
}

const MAX_RESTORED_PAGES = 10;
const NO_PARAMS = new URLSearchParams();

export default function TripsPage() {
  return (
    <Suspense fallback={<Skeleton variant="row" count={6} />}>
      <TripsInner />
    </Suspense>
  );
}

function TripsInner() {
  const router = useRouter();
  const sp = useSearchParams() ?? NO_PARAMS;
  const toast = useToast();
  const me = useMe();
  const unclassified = useUnclassifiedCount();

  const view = parseView(sp.get("view"));
  const filters = useMemo(() => parseFilters((k) => sp.get(k)), [sp]);
  const wantedPages = useRef(Math.min(Math.max(parseInt(sp.get("page") ?? "1", 10) || 1, 1), MAX_RESTORED_PAGES));

  const [items, setItems] = useState<TripItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [moreBusy, setMoreBusy] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const showFilterBits = view !== "inbox";
  const fcount = activeFilterCount(filters);
  const queryKey = `${view}|${filters.platform}|${filters.from}|${filters.to}`;

  // Saved places name the ends of each trip.
  const placesData = useData<SavedLocation[]>("trips:places", () =>
    api.get<{ data: SavedLocation[] }>("/saved-locations").then((r) => r.data ?? [])
  );
  const places = useMemo(
    () =>
      (placesData.data ?? []).map((p) => ({ name: p.name, lat: p.latitude, lng: p.longitude, radiusMeters: p.radiusMeters })),
    [placesData.data]
  );

  const missed = useData<MissedProposal[]>("trips:missed", () =>
    api.get<{ proposals?: MissedProposal[] }>("/trips/missed-journeys").then((r) => r.proposals ?? [])
  );
  const journeys = missed.data ?? [];

  // First page(s) of the list. Runs again when the segment or a filter changes.
  useEffect(() => {
    if (view === "inbox") return;
    let cancelled = false;
    const n = wantedPages.current;
    wantedPages.current = 1;
    setStatus("loading");
    const q = filterQuery(view, filters);
    q.set("page", "1");
    q.set("pageSize", String(PAGE_SIZE * n));
    api
      .get<PagedTrips>(`/trips?${q.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setItems(res.data);
        setTotal(res.total);
        setPages(n);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
    // filters is derived from the URL; queryKey covers it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, nonce]);

  function go(nextView: TripsView, nextFilters: TripFilters, nextPages = 1, mode: "push" | "replace" = "push") {
    const url = `/dashboard/trips${pageUrlParams(nextView, nextFilters, nextPages)}`;
    if (mode === "push") router.push(url);
    else router.replace(url, { scroll: false });
  }

  async function loadMore() {
    setMoreBusy(true);
    try {
      const q = filterQuery(view, filters);
      q.set("page", String(pages + 1));
      q.set("pageSize", String(PAGE_SIZE));
      const res = await api.get<PagedTrips>(`/trips?${q.toString()}`);
      setItems((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...res.data.filter((t) => !seen.has(t.id))];
      });
      setTotal(res.total);
      setPages(pages + 1);
      go(view, filters, pages + 1, "replace");
    } catch (e) {
      toast.show(errorText(e, "Couldn't load more trips. Try again."), "error");
    } finally {
      setMoreBusy(false);
    }
  }

  // Summary only while a filter is on.
  const summary = useData<Summary | null>(
    fcount > 0 && showFilterBits ? `trips:summary:${queryKey}` : null,
    () => {
      const q = filterQuery(view, filters);
      return api.get<{ data: Summary }>(`/trips/summary?${q.toString()}`).then((r) => r.data);
    }
  );

  // Odometer day lines: one request for the dates on screen. Failure is silent.
  const range = useMemo(() => {
    if (items.length === 0) return null;
    const days = groupByDay(items).map((g) => g.key).filter(Boolean);
    if (days.length === 0) return null;
    const to = days[0];
    let from = days[days.length - 1];
    const maxSpan = 365 * 86_400_000;
    if (dayKeyToDate(to).getTime() - dayKeyToDate(from).getTime() > maxSpan) {
      const d = new Date(dayKeyToDate(to).getTime() - maxSpan);
      from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    return { from, to };
  }, [items]);
  const odo = useData<OdometerDayRow[]>(range ? `odo:${range.from}:${range.to}` : null, () =>
    api
      .get<{ data: OdometerDayRow[] }>(`/odometer/days?from=${range!.from}&to=${range!.to}`)
      .then((r) => r.data ?? [])
      .catch(() => [])
  );

  const groups = useMemo(() => groupByDay(items), [items]);

  // Row actions
  const undoAuto = useCallback(
    async (t: TripItem) => {
      setBusyId(t.id);
      try {
        await api.post(`/trips/${t.id}/undo-classification`);
        toast.show("Back in your Inbox");
        unclassified.refresh();
        setNonce((n) => n + 1);
      } catch (e) {
        toast.show(errorText(e, "Couldn't undo that. Try again."), "error");
      } finally {
        setBusyId(null);
      }
    },
    [toast, unclassified]
  );
  const mergeDuplicate = useCallback(
    async (t: TripItem, other: TripItem) => {
      setBusyId(t.id);
      try {
        await api.post("/trips/merge", {
          tripIds: [t.id, other.id],
          classification: t.classification,
          platformTag: t.platformTag ?? null,
        });
        toast.show("Trips merged");
        unclassified.refresh();
        setNonce((n) => n + 1);
      } catch (e) {
        toast.show(errorText(e, "Couldn't merge the trips. Try again."), "error");
      } finally {
        setBusyId(null);
      }
    },
    [toast, unclassified]
  );
  const keepBoth = useCallback(
    async (t: TripItem) => {
      setBusyId(t.id);
      try {
        await api.patch(`/trips/${t.id}`, { possibleDuplicateOfId: null });
        setItems((prev) => prev.map((x) => (x.id === t.id ? { ...x, possibleDuplicateOfId: null } : x)));
      } catch (e) {
        toast.show(errorText(e), "error");
      } finally {
        setBusyId(null);
      }
    },
    [toast]
  );

  const journeyCount = journeys.length;
  const inboxCount = unclassified.count + journeyCount;
  const emptyAll = view === "all" && fcount === 0 && status === "ready" && items.length === 0;
  const showPlatform = me.mode !== "personal" && !me.isCompanyDriver;

  const segments = [
    { value: "all" as const, label: "All" },
    { value: "inbox" as const, label: "Inbox", count: inboxCount },
    { value: "business" as const, label: "Business" },
    { value: "personal" as const, label: "Personal" },
  ];

  return (
    <>
      <PageHeader
        title="Trips"
        primary={
          emptyAll ? undefined : (
            <Button variant="primary" href="/dashboard/trips/new">
              Add a trip
            </Button>
          )
        }
      />

      <TripsReviewStrip
        unclassified={unclassified.count}
        journeys={journeyCount}
        ready={!missed.loading}
        onReport={() => setReportOpen(true)}
      />

      <div className="mc-tripsbar">
        <Segmented ariaLabel="Show trips" options={segments} value={view} onChange={(v) => go(v, v === "inbox" ? EMPTY_FILTERS : filters)} />
        <div className="mc-tripsbar__tools">
          {showFilterBits && (
            <Button variant="secondary" size="sm" icon="filter-outline" onClick={() => setFiltersOpen(true)}>
              {fcount > 0 ? `Filters (${fcount})` : "Filters"}
            </Button>
          )}
          <Menu
            ariaLabel="More"
            triggerClassName="mc-btn mc-btn--secondary mc-btn--sm"
            trigger={
              <>
                <Icon name="ellipsis-horizontal" size={16} /> More
              </>
            }
            items={[
              { label: "Miles by project", href: "/dashboard/trips/projects" },
              { label: "Import trips from CSV", href: "/dashboard/trips/import" },
              { label: "Download trips", href: "/dashboard/tax/exports" },
            ]}
          />
        </div>
      </div>

      {showFilterBits && fcount > 0 && (
        <div className="mc-activechips">
          {filters.platform && (
            <button
              type="button"
              className="mc-activechip"
              aria-label={`Remove filter ${platformLabel(filters.platform)}`}
              onClick={() => go(view, { ...filters, platform: "" })}
            >
              {platformLabel(filters.platform) || filters.platform} <Icon name="close" size={14} />
            </button>
          )}
          {(filters.from || filters.to) && (
            <button
              type="button"
              className="mc-activechip"
              aria-label={`Remove filter ${rangeLabel(filters)}`}
              onClick={() => go(view, { ...filters, from: "", to: "" })}
            >
              {rangeLabel(filters)} <Icon name="close" size={14} />
            </button>
          )}
        </div>
      )}

      {showFilterBits && fcount > 0 && summary.data && (
        <Card className="mc-tripsummary" data-testid="trip-summary">
          <div>
            <p className="mc-tripsummary__label">Trips</p>
            <p className="mc-tripsummary__value mc-num">{summary.data.totalTrips.toLocaleString("en-GB")}</p>
          </div>
          <div>
            <p className="mc-tripsummary__label">Miles</p>
            <p className="mc-tripsummary__value mc-num">{formatMiles(summary.data.totalMiles)}</p>
          </div>
          <div>
            <p className="mc-tripsummary__label">Business miles</p>
            <p className="mc-tripsummary__value mc-num">{formatMiles(summary.data.businessMiles)}</p>
          </div>
        </Card>
      )}

      {view === "inbox" ? (
        <InboxView
          places={places}
          journeys={journeys}
          journeysLoading={missed.loading}
          journeysError={!!missed.error}
          onReloadJourneys={missed.reload}
          onSorted={unclassified.refresh}
        />
      ) : status === "loading" ? (
        <Skeleton variant="row" count={6} />
      ) : status === "error" ? (
        <ErrorState title="Couldn't load your trips" onRetry={() => setNonce((n) => n + 1)} />
      ) : items.length === 0 ? (
        emptyAll ? (
          <EmptyState
            icon="car-outline"
            title="No trips yet"
            body="Trips record by themselves on your phone. You can also add one you made."
            action={{ label: "Add a trip", href: "/dashboard/trips/new" }}
          />
        ) : (
          <EmptyState
            size="card"
            icon="search-outline"
            title="No trips match"
            body="Try other dates or clear the filters."
            action={{ label: "Clear filters", onClick: () => go("all", EMPTY_FILTERS) }}
          />
        )
      ) : (
        <>
          {groups.map((g) => {
            const line = odometerLineFor(g.key, g.items, odo.data ?? []);
            return (
              <section key={g.key} className="mc-day" aria-label={formatDay(dayKeyToDate(g.key))}>
                <div className="mc-day__head">
                  <h2 className="mc-day__title">{formatDay(dayKeyToDate(g.key))}</h2>
                  <span className="mc-day__miles mc-num">{formatMiles(g.miles)}</span>
                </div>
                {line && (
                  <Link
                    href={`/dashboard/odometer?date=${line.date}&vehicleId=${line.vehicleId}`}
                    className="mc-day__odo"
                    aria-label={line.label}
                  >
                    {line.text}
                  </Link>
                )}
                <Card padded={false}>
                  <ul className="mc-day__list">
                    {g.items.map((t) => {
                      const idx = items.findIndex((x) => x.id === t.id);
                      const otherIdx = t.possibleDuplicateOfId ? items.findIndex((x) => x.id === t.possibleDuplicateOfId) : -1;
                      return (
                        <TripRow
                          key={t.id}
                          trip={t}
                          places={places}
                          showPlatform={showPlatform}
                          duplicateOther={otherIdx >= 0 ? items[otherIdx] : null}
                          duplicateBelow={otherIdx > idx}
                          busy={busyId === t.id}
                          onUndoAuto={undoAuto}
                          onMerge={mergeDuplicate}
                          onKeepBoth={keepBoth}
                        />
                      );
                    })}
                  </ul>
                </Card>
              </section>
            );
          })}
          {items.length < total && (
            <div style={{ textAlign: "center" }}>
              <Button variant="secondary" loading={moreBusy} onClick={loadMore}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}

      <FiltersDialog
        open={filtersOpen}
        initial={filters}
        showPlatform={!me.isCompanyDriver}
        onClose={() => setFiltersOpen(false)}
        onApply={(f) => {
          setFiltersOpen(false);
          go(view, f);
        }}
      />
      <ReportMissingDialog open={reportOpen} onClose={() => setReportOpen(false)} savedPlaces={placesData.data ?? []} />
    </>
  );
}

function FiltersDialog({
  open,
  initial,
  showPlatform,
  onClose,
  onApply,
}: {
  open: boolean;
  initial: TripFilters;
  showPlatform: boolean;
  onClose: () => void;
  onApply: (f: TripFilters) => void;
}) {
  const [draft, setDraft] = useState<TripFilters>(initial);
  useEffect(() => {
    if (open) setDraft(initial);
  }, [open, initial]);

  return (
    <Dialog
      open={open}
      title="Filters"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={() => setDraft(EMPTY_FILTERS)}>
            Clear
          </Button>
          <Button variant="primary" onClick={() => onApply(draft)}>
            Show trips
          </Button>
        </>
      }
    >
      <div className="mc-filterpanel">
        {showPlatform && (
          <div>
            <p className="mc-filterpanel__label">Platform</p>
            <FilterChips
              single
              ariaLabel="Platform"
              options={PLATFORM_OPTIONS}
              value={draft.platform ? [draft.platform] : []}
              onChange={(v) => setDraft((d) => ({ ...d, platform: v[0] ?? "" }))}
            />
          </div>
        )}
        <div>
          <p className="mc-filterpanel__label">Date</p>
          <DateRangeField from={draft.from} to={draft.to} onChange={(r) => setDraft((d) => ({ ...d, ...r }))} />
        </div>
      </div>
    </Dialog>
  );
}
