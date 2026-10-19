// The Directions entry points (DESIGN 1.2), each shown only when
// useDirectionsAvailable() says so (navigationEnabled from the server and the
// native voice module in this binary):
//   A. Home, under Start Trip / Start Shift: "Where to?" (+ "Carry on to ...?")
//   B. Saved places: a trailing "Directions to {name}" button on each row
//   C. The recording screen: "Get directions"
// Opening directions never starts, stops or changes a trip.

import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { colors, fonts, fontScaleCap, nav, radii, spacing } from "../../lib/theme";
import { useDirectionsAvailable } from "../../lib/navigation/useDirectionsAvailable";
import { clearSession, getSession } from "../../lib/navigation/store";
import { latestFix } from "../../lib/navigation/fixBus";
import { shouldOfferResume, type SavedSession } from "../../lib/navigation/rules";
import { trackDirections } from "../../lib/navigation/telemetry";
import { DirectionsIcon } from "./Glyph";
import { TestBadge } from "./TestBadge";

export function navigateHref(p: { lat: number; lng: number; label?: string | null; name?: string | null; resume?: boolean }): string {
  const q = [`lat=${p.lat}`, `lng=${p.lng}`];
  if (p.label) q.push(`label=${encodeURIComponent(p.label)}`);
  if (p.name) q.push(`name=${encodeURIComponent(p.name)}`);
  if (p.resume) q.push("resume=1");
  return `/navigate?${q.join("&")}`;
}

/** Home: the resume row (when there is one) and "Where to?". */
export function DirectionsHomeRows({ placement }: { placement: "resume" | "where" }) {
  const router = useRouter();
  const available = useDirectionsAvailable();
  const [session, setSession] = useState<SavedSession | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!available || placement !== "resume") return;
      let cancelled = false;
      getSession().then((s) => {
        if (cancelled) return;
        const here = latestFix(5 * 60_000);
        if (shouldOfferResume(s, Date.now(), here)) {
          setSession(s);
          trackDirections("directions.resume_offered", {});
        } else {
          setSession(null);
          if (s) void clearSession();
        }
      });
      return () => {
        cancelled = true;
      };
    }, [available, placement])
  );

  if (!available) return null;

  if (placement === "resume") {
    if (!session) return null;
    const name = session.destination.label ?? "your destination";
    return (
      <View style={s.resume}>
        <View style={s.resumeTop}>
          <DirectionsIcon size={22} color={colors.amber} />
          <Text style={s.resumeText} numberOfLines={2} maxFontSizeMultiplier={fontScaleCap.heading}>
            Carry on to {name}?
          </Text>
        </View>
        <View style={s.resumeButtons}>
          <Pressable
            style={({ pressed }) => [s.carryOn, pressed && s.pressed]}
            onPress={() => {
              setSession(null);
              router.push(
                navigateHref({
                  lat: session.destination.lat,
                  lng: session.destination.lng,
                  label: session.destination.label,
                  resume: true,
                }) as never
              );
            }}
            accessibilityRole="button"
            accessibilityLabel={`Carry on to ${name}`}
          >
            <Text style={s.carryOnText}>Carry on</Text>
          </Pressable>
          <TouchableOpacity
            style={s.noThanks}
            onPress={() => {
              setSession(null);
              void clearSession();
            }}
            accessibilityRole="button"
            accessibilityLabel="No thanks"
          >
            <Text style={s.noThanksText}>No thanks</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => router.push("/navigate" as never)}
      style={({ pressed }) => [s.where, pressed && s.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Get directions. Test"
      accessibilityHint="Choose where you're going"
    >
      <Ionicons name="search" size={20} color={colors.text2} accessible={false} />
      <Text style={s.whereText} maxFontSizeMultiplier={fontScaleCap.heading}>
        Where to?
      </Text>
      <TestBadge />
      <View style={{ flex: 1 }} />
      <Ionicons name="chevron-forward" size={18} color={colors.text3} accessible={false} />
    </Pressable>
  );
}

/** Saved places list: the trailing button on a row (44 drawn, 56 to hit). */
export function SavedPlaceDirectionsButton({ name, lat, lng }: { name: string; lat: number; lng: number }) {
  const router = useRouter();
  const available = useDirectionsAvailable();
  if (!available) return null;
  return (
    <TouchableOpacity
      onPress={() => router.push(navigateHref({ lat, lng, label: name, name }) as never)}
      style={s.placeBtn}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`Directions to ${name}. Test`}
    >
      <DirectionsIcon size={22} color={colors.amber} />
    </TouchableOpacity>
  );
}

/** Recording screen: "Get directions", a secondary button. */
export function RecordingDirectionsButton() {
  const router = useRouter();
  const available = useDirectionsAvailable();
  if (!available) return null;
  return (
    <Pressable
      onPress={() => router.push("/navigate" as never)}
      style={({ pressed }) => [s.recBtn, pressed && s.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Get directions. Test"
    >
      <DirectionsIcon size={20} color={colors.amber} />
      <Text style={s.recText}>Get directions</Text>
      <TestBadge />
    </Pressable>
  );
}

const s = StyleSheet.create({
  pressed: { opacity: 0.85 },
  where: {
    minHeight: nav.control,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  whereText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text1 },
  resume: {
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  resumeTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  resumeText: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, color: colors.text1 },
  resumeButtons: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  carryOn: {
    flex: 1,
    minHeight: nav.control,
    borderRadius: radii.md,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  carryOnText: { fontFamily: fonts.bold, fontSize: 16, color: colors.bg },
  noThanks: { minHeight: nav.control, paddingHorizontal: spacing.lg, justifyContent: "center" },
  noThanksText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text2 },
  placeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.amberDim,
  },
  recBtn: {
    minHeight: nav.control,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: 12,
  },
  recText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text1 },
});
