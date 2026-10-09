"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { Button, Card, EmptyState, ErrorState, SectionHeader, Skeleton, useData, useToast } from "../kit";
import { formatDay, formatMiles, formatTime } from "../../../lib/dashboard";
import { groupByRoute } from "./lib/routeGroups";
import { tripEndLabel, type PlaceCircle } from "./lib/placeLabel";
import { addTripHref, droppedNote, isTripStartOffer, whenLine } from "./lib/missed";
import { CLASSIFICATION_WORD, type MissedProposal, type PagedTrips, type TripItem } from "./lib/types";
import { errorText } from "./lib/labels";
import "./trips.css";

const FETCH_PAGE = 100;
const MAX_PAGES = 5;
const SHOWN_JOURNEYS = 3;

async function loadUnsorted(): Promise<TripItem[]> {
  const all: TripItem[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await api.get<PagedTrips>(`/trips?classification=unclassified&pageSize=${FETCH_PAGE}&page=${page}`);
    all.push(...res.data);
    if (page >= res.totalPages) break;
  }
  return all;
}

/**
 * The Inbox: unsorted trips grouped by route, and journeys we think were missed.
 * Sorting a group changes each trip in turn, so the driver sees the progress.
 */
export function InboxView({
  places,
  journeys,
  journeysLoading,
  journeysError,
  onReloadJourneys,
  onSorted,
}: {
  places: PlaceCircle[];
  journeys: MissedProposal[];
  journeysLoading: boolean;
  journeysError: boolean;
  onReloadJourneys: () => void;
  /** Called after trips were sorted so counts elsewhere refresh. */
  onSorted: () => void;
}) {
  const unsorted = useData<TripItem[]>("trips:inbox", loadUnsorted);
  // Groups are worked out once per load, so a group keeps its place (and its
  // open state) while its trips are sorted one by one.
  const [removed, setRemoved] = useState<string[]>([]);
  const allGroups = useMemo(() => (unsorted.data ? groupByRoute(unsorted.data) : null), [unsorted.data]);
  useEffect(() => setRemoved([]), [unsorted.data]);
  const groups = useMemo(
    () =>
      (allGroups ?? [])
        .map((g) => {
          const kept = g.trips.filter((t) => !removed.includes(t.id));
          return { ...g, trips: kept, miles: kept.reduce((s, t) => s + t.distanceMiles, 0) };
        })
        .filter((g) => g.trips.length > 0),
    [allGroups, removed]
  );
  const trips = allGroups === null ? null : groups.flatMap((g) => g.trips);

  const remove = useCallback(
    (ids: string[]) => {
      setRemoved((prev) => [...prev, ...ids]);
      onSorted();
    },
    [onSorted]
  );

  const nothing = trips !== null && trips.length === 0 && !journeysLoading && !journeysError && journeys.length === 0;

  if (unsorted.error && !trips) {
    return <ErrorState title="Couldn't load your trips" onRetry={unsorted.reload} />;
  }
  if (nothing) {
    return (
      <EmptyState
        icon="checkmark-circle-outline"
        title="All sorted"
        body="Nothing waiting. New trips land here until you mark them Business or Personal."
      />
    );
  }

  return (
    <div className="mc-inbox">
      {(trips === null || trips.length > 0) && (
        <section>
          <SectionHeader title="To classify" subtitle="Trips on the same route are grouped, so you can sort them together." />
          {trips === null ? (
            <Skeleton variant="card" count={2} height={120} />
          ) : (
            <div className="mc-stack mc-stack--tight">
              {groups.map((g) => (
                <GroupCard key={g.key} trips={g.trips} miles={g.miles} places={places} onDone={remove} />
              ))}
            </div>
          )}
        </section>
      )}

      {journeysError && !journeysLoading ? (
        <ErrorState title="Couldn't load your journeys" size="card" onRetry={onReloadJourneys} />
      ) : journeys.length > 0 ? (
        <JourneysSection journeys={journeys} onChanged={() => { onReloadJourneys(); onSorted(); }} />
      ) : null}
    </div>
  );
}

function GroupCard({
  trips,
  miles,
  places,
  onDone,
}: {
  trips: TripItem[];
  miles: number;
  places: PlaceCircle[];
  onDone: (ids: string[]) => void;
}) {
  const toast = useToast();
  const first = trips[0];
  const from = tripEndLabel(first.startAddress, first.startLat, first.startLng, places) || "Start";
  const to = tripEndLabel(first.endAddress, first.endLat, first.endLng, places) || "End";
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const sug = first.suggestion;
  const sugWord = sug && (sug.classification === "business" || sug.classification === "personal")
    ? CLASSIFICATION_WORD[sug.classification]
    : null;

  async function sortAll(c: "business" | "personal") {
    setError(null);
    const done: string[] = [];
    setProgress({ done: 0, total: trips.length });
    for (const t of trips) {
      try {
        await api.patch(`/trips/${t.id}`, { classification: c });
        done.push(t.id);
        setProgress({ done: done.length, total: trips.length });
      } catch (e) {
        setError(errorText(e));
        break;
      }
    }
    setProgress(null);
    if (done.length > 0) {
      toast.show(done.length === trips.length ? `Saved as ${CLASSIFICATION_WORD[c]}` : `Saved ${done.length} of ${trips.length}`);
      onDone(done);
    }
  }

  async function sortOne(t: TripItem, c: "business" | "personal") {
    setError(null);
    setBusyId(t.id);
    try {
      await api.patch(`/trips/${t.id}`, { classification: c });
      toast.show(`Saved as ${CLASSIFICATION_WORD[c]}`);
      onDone([t.id]);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusyId(null);
    }
  }

  const sorting = progress !== null;
  const count = `${trips.length} ${trips.length === 1 ? "trip" : "trips"}`;

  return (
    <Card padded={false} data-testid="route-group">
      <div className="mc-routegroup">
        <div className="mc-routegroup__head">
          <div>
            <h3 className="mc-routegroup__title">
              {from} <span aria-hidden="true">→</span>
              <span className="mc-sr-only"> to </span> {to}
            </h3>
            <p className="mc-routegroup__sub">
              {count}, {formatMiles(miles)}
            </p>
          </div>
          <div className="mc-routegroup__actions" role="group" aria-label={`Sort ${count} from ${from} to ${to}`}>
            <Button variant="secondary" disabled={sorting} onClick={() => sortAll("business")}>
              Business
            </Button>
            <Button variant="secondary" disabled={sorting} onClick={() => sortAll("personal")}>
              Personal
            </Button>
          </div>
        </div>
        {sugWord && <p className="mc-routegroup__hint">Last time you made this trip it was {sugWord}.</p>}
        {progress && (
          <p className="mc-routegroup__progress" role="status">
            Sorting {Math.min(progress.done + 1, progress.total)} of {progress.total}
          </p>
        )}
        {error && (
          <p className="mc-formerror" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          className="mc-textlink"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          style={{ alignSelf: "flex-start" }}
        >
          {open ? "Hide trips" : "Show trips"}
        </button>
        {open && (
          <ul className="mc-routegroup__trips" style={{ listStyle: "none", padding: 0 }}>
            {trips.map((t) => (
              <li key={t.id} className="mc-routegroup__tripline">
                <Link href={`/dashboard/trips/${t.id}`}>
                  {formatDay(t.startedAt)}, {formatTime(t.startedAt)}
                </Link>
                <span className="mc-num">{formatMiles(t.distanceMiles)}</span>
                <span className="mc-routegroup__tripactions">
                  <Button size="sm" variant="secondary" loading={busyId === t.id} disabled={sorting} onClick={() => sortOne(t, "business")}>
                    Business
                  </Button>
                  <Button size="sm" variant="secondary" disabled={sorting || busyId === t.id} onClick={() => sortOne(t, "personal")}>
                    Personal
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function JourneysSection({ journeys, onChanged }: { journeys: MissedProposal[]; onChanged: () => void }) {
  const [shown, setShown] = useState(SHOWN_JOURNEYS);
  const [hidden, setHidden] = useState<string[]>([]);
  const visible = journeys.filter((j) => !hidden.includes(j.id));
  const starts = visible.length > 0 && visible.every(isTripStartOffer);
  const title = starts ? "Trips that may have started earlier" : "Journeys to check";

  return (
    <section>
      <SectionHeader title={title} subtitle="We think these drives were not recorded. Add the ones you made." />
      <div className="mc-stack mc-stack--tight">
        {visible.slice(0, shown).map((j) => (
          <JourneyCard
            key={j.id}
            p={j}
            onGone={() => {
              setHidden((h) => [...h, j.id]);
              onChanged();
            }}
          />
        ))}
      </div>
      {visible.length > shown && (
        <p style={{ marginTop: 12 }}>
          <Button variant="link" onClick={() => setShown((n) => n + SHOWN_JOURNEYS)}>
            Show {visible.length - shown} more
          </Button>
        </p>
      )}
    </section>
  );
}

function shortAddress(addr: string | null, lat: number, lng: number): string {
  if (addr && addr.trim()) return addr.split(",")[0].trim();
  return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
}

function JourneyCard({ p, onGone }: { p: MissedProposal; onGone: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<"dismiss" | "extend" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const route = useData<{ distanceMiles: number } | null>(
    `route:${p.id}`,
    () =>
      api
        .get<{ data: { distanceMiles: number } }>(
          `/trips/route-distance?startLat=${p.fromLat}&startLng=${p.fromLng}&endLat=${p.toLat}&endLng=${p.toLng}`
        )
        .then((r) => r.data)
        .catch(() => null)
  );
  const start = isTripStartOffer(p);
  const note = droppedNote(p.source);
  const miles = route.data?.distanceMiles ?? null;
  const milesText = miles != null ? formatMiles(miles) : `About ${formatMiles(p.estimatedMiles)}`;

  async function resolve(action: "dismiss" | "extend") {
    setBusy(action);
    setError(null);
    try {
      await api.post(`/trips/missed-journeys/${p.id}/resolve`, { action });
      if (action === "extend") toast.show("Added to the next trip");
      onGone();
    } catch (e) {
      setError(errorText(e));
      setBusy(null);
    }
  }

  return (
    <Card padded={false} data-testid="missed-journey">
      <div className="mc-missed">
        <p className="mc-missed__when">{whenLine(p)}</p>
        <p className="mc-missed__route">
          {shortAddress(p.fromAddress, p.fromLat, p.fromLng)} <span aria-hidden="true">→</span>
          <span className="mc-sr-only"> to </span> {shortAddress(p.toAddress, p.toLat, p.toLng)}
          <span className="mc-num" style={{ fontWeight: 500, color: "var(--mc-text-2)" }}>
            {" "}
            · {milesText}
          </span>
        </p>
        {note && <p className="mc-missed__note">{note}</p>}
        {error && (
          <p className="mc-formerror" role="alert">
            {error}
          </p>
        )}
        <div className="mc-missed__actions">
          {start ? (
            <Button variant="secondary" loading={busy === "extend"} disabled={busy !== null} onClick={() => resolve("extend")}>
              Add to the next trip
            </Button>
          ) : (
            <Button variant="secondary" href={addTripHref(p)}>
              Add trip
            </Button>
          )}
          <Button variant="ghost" loading={busy === "dismiss"} disabled={busy !== null} onClick={() => resolve("dismiss")}>
            Not a trip
          </Button>
        </div>
      </div>
    </Card>
  );
}
