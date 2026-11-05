// Insurance miles (Nov 2026): set the yearly mileage limit declared to your
// insurer and the day your insurance year starts. Home then shows a card with
// miles used, ahead or behind an even pace, and the miles a day left
// (components/home/InsuranceMilesCard.tsx). Kept on this phone. Free.

import { useCallback, useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Button } from "../components/Button";
import { DateTimePickerField } from "../components/DateTimePickerField";
import { fetchVehicles, type VehicleWithCaz } from "../lib/api/vehicles";
import { dayKey, parseLimitInput } from "../lib/insurance/miles";
import { getInsuranceMiles, setInsuranceMiles } from "../lib/insurance/store";
import { useUser } from "../lib/user/context";
import { colors, fonts, fontScaleCap, radii } from "../lib/theme";

function fromDayKey(k: string): Date {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export default function InsuranceMilesScreen() {
  const router = useRouter();
  const { user } = useUser();
  const userId = user?.id;
  const [loaded, setLoaded] = useState(false);
  const [isSet, setIsSet] = useState(false);
  const [limitText, setLimitText] = useState("");
  const [start, setStart] = useState<Date>(() => new Date());
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<VehicleWithCaz[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const current = await getInsuranceMiles(userId);
      if (!live) return;
      if (current) {
        setIsSet(true);
        setLimitText(current.limitMiles.toLocaleString("en-GB"));
        setStart(fromDayKey(current.startDate));
        setVehicleId(current.vehicleId);
      }
      setLoaded(true);
      try {
        const res = await fetchVehicles();
        if (!live) return;
        setVehicles(res.data);
        // A car chosen earlier and since deleted, or only one car left: count
        // every car again, so the choice is never stuck on a car that is gone.
        setVehicleId((id) => (id && res.data.length > 1 && res.data.some((v) => v.id === id) ? id : null));
      } catch {
        // No car list: the choice is simply not offered.
      }
    })();
    return () => {
      live = false;
    };
  }, [userId]);

  const save = useCallback(async () => {
    const limit = parseLimitInput(limitText);
    if (limit === null) {
      setError("Type your yearly limit in miles, for example 10,000.");
      return;
    }
    await setInsuranceMiles(userId, { limitMiles: limit, startDate: dayKey(start), vehicleId });
    router.back();
  }, [limitText, start, vehicleId, router, userId]);

  const remove = useCallback(() => {
    Alert.alert("Remove insurance miles?", "The card goes from Home. You can set it up again any time.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await setInsuranceMiles(userId, null);
          router.back();
        },
      },
    ]);
  }, [router, userId]);

  if (!loaded) return <View style={s.container} />;

  // Only worth asking which car when there is more than one.
  const showCars = vehicles.length > 1;

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.intro} maxFontSizeMultiplier={fontScaleCap.body}>
          Your insurer asks how many miles you drive a year. Set that limit here and Home shows how many you've used,
          whether you're ahead or behind, and how many miles a day you have left. Every trip counts, business or
          personal.
        </Text>

        <Text style={s.label} maxFontSizeMultiplier={fontScaleCap.body}>
          Yearly limit (miles)
        </Text>
        <TextInput
          style={s.input}
          value={limitText}
          onChangeText={(t) => {
            setLimitText(t);
            setError(null);
          }}
          placeholder="10,000"
          placeholderTextColor={colors.text3}
          keyboardType="number-pad"
          returnKeyType="done"
          accessibilityLabel="Yearly limit in miles"
        />
        {error ? (
          <Text style={s.error} maxFontSizeMultiplier={fontScaleCap.body}>
            {error}
          </Text>
        ) : null}

        <View style={{ marginTop: 16 }}>
          <DateTimePickerField
            label="Your insurance year starts"
            value={start}
            onChange={setStart}
            mode="date"
            hideNow
          />
          <Text style={s.hint} maxFontSizeMultiplier={fontScaleCap.body}>
            The start date on your policy. It renews on the same day each year. If your new policy starts later, Home
            counts from that day.
          </Text>
        </View>

        {showCars ? (
          <>
            <Text style={s.label} maxFontSizeMultiplier={fontScaleCap.body}>
              Which car
            </Text>
            <View style={s.group}>
              {[{ id: null as string | null, name: "All my cars" }, ...vehicles.map((v) => ({ id: v.id as string | null, name: `${v.make} ${v.model}`.trim() }))].map(
                (opt, i) => {
                  const selected = vehicleId === opt.id;
                  return (
                    <View key={opt.id ?? "all"}>
                      {i > 0 ? <View style={s.divider} /> : null}
                      <Pressable
                        onPress={() => setVehicleId(opt.id)}
                        style={({ pressed }) => [s.option, pressed && s.pressed]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        accessibilityLabel={opt.name}
                      >
                        <Text style={s.optionText} maxFontSizeMultiplier={fontScaleCap.body}>
                          {opt.name}
                        </Text>
                        {selected ? <Ionicons name="checkmark" size={18} color={colors.amber} /> : null}
                      </Pressable>
                    </View>
                  );
                }
              )}
            </View>
          </>
        ) : null}

        <View style={{ marginTop: 28 }}>
          <Button title={isSet ? "Save" : "Show on Home"} onPress={save} fullWidth />
        </View>
        {isSet ? (
          <View style={{ marginTop: 12 }}>
            <Button title="Remove insurance miles" variant="ghost" onPress={remove} fullWidth />
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48 },
  intro: { fontSize: 15, fontFamily: fonts.regular, color: colors.text2, lineHeight: 22 },
  label: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text2, marginBottom: 6, marginTop: 20 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    fontFamily: fonts.regular,
    color: colors.text1,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  error: { fontSize: 13, fontFamily: fonts.medium, color: colors.red, marginTop: 6 },
  hint: { fontSize: 13, fontFamily: fonts.regular, color: colors.text3, marginTop: 6, lineHeight: 18 },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: "hidden",
  },
  option: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16 },
  optionText: { fontSize: 15, fontFamily: fonts.medium, color: colors.text1 },
  pressed: { backgroundColor: "rgba(255,255,255,0.04)" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline, marginLeft: 16 },
});
