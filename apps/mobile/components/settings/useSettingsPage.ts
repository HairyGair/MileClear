// The extra live facts behind the rows on the Settings page: the main car, the
// saved places, the work hours, the plan and the Home shortcuts. Each read is
// best-effort and refreshed on focus; a failed read leaves the row's calm
// default sentence rather than an error.

import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { fetchVehicles } from "../../lib/api/vehicles";
import { fetchBillingStatus } from "../../lib/api/billing";
import { getDatabase } from "../../lib/db";
import { getSchedule } from "../../lib/schedule";
import { getHiddenDoorRows } from "../../lib/home/doorPrefs";
import { getJourneyEndMinutes } from "../../lib/tracking/detection";
import { JOURNEY_END_CHOICES } from "../../lib/tracking/journeyBoundary";
import type { CarLike, PlanLike, SlotLike } from "../../lib/settings/summaries";
import type { DoorRowId } from "../../lib/home/doorPrefs";

export interface SettingsPageData {
  cars: CarLike[] | null;
  places: string[] | null;
  slots: SlotLike[] | null;
  plan: PlanLike | null;
  hiddenDoors: DoorRowId[];
  journeyEndLabel: string | null;
}

export function useSettingsPage(isPremium: boolean): SettingsPageData {
  const [cars, setCars] = useState<CarLike[] | null>(null);
  const [places, setPlaces] = useState<string[] | null>(null);
  const [slots, setSlots] = useState<SlotLike[] | null>(null);
  const [plan, setPlan] = useState<PlanLike | null>(null);
  const [hiddenDoors, setHiddenDoors] = useState<DoorRowId[]>([]);
  const [journeyEndLabel, setJourneyEndLabel] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      fetchVehicles()
        .then((r) => live && setCars(r.data))
        .catch(() => {});
      getDatabase()
        .then((db) => db.getAllAsync<{ name: string }>("SELECT name FROM saved_locations ORDER BY name"))
        .then((rows) => live && setPlaces(rows.map((r) => r.name)))
        .catch(() => {});
      getSchedule()
        .then((s) => live && setSlots(s))
        .catch(() => {});
      fetchBillingStatus()
        .then((r) => {
          if (!live) return;
          const b = r.data;
          setPlan({
            isPremium: b.isPremium,
            platform: b.subscriptionPlatform,
            source: b.premiumSource,
            currentPeriodEnd: b.currentPeriodEnd,
            cancelAtPeriodEnd: b.cancelAtPeriodEnd,
            referralProUntil: b.referralProUntil,
          });
        })
        .catch(() => live && setPlan({ isPremium }));
      getHiddenDoorRows()
        .then((ids) => live && setHiddenDoors(ids))
        .catch(() => {});
      getJourneyEndMinutes()
        .then((m) => {
          if (!live) return;
          setJourneyEndLabel(JOURNEY_END_CHOICES.find((c) => c.minutes === m)?.label ?? `${m} min`);
        })
        .catch(() => {});
      return () => {
        live = false;
      };
    }, [isPremium])
  );

  return { cars, places, slots, plan, hiddenDoors, journeyEndLabel };
}
