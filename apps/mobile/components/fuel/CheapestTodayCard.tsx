// Top of the fuel tab (2 Oct 2026): "Cheapest diesel near you today: 139.9p
// at Tesco Gateshead, 6p under the local average." Built on the server by the
// same rule as the opt-in morning push (GET /fuel/cheapest-today), centred on
// where the driver usually starts trips rather than wherever the phone is.
//
// EV drivers get running costs instead (home rate vs public rapid), with both
// rates editable here, because there is no free live feed of public charger
// prices to find "the cheapest charger" from.
//
// Underneath, once: a gentle offer to get the line as a push. Off by default;
// "Not now" is remembered and the offer never comes back (the switch lives in
// Settings > Notifications).

import { useCallback, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import type { CheapestFuelToday, EvRunningCostToday } from "@mileclear/shared";
import { fetchCheapestToday } from "../../lib/api/fuel";
import { updateElectricityRate, updatePublicChargeRate } from "../../lib/api/charging";
import { registerPushToken } from "../../lib/api/notifications";
import { registerForPushNotifications } from "../../lib/notifications";
import {
  getNotificationPreferences,
  setNotificationPreferences,
} from "../../lib/notifications/preferences";
import { getDatabase } from "../../lib/db/index";
import { colors, fonts, radii } from "../../lib/theme";

const PROMPT_SEEN_KEY = "fuel_alert_prompt_seen";

async function promptSeen(): Promise<boolean> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = ?",
      [PROMPT_SEEN_KEY]
    );
    return row != null;
  } catch {
    return true; // if we cannot remember a "Not now", do not risk nagging
  }
}

async function markPromptSeen(): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [
      PROMPT_SEEN_KEY,
      String(Date.now()),
    ]);
  } catch {
    /* best effort */
  }
}

function parseRate(text: string): number | null | "invalid" {
  const t = text.trim();
  if (t === "") return null;
  const n = Number(t.replace(/p$/i, ""));
  if (!Number.isFinite(n) || n <= 0 || n > 200) return "invalid";
  return Math.round(n * 10) / 10;
}

export default function CheapestTodayCard() {
  const router = useRouter();
  const [data, setData] = useState<CheapestFuelToday | EvRunningCostToday | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [editing, setEditing] = useState(false);
  const [homeText, setHomeText] = useState("");
  const [publicText, setPublicText] = useState("");
  const [saving, setSaving] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchCheapestToday();
      const d = res.data ?? null;
      setData(d);
      if (!d) {
        setShowPrompt(false);
        return;
      }
      const prefs = await getNotificationPreferences();
      const on = d.kind === "ev" ? prefs.evWeeklySummary : prefs.cheapestFuelDaily;
      setShowPrompt(!on && !(await promptSeen()));
    } catch {
      setData(null); // offline or an older API: the card simply does not show
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const turnOn = useCallback(async () => {
    if (!data || enabling) return;
    setEnabling(true);
    try {
      // The push needs a token; this asks for permission only if it was never
      // answered, and registers the token the same way the dashboard does.
      const token = await registerForPushNotifications();
      if (token) await registerPushToken(token).catch(() => {});
      await setNotificationPreferences(
        data.kind === "ev" ? { evWeeklySummary: true } : { cheapestFuelDaily: true }
      );
    } catch {
      /* the switch in Settings is the fallback */
    } finally {
      await markPromptSeen();
      setShowPrompt(false);
      setEnabling(false);
    }
  }, [data, enabling]);

  const notNow = useCallback(async () => {
    setShowPrompt(false);
    await markPromptSeen();
  }, []);

  const startEditing = useCallback(() => {
    if (!data || data.kind !== "ev") return;
    setHomeText(data.homeRateSource === "user" ? String(data.homePencePerKwh) : "");
    setPublicText(data.publicRateIsDefault ? "" : String(data.publicPencePerKwh));
    setRateError(null);
    setEditing(true);
  }, [data]);

  const saveRates = useCallback(async () => {
    const home = parseRate(homeText);
    const pub = parseRate(publicText);
    if (home === "invalid" || pub === "invalid") {
      setRateError("Enter pence per kWh, for example 24.5");
      return;
    }
    setSaving(true);
    try {
      await Promise.all([updateElectricityRate(home), updatePublicChargeRate(pub)]);
      setEditing(false);
      await load();
    } catch {
      setRateError("Could not save. Try again when you have signal.");
    } finally {
      setSaving(false);
    }
  }, [homeText, publicText, load]);

  if (!data) return null;

  const promptText =
    data.kind === "ev"
      ? "Want your EV running costs every Monday morning?"
      : "Want this each morning? We only send it when a station is at least 3p a litre under the local average.";

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons name={data.kind === "ev" ? "flash" : "pricetag"} size={15} color={colors.amber} />
        </View>
        <Text style={styles.title}>{data.kind === "ev" ? "Your running costs" : "Today near you"}</Text>
      </View>

      <Text style={styles.line} accessibilityRole="text">
        {data.line}
      </Text>

      {data.kind === "fuel" ? (
        <Text style={styles.meta}>
          {data.stationCount} stations within {data.radiusMiles} miles of{" "}
          {data.startSource === "saved_home" ? "home" : "where you usually set off"}.
          {` Local average ${data.localAveragePence.toFixed(1)}p.`}
        </Text>
      ) : (
        <>
          <Text style={styles.meta}>
            {data.homeRateSource === "user" ? "Your home rate" : "Estimated home rate"} {data.homePencePerKwh}p/kWh
            {data.publicRateIsDefault ? `, UK average rapid price ${data.publicPencePerKwh}p/kWh` : `, your rapid price ${data.publicPencePerKwh}p/kWh`}
            {data.milesPerKwhIsDefault ? `, typical ${data.milesPerKwh} miles/kWh.` : `, ${data.milesPerKwh} miles/kWh.`}
          </Text>
          {editing ? (
            <View style={styles.editWrap}>
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>Home p/kWh</Text>
                <TextInput
                  style={styles.input}
                  value={homeText}
                  onChangeText={setHomeText}
                  placeholder={String(data.homePencePerKwh)}
                  placeholderTextColor={colors.text3}
                  keyboardType="decimal-pad"
                  accessibilityLabel="Home electricity rate, pence per kWh"
                />
              </View>
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>Public rapid p/kWh</Text>
                <TextInput
                  style={styles.input}
                  value={publicText}
                  onChangeText={setPublicText}
                  placeholder={String(data.publicPencePerKwh)}
                  placeholderTextColor={colors.text3}
                  keyboardType="decimal-pad"
                  accessibilityLabel="Public rapid charging price, pence per kWh"
                />
              </View>
              <Text style={styles.hint}>Leave a box empty to use the estimate.</Text>
              {rateError ? <Text style={styles.error}>{rateError}</Text> : null}
              <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.primaryBtn} onPress={saveRates} disabled={saving} accessibilityRole="button">
                  {saving ? <ActivityIndicator color={colors.bg} size="small" /> : <Text style={styles.primaryText}>Save</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.ghostBtn} onPress={() => setEditing(false)} accessibilityRole="button">
                  <Text style={styles.ghostText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.ghostBtn} onPress={startEditing} accessibilityRole="button" accessibilityLabel="Edit charging rates">
                <Text style={styles.ghostText}>Edit rates</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ghostBtn}
                onPress={() => router.push("/charging-nearby?rapid=1" as never)}
                accessibilityRole="button"
                accessibilityLabel="Find rapid chargers nearby"
              >
                <Text style={styles.ghostText}>Rapid chargers nearby</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {showPrompt && (
        <View style={styles.prompt}>
          <Text style={styles.promptText}>{promptText}</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={turnOn}
              disabled={enabling}
              accessibilityRole="button"
              accessibilityLabel="Turn on this notification"
            >
              {enabling ? <ActivityIndicator color={colors.bg} size="small" /> : <Text style={styles.primaryText}>Turn on</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghostBtn} onPress={notNow} accessibilityRole="button">
              <Text style={styles.ghostText}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 14,
    marginBottom: 16,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.amberDim,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: colors.text2, fontFamily: fonts.semibold, fontSize: 13 },
  line: { color: colors.text1, fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21 },
  meta: { color: colors.text3, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, marginTop: 6 },
  prompt: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },
  promptText: { color: colors.text2, fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  buttonRow: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  primaryBtn: {
    backgroundColor: colors.amber,
    borderRadius: radii.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 84,
    alignItems: "center",
  },
  primaryText: { color: colors.bg, fontFamily: fonts.bold, fontSize: 13 },
  ghostBtn: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ghostText: { color: colors.text2, fontFamily: fonts.semibold, fontSize: 13 },
  editWrap: { marginTop: 10 },
  inputRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  inputLabel: { color: colors.text2, fontFamily: fonts.medium, fontSize: 13 },
  input: {
    width: 90,
    color: colors.text1,
    fontFamily: fonts.semibold,
    fontSize: 14,
    backgroundColor: colors.bg,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingHorizontal: 10,
    paddingVertical: 6,
    textAlign: "right",
  },
  hint: { color: colors.text3, fontFamily: fonts.regular, fontSize: 11.5, marginTop: 6 },
  error: { color: colors.red, fontFamily: fonts.medium, fontSize: 12, marginTop: 6 },
});
