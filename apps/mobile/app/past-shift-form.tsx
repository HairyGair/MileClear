// Add a past shift (Oct 2026). A gig driver asked to add a whole earlier
// work session in one go instead of one trip at a time: the shift's times,
// the car, every trip in it, and what it earned, saved with one tap.
//
// Each new trip follows on from the one before (where it arrived, when it
// arrived, the same app), like "Add the next trip" on the trip form. Miles
// come from the same road route lookup the trip form uses, and each trip is
// checked against the trips MileClear already has (lib/trips/overlapLookup).
//
// This screen needs a connection to save. The shift, its trips and the
// earning go to the server as one request (POST /shifts/past) and are saved
// together or not at all; the sync queue only knows live shifts started
// "now", so queueing a past one would mean a new kind of queued item in the
// engine that also carries recorded drives. Offline, the form says so and
// keeps everything typed. What the server saved is then put on the phone.
// When a sent save gets no answer, the driver is asked to check More > Shifts
// first; sending it again unchanged is safe (the key is made from the
// request, so the server answers with the first save).
//
// "Just the totals" (Lucian, Deliveroo, 19 Oct 2026): instead of every trip,
// the shift's total miles, how many drops, and where it started and finished,
// saved as one Business trip across the shift with exactly the typed miles
// (lib/shifts/pastShiftTotalsRule). "Every trip" stays the default.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import { GIG_PLATFORMS, formatMiles } from "@mileclear/shared";
import type { Vehicle } from "@mileclear/shared";
import { LocationPickerField } from "../components/LocationPickerField";
import { DateTimePickerField } from "../components/DateTimePickerField";
import { Button } from "../components/Button";
import { fetchVehicles } from "../lib/api/vehicles";
import { fetchServerRouteDistance } from "../lib/api/trips";
import { createPastShift } from "../lib/api/shifts";
import { isApiError } from "../lib/api/index";
import { isOnline } from "../lib/network";
import { hydrateShifts, hydrateTrips, hydrateEarnings } from "../lib/sync/hydrate";
import { findTripAround, knownTripsBetween, type KnownTrip } from "../lib/trips/overlapLookup";
import { describeKnownTrip } from "../lib/trips/overlapText";
import { clockTime } from "../lib/trips/manualTimeRule";
import {
  arrivalFor,
  buildPastShiftBody,
  chainedTrip,
  missingForPastShift,
  mostUsedPlatform,
  moveShiftEnd,
  moveTripTimes,
  sentSaveFailureMessage,
  stableBodyText,
  PAST_SHIFT_OFFLINE_MESSAGE,
  type DraftTrip,
  type PastShiftBody,
} from "../lib/shifts/pastShiftRule";
import {
  buildPastShiftTotalsBody,
  emptyTotals,
  homeFrom,
  missingForTotals,
  pastShiftSavedText,
  totalsOverlapWarning,
  totalsSummary,
  tripsInsideShift,
  withFinish,
  withHome,
  withStart,
  type DraftTotals,
  type PastShiftMode,
  type PastShiftTotalsBody,
  type SavedPlaceForHome,
} from "../lib/shifts/pastShiftTotalsRule";
import { getDatabase } from "../lib/db";
import { trackPastShift } from "../lib/events/pastShift";
import { colors, fonts, spacing, radii } from "../lib/theme";
import { haptic } from "../lib/haptics";

function routeKey(t: DraftTrip): string {
  return `${t.fromLat},${t.fromLng},${t.toLat},${t.toLng}`;
}

export default function PastShiftFormScreen() {
  const router = useRouter();
  const keySeq = useRef(0);
  const nextKey = () => `trip-${++keySeq.current}`;

  const [shiftStart, setShiftStart] = useState<Date | null>(null);
  const [shiftEnd, setShiftEnd] = useState<Date | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [trips, setTrips] = useState<DraftTrip[]>(() => [chainedTrip(null, null, nextKey(), Date.now())]);
  const [earningText, setEarningText] = useState("");
  const [earningPlatform, setEarningPlatform] = useState<string | null>(null);
  const [earningPlatformTouched, setEarningPlatformTouched] = useState(false);
  const [overlaps, setOverlaps] = useState<Record<string, KnownTrip | null>>({});
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<PastShiftMode>("trips");
  const [totals, setTotals] = useState<DraftTotals>(() => emptyTotals(null));
  const [totalsOverlap, setTotalsOverlap] = useState<{ trips: number; miles: number } | null>(null);

  const shiftStartRef = useRef<Date | null>(null);
  const savedRef = useRef(false);
  const warnedRef = useRef(new Set<string>());

  useEffect(() => {
    trackPastShift("past_shift.opened");
    return () => {
      if (!savedRef.current) trackPastShift("past_shift.left");
    };
  }, []);

  useEffect(() => {
    fetchVehicles()
      .then((res) => {
        setVehicles(res.data);
        const primary = res.data.find((v) => v.isPrimary) ?? (res.data.length === 1 ? res.data[0] : undefined);
        if (primary) setVehicleId(primary.id);
      })
      .catch(() => {});
  }, []);

  // The driver's saved Home, read from the phone, starts the totals' start
  // and finish. Without one they pick the places themselves.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await getDatabase();
        const rows = await db.getAllAsync<SavedPlaceForHome>(
          "SELECT name, latitude, longitude, location_type FROM saved_locations WHERE location_type = 'home'"
        );
        if (!cancelled) setTotals((t) => withHome(t, homeFrom(rows)));
      } catch {
        // No Home to offer: the places start empty.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const changeMode = useCallback((next: PastShiftMode) => {
    setMode((prev) => {
      if (prev !== next) trackPastShift("past_shift.mode_changed", { mode: next });
      return next;
    });
  }, []);

  const updateTrip = useCallback((key: string, patch: Partial<DraftTrip>) => {
    setTrips((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  }, []);

  // Moving the shift's start moves every trip time the driver has not set
  // themselves by the same amount; the first trip starts with the shift. The
  // end moves too when it no longer fits the new start (another day).
  const onShiftStart = useCallback((d: Date) => {
    const from = shiftStartRef.current;
    shiftStartRef.current = d;
    setShiftStart(d);
    setShiftEnd((prev) => moveShiftEnd(prev, from, d, Date.now()));
    setTrips((prev) => moveTripTimes(prev, from, d));
  }, []);

  // Road miles for every trip with both ends and no route yet: the same
  // lookup the trip form uses (GET /trips/route-distance).
  useEffect(() => {
    for (const t of trips) {
      if (t.route !== "idle" || t.fromLat == null || t.fromLng == null || t.toLat == null || t.toLng == null) continue;
      const key = t.key;
      const asked = routeKey(t);
      updateTrip(key, { route: "working" });
      fetchServerRouteDistance({ startLat: t.fromLat, startLng: t.fromLng, endLat: t.toLat, endLng: t.toLng }).then(
        (result) => {
          setTrips((prev) =>
            prev.map((p) => {
              if (p.key !== key || routeKey(p) !== asked) return p;
              if (!result) return { ...p, route: "failed", miles: null, routedSecs: null };
              const secs = Number.isFinite(result.durationSecs) && result.durationSecs > 0 ? result.durationSecs : null;
              return { ...p, route: "done", miles: result.distanceMiles, routedSecs: secs };
            })
          );
        }
      );
    }
  }, [trips, updateTrip]);

  // Earnings start on the app most trips were for (or the totals' app),
  // until the driver picks.
  const usualPlatform = useMemo(
    () => (mode === "totals" ? totals.platformTag : mostUsedPlatform(trips)),
    [mode, totals.platformTag, trips]
  );
  useEffect(() => {
    if (!earningPlatformTouched) setEarningPlatform(usualPlatform);
  }, [usualPlatform, earningPlatformTouched]);

  // A trip MileClear already has around each trip's time, the trip form's
  // check (trip_form.overlap_warned) run for every trip in the shift.
  const timesKey = trips.map((t) => `${t.key}@${t.setOffAt?.getTime() ?? ""}-${arrivalFor(t, Date.now())?.getTime() ?? ""}`).join("|");
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const found: Record<string, KnownTrip | null> = {};
      for (const t of trips) {
        if (!t.setOffAt) continue;
        found[t.key] = await findTripAround(t.setOffAt, arrivalFor(t, Date.now())).catch(() => null);
      }
      if (cancelled) return;
      setOverlaps(found);
      for (const [key, hit] of Object.entries(found)) {
        if (hit && !warnedRef.current.has(hit.id)) {
          warnedRef.current.add(hit.id);
          trackPastShift("past_shift.overlap_warned", {
            tripIndex: trips.findIndex((t) => t.key === key),
            existingTripId: hit.id,
            existingIsManual: hit.isManualEntry,
            existingSource: hit.source,
          });
        }
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // timesKey stands for the trips' times, so typing a place does not re-check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timesKey]);

  // A total covers the whole shift, so any trip MileClear already has in
  // those hours would count the same miles twice.
  const shiftKey = `${shiftStart?.getTime() ?? ""}-${shiftEnd?.getTime() ?? ""}`;
  useEffect(() => {
    if (mode !== "totals" || !shiftStart || !shiftEnd || shiftEnd <= shiftStart) {
      setTotalsOverlap(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const known = await knownTripsBetween(shiftStart, shiftEnd).catch(() => null);
      if (cancelled) return;
      const found = known ? tripsInsideShift(known.trips, shiftStart, shiftEnd) : null;
      setTotalsOverlap(found && found.trips > 0 ? found : null);
      const key = `totals:${shiftKey}`;
      if (found && found.trips > 0 && !warnedRef.current.has(key)) {
        warnedRef.current.add(key);
        trackPastShift("past_shift.overlap_warned", { fromTotals: true, count: found.trips, miles: found.miles });
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // shiftKey stands for the shift's times.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, shiftKey]);

  const addNextTrip = useCallback(() => {
    setTrips((prev) => [...prev, chainedTrip(prev[prev.length - 1] ?? null, shiftStart, nextKey(), Date.now())]);
    trackPastShift("past_shift.next_trip_tapped", { tripCount: trips.length + 1 });
  }, [shiftStart, trips.length]);

  const removeTrip = useCallback((key: string) => {
    setTrips((prev) => prev.filter((t) => t.key !== key));
  }, []);

  // Several cars and none primary: the server would save no car, so the
  // driver picks one rather than the screen guessing.
  const carNeeded = vehicles.length > 1 && !vehicleId;
  const hint =
    mode === "totals"
      ? missingForTotals({ shiftStart, shiftEnd, totals, carNeeded })
      : missingForPastShift({ shiftStart, shiftEnd, trips, carNeeded });
  const totalMiles = trips.reduce((sum, t) => sum + (t.miles ?? 0), 0);

  const send = useCallback(
    async (body: PastShiftBody | PastShiftTotalsBody) => {
      setSaving(true);
      try {
        // The key comes from the request itself: sent again unchanged, the
        // server answers with the first save; edited, it is a new request.
        const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, stableBodyText(body));
        const res = await createPastShift(body, `ps-${digest.slice(0, 48)}`);
        savedRef.current = true;
        // Put what the server saved on the phone, as hydration would, so
        // Trips and Home show it straight away.
        await hydrateShifts([res.data]).catch(() => {});
        await hydrateTrips(res.trips.map((t) => ({ ...t, vehicle: null }))).catch(() => {});
        if (res.earning) await hydrateEarnings([res.earning]).catch(() => {});
        haptic("success");
        const miles = res.trips.reduce((sum, t) => sum + (t.distanceMiles ?? 0), 0);
        Alert.alert(
          "Shift added",
          pastShiftSavedText({
            tripCount: res.trips.length,
            miles,
            fromTotals: "totals" in body,
            overlappingTrips: res.overlapping?.trips ?? 0,
          }),
          [{ text: "OK", onPress: () => router.back() }]
        );
      } catch (err) {
        // The request went out. A refusal (4xx) is shown in the server's own
        // words; anything else may have saved, so the driver checks first.
        const status = isApiError(err) ? err.statusCode : null;
        const unconfirmed = sentSaveFailureMessage(status);
        if (unconfirmed) {
          trackPastShift("past_shift.save_unconfirmed", { status });
          Alert.alert("Couldn't confirm the save", unconfirmed);
        } else {
          Alert.alert("Couldn't save the shift", err instanceof Error ? err.message : "Check the shift and try again.");
        }
      } finally {
        setSaving(false);
      }
    },
    [router]
  );

  const handleSave = useCallback(() => {
    if (!isOnline()) {
      trackPastShift("past_shift.offline_blocked");
      Alert.alert("No connection", PAST_SHIFT_OFFLINE_MESSAGE);
      return;
    }
    const built =
      mode === "totals"
        ? buildPastShiftTotalsBody({
            shiftStart,
            shiftEnd,
            vehicleId,
            totals,
            earningText,
            earningPlatform,
            now: Date.now(),
            carNeeded,
          })
        : buildPastShiftBody({
            shiftStart,
            shiftEnd,
            vehicleId,
            trips,
            earningText,
            earningPlatform,
            now: Date.now(),
            carNeeded,
          });
    if ("problem" in built) {
      Alert.alert("Check the shift", built.problem);
      return;
    }

    const go = () => {
      if (mode === "totals") {
        if (!totalsOverlap) {
          send(built.body);
          return;
        }
        Alert.alert(
          "You may already have trips in this shift",
          totalsOverlapWarning(totalsOverlap) ?? "",
          [
            {
              text: "Go back",
              style: "cancel",
              onPress: () => trackPastShift("past_shift.overlap_answered", { answer: "go_back", count: totalsOverlap.trips, fromTotals: true }),
            },
            {
              text: "Save anyway",
              onPress: () => {
                trackPastShift("past_shift.overlap_answered", { answer: "save_anyway", count: totalsOverlap.trips, fromTotals: true });
                send(built.body);
              },
            },
          ]
        );
        return;
      }
      const clashing = trips
        .map((t, i) => ({ n: i + 1, hit: overlaps[t.key] }))
        .filter((c): c is { n: number; hit: KnownTrip } => !!c.hit);
      if (clashing.length === 0) {
        send(built.body);
        return;
      }
      const which = clashing.map((c) => `trip ${c.n}`).join(", ");
      Alert.alert(
        "You may already have these trips",
        `MileClear already has a trip around the time of ${which}. Saving both could count the same miles twice.`,
        [
          {
            text: "Go back",
            style: "cancel",
            onPress: () => trackPastShift("past_shift.overlap_answered", { answer: "go_back", count: clashing.length }),
          },
          {
            text: "Save anyway",
            onPress: () => {
              trackPastShift("past_shift.overlap_answered", { answer: "save_anyway", count: clashing.length });
              send(built.body);
            },
          },
        ]
      );
    };

    if (built.plan.message) {
      Alert.alert("Shift times", built.plan.message, [
        { text: "Go back", style: "cancel" },
        { text: "Save", onPress: go },
      ]);
      return;
    }
    go();
  }, [shiftStart, shiftEnd, vehicleId, trips, earningText, earningPlatform, overlaps, send, carNeeded, mode, totals, totalsOverlap]);

  const now = new Date();

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title: "Add a past shift" }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          Add a shift you worked earlier in one go, trip by trip or just its totals. Trips in a shift are saved as Business.
        </Text>

        <Text style={styles.section}>The shift</Text>
        <DateTimePickerField label="Started" value={shiftStart} onChange={onShiftStart} maximumDate={now} hideNow />
        <DateTimePickerField label="Ended" value={shiftEnd} onChange={setShiftEnd} maximumDate={now} />

        {vehicles.length > 1 && (
          <>
            <Text style={styles.label}>Car</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {vehicles.map((v) => (
                <TouchableOpacity
                  key={v.id}
                  style={[styles.chip, vehicleId === v.id && styles.chipActive]}
                  onPress={() => setVehicleId(v.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: vehicleId === v.id }}
                >
                  <Text style={[styles.chipText, vehicleId === v.id && styles.chipTextActive]}>
                    {v.make} {v.model}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}
        {vehicles.length === 1 && (
          <Text style={styles.carLine}>
            Car: {vehicles[0].make} {vehicles[0].model}
          </Text>
        )}

        <Text style={styles.section}>Trips</Text>
        <View style={styles.modeRow} accessibilityRole="radiogroup">
          {(
            [
              { value: "trips", label: "Every trip" },
              { value: "totals", label: "Just the totals" },
            ] as const
          ).map((m) => (
            <TouchableOpacity
              key={m.value}
              style={[styles.modeOption, mode === m.value && styles.modeOptionActive]}
              onPress={() => changeMode(m.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: mode === m.value }}
            >
              <Text style={[styles.modeText, mode === m.value && styles.modeTextActive]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {mode === "totals" && (
          <View style={styles.tripCard}>
            <Text style={styles.totalsIntro}>
              Type the shift's total miles instead of each trip. It's saved as one trip across the shift, with exactly
              the miles you type. A total is a thinner record than trip by trip, so keep the shift history from
              Deliveroo, Uber or whichever app you worked for as back-up.
            </Text>

            <Text style={styles.label}>Total miles</Text>
            <TextInput
              style={styles.input}
              value={totals.milesText}
              onChangeText={(milesText) => setTotals((t) => ({ ...t, milesText }))}
              placeholder="For example 84.5"
              placeholderTextColor={colors.text3}
              keyboardType="decimal-pad"
              accessibilityLabel="Total miles for the shift"
            />

            <Text style={styles.label}>Drops or trips (optional)</Text>
            <TextInput
              style={styles.input}
              value={totals.dropsText}
              onChangeText={(dropsText) => setTotals((t) => ({ ...t, dropsText }))}
              placeholder="For example 32"
              placeholderTextColor={colors.text3}
              keyboardType="number-pad"
              accessibilityLabel="Number of drops or trips in the shift"
            />

            <LocationPickerField
              label="Started at"
              lat={totals.from?.lat ?? null}
              lng={totals.from?.lng ?? null}
              address={totals.from?.address ?? null}
              onLocationChange={(lat, lng, address) => setTotals((t) => withStart(t, { lat, lng, address: address ?? null }))}
              onClear={() => setTotals((t) => withStart(t, null))}
            />
            <LocationPickerField
              label="Finished at"
              lat={totals.to?.lat ?? null}
              lng={totals.to?.lng ?? null}
              address={totals.to?.address ?? null}
              onLocationChange={(lat, lng, address) => setTotals((t) => withFinish(t, { lat, lng, address: address ?? null }))}
              onClear={() => setTotals((t) => withFinish(t, null))}
            />

            {totalsOverlap && (
              <View style={styles.overlapBox}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.amber} />
                <Text style={styles.overlapText}>{totalsOverlapWarning(totalsOverlap)}</Text>
              </View>
            )}

            <Text style={styles.label}>App (optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {GIG_PLATFORMS.map((p) => (
                <TouchableOpacity
                  key={p.value}
                  style={[styles.chip, totals.platformTag === p.value && styles.chipActive]}
                  onPress={() => setTotals((t) => ({ ...t, platformTag: t.platformTag === p.value ? null : p.value }))}
                  accessibilityRole="button"
                  accessibilityState={{ selected: totals.platformTag === p.value }}
                >
                  <Text style={[styles.chipText, totals.platformTag === p.value && styles.chipTextActive]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {mode === "trips" && trips.map((t, i) => {
          const arrival = arrivalFor(t, Date.now());
          const hit = overlaps[t.key];
          const words = hit ? describeKnownTrip(hit) : null;
          return (
            <View key={t.key} style={styles.tripCard}>
              <View style={styles.tripHeader}>
                <Text style={styles.tripTitle}>Trip {i + 1}</Text>
                {trips.length > 1 && (
                  <TouchableOpacity
                    onPress={() => removeTrip(t.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove trip ${i + 1}`}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.text3} />
                  </TouchableOpacity>
                )}
              </View>

              <LocationPickerField
                label="From"
                lat={t.fromLat}
                lng={t.fromLng}
                address={t.fromAddress}
                onLocationChange={(lat, lng, address) =>
                  updateTrip(t.key, { fromLat: lat, fromLng: lng, fromAddress: address, route: "idle" })
                }
                onClear={() => updateTrip(t.key, { fromLat: null, fromLng: null, fromAddress: null, route: "idle" })}
              />
              <LocationPickerField
                label="To"
                lat={t.toLat}
                lng={t.toLng}
                address={t.toAddress}
                onLocationChange={(lat, lng, address) =>
                  updateTrip(t.key, { toLat: lat, toLng: lng, toAddress: address, route: "idle" })
                }
                onClear={() => updateTrip(t.key, { toLat: null, toLng: null, toAddress: null, route: "idle" })}
              />
              <DateTimePickerField
                label="Set off"
                value={t.setOffAt}
                onChange={(d) => updateTrip(t.key, { setOffAt: d, timeEdited: true })}
                maximumDate={now}
                hideNow
              />

              {t.route === "working" && <Text style={styles.milesLine}>Working out the miles...</Text>}
              {t.route === "done" && t.miles != null && (
                <Text style={styles.milesLine}>
                  {formatMiles(t.miles)} by road{arrival ? `, arrives about ${clockTime(arrival)}` : ""}
                </Text>
              )}
              {t.route === "failed" && (
                <TouchableOpacity onPress={() => updateTrip(t.key, { route: "idle" })} accessibilityRole="button">
                  <Text style={styles.failLine}>Couldn't work out the miles. Check your connection, then tap to try again.</Text>
                </TouchableOpacity>
              )}

              {words && (
                <View style={styles.overlapBox}>
                  <Ionicons name="alert-circle-outline" size={16} color={colors.amber} />
                  <Text style={styles.overlapText}>
                    You already have a trip around then: {words.route}, {words.times}, {words.miles}.
                  </Text>
                </View>
              )}

              <Text style={styles.label}>App (optional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {GIG_PLATFORMS.map((p) => (
                  <TouchableOpacity
                    key={p.value}
                    style={[styles.chip, t.platformTag === p.value && styles.chipActive]}
                    onPress={() => updateTrip(t.key, { platformTag: t.platformTag === p.value ? null : p.value })}
                    accessibilityRole="button"
                    accessibilityState={{ selected: t.platformTag === p.value }}
                  >
                    <Text style={[styles.chipText, t.platformTag === p.value && styles.chipTextActive]}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          );
        })}

        {mode === "trips" && (
          <TouchableOpacity style={styles.addTrip} onPress={addNextTrip} accessibilityRole="button">
            <Ionicons name="add-circle-outline" size={18} color={colors.amber} />
            <Text style={styles.addTripText}>Add the next trip</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.section}>Earnings (optional)</Text>
        <View style={styles.amountRow}>
          <Text style={styles.currency} accessible={false}>£</Text>
          <TextInput
            style={[styles.input, styles.amountInput]}
            value={earningText}
            onChangeText={setEarningText}
            placeholder="0.00"
            placeholderTextColor={colors.text3}
            keyboardType="decimal-pad"
            accessibilityLabel="Amount earned on this shift, in pounds"
          />
        </View>
        {earningText.trim().length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chipRow, { marginTop: spacing.sm }]}>
            {GIG_PLATFORMS.map((p) => (
              <TouchableOpacity
                key={p.value}
                style={[styles.chip, earningPlatform === p.value && styles.chipActive]}
                onPress={() => {
                  setEarningPlatformTouched(true);
                  setEarningPlatform(p.value);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: earningPlatform === p.value }}
              >
                <Text style={[styles.chipText, earningPlatform === p.value && styles.chipTextActive]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {hint ? (
          <Text style={styles.hint}>{hint}</Text>
        ) : mode === "totals" ? (
          <Text style={styles.hint}>{totalsSummary(totals) ?? ""}</Text>
        ) : (
          <Text style={styles.hint}>
            {trips.length} {trips.length === 1 ? "trip" : "trips"}, {formatMiles(totalMiles)}
          </Text>
        )}
        <Button
          title="Save shift"
          icon="checkmark"
          onPress={handleSave}
          loading={saving}
          disabled={!!hint || saving}
          style={{ marginTop: spacing.sm }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 48,
  },
  intro: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.text2,
    lineHeight: 20,
  },
  section: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: colors.text3,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: spacing.xxl,
    marginBottom: spacing.xs,
  },
  label: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: colors.text2,
    marginBottom: 6,
    marginTop: spacing.lg,
  },
  carLine: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.text2,
    marginTop: spacing.md,
  },
  chipRow: {
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  chipActive: {
    backgroundColor: colors.amber,
    borderColor: colors.amber,
  },
  chipText: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: colors.text2,
  },
  chipTextActive: {
    color: colors.bg,
  },
  modeRow: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 3,
    marginTop: spacing.sm,
  },
  modeOption: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: radii.sm,
  },
  modeOptionActive: {
    backgroundColor: colors.amber,
  },
  modeText: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: colors.text2,
  },
  modeTextActive: {
    color: colors.bg,
  },
  totalsIntro: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.text2,
    lineHeight: 19,
  },
  tripCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  tripHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tripTitle: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: colors.text1,
  },
  milesLine: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.text2,
    marginTop: spacing.sm,
  },
  failLine: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.amber,
    marginTop: spacing.sm,
  },
  overlapBox: {
    flexDirection: "row",
    gap: spacing.xs,
    alignItems: "flex-start",
    backgroundColor: colors.amberDim,
    borderRadius: radii.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  overlapText: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.text1,
  },
  addTrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.amberGlow,
  },
  addTripText: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: colors.amber,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  currency: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: colors.text1,
    marginRight: 8,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    fontFamily: fonts.regular,
    color: colors.text1,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  amountInput: {
    flex: 1,
  },
  hint: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.text2,
    textAlign: "center",
    marginTop: spacing.xxl,
  },
});
