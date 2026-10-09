"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { LocationType, SavedLocation } from "@mileclear/shared";
import { MAX_FREE_SAVED_LOCATIONS } from "@mileclear/shared";
import { api } from "@/lib/api";
import { Button } from "@/components/dashboard/kit/Button";
import { Card, SectionHeader } from "@/components/dashboard/kit/Card";
import { Icon, type IconName } from "@/components/dashboard/kit/Icon";
import { PageHeader } from "@/components/dashboard/kit/PageHeader";
import { EmptyState, ErrorState, Skeleton } from "@/components/dashboard/kit/States";
import { useToast } from "@/components/dashboard/kit/Toast";
import { useMe } from "@/lib/dashboard/useMe";
import { useData } from "@/lib/dashboard/useData";
import { safeGet, safeSet } from "@/lib/dashboard/mode";
import { ProDialog } from "@/components/dashboard/driving/ProDialog";
import { PLACE_TYPES } from "@/components/dashboard/driving/PlaceForm";
import styles from "@/components/dashboard/driving/driving.module.css";

interface Suggestion {
  id: string;
  centroidLat: number;
  centroidLng: number;
  visitCount: number;
  suggestedType: "home" | "work" | "other";
  inferredName: string | null;
}

const ICONS: Record<LocationType, IconName> = {
  home: "home-outline",
  work: "briefcase-outline",
  depot: "business-outline",
  custom: "location-outline",
};
const DISMISSED_KEY = "mc_places_dismissed";

function readDismissed(): string[] {
  try {
    const raw = safeGet(DISMISSED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export default function PlacesPage() {
  const { isPro } = useMe();
  const { show } = useToast();
  const places = useData("places", () => api.get<{ data: SavedLocation[] }>("/saved-locations"));
  const suggestions = useData("place-suggestions", () =>
    api.get<{ data: Suggestion[] }>("/saved-locations/suggestions").catch(() => ({ data: [] as Suggestion[] }))
  );
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [proOpen, setProOpen] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => setDismissed(readDismissed()), []);

  const list = places.data?.data ?? [];
  const atLimit = !isPro && list.length >= MAX_FREE_SAVED_LOCATIONS;
  const suggestion = (suggestions.data?.data ?? []).find((s) => !dismissed.includes(s.id)) ?? null;

  async function saveSuggestion(s: Suggestion) {
    if (atLimit) return setProOpen(true);
    setSavingId(s.id);
    try {
      await api.post("/saved-locations", {
        name: s.inferredName ?? "Saved place",
        locationType: s.suggestedType === "other" ? "custom" : s.suggestedType,
        latitude: s.centroidLat,
        longitude: s.centroidLng,
        radiusMeters: 150,
        geofenceEnabled: true,
      });
      show("Saved");
      places.reload();
      suggestions.reload();
    } catch (e) {
      show(e instanceof Error ? e.message : "Couldn't save. Try again.", "error");
    } finally {
      setSavingId(null);
    }
  }

  const add = atLimit ? (
    <Button variant="primary" onClick={() => setProOpen(true)}>Add place</Button>
  ) : (
    <Button variant="primary" href="/dashboard/places/new">Add place</Button>
  );

  return (
    <>
      <PageHeader title="Saved places" back={{ href: "/dashboard/more", label: "More" }} primary={list.length > 0 ? add : undefined} />
      <div className={styles.stack}>
        {suggestion && (
          <Card tone="quiet" title="A place you visit often">
            <p className={styles.muted}>
              You often stop at {suggestion.inferredName ?? "the same spot"}. Save it?
            </p>
            <div className={`${styles.actionsRow} ${styles.mt}`}>
              <Button variant="secondary" size="sm" loading={savingId === suggestion.id} onClick={() => saveSuggestion(suggestion)}>
                Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const next = [...dismissed, suggestion.id];
                  setDismissed(next);
                  safeSet(DISMISSED_KEY, JSON.stringify(next));
                }}
              >
                No thanks
              </Button>
            </div>
          </Card>
        )}

        {places.loading && !places.data ? (
          <Skeleton variant="row" count={3} />
        ) : places.error && !places.data ? (
          <ErrorState title="Couldn't load your places" onRetry={places.reload} />
        ) : list.length === 0 ? (
          <EmptyState
            icon="location-outline"
            title="No saved places"
            body="Save home, work or your depot and trips get named and sorted for you."
            action={{ label: "Add place", href: "/dashboard/places/new" }}
          />
        ) : (
          <>
            <Card padded={false}>
              <ul className={styles.list}>
                {list.map((p) => (
                  <li key={p.id}>
                    <Link href={`/dashboard/places/${p.id}`} className={styles.listRow}>
                      <span className={styles.actionsRow}>
                        <span className={styles.vehicleIcon}>
                          <Icon name={ICONS[p.locationType]} size={20} />
                        </span>
                        <span className={styles.listMain}>
                          <span className={styles.listTitle}>{p.name}</span>
                          <span className={styles.listSub}>
                            {PLACE_TYPES.find((t) => t.value === p.locationType)?.label} · {p.radiusMeters} m radius
                          </span>
                        </span>
                      </span>
                      <Icon name="chevron-forward" size={16} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
            {!isPro && (
              <p className={styles.hint}>
                {list.length} of {MAX_FREE_SAVED_LOCATIONS} free places used. Pro has no limit.
              </p>
            )}
          </>
        )}
        <SectionHeader title="How these are used" />
        <p className={styles.muted}>Your phone uses these to sort trips and name them.</p>
      </div>
      <ProDialog
        open={proOpen}
        reason="places"
        onClose={() => setProOpen(false)}
        body="Free accounts can save 2 places. Pro has no limit. £4.99 a month, cancel any time."
      />
    </>
  );
}
