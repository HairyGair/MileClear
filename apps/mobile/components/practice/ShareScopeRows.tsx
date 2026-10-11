// "They'll be able to see": the five rows on the consent sheet, reused when
// the driver changes what a practice can see. Business trips and the
// mileage claim are always shared; earnings, expenses and personal trips
// are the driver's switches (personal off by default).

import { StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, fontScaleCap, radii } from "../../lib/theme";
import { haptic } from "../../lib/haptics";
import type { ShareScopes } from "../../lib/api/practice";

function Row({
  icon,
  label,
  value,
  onChange,
  border,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: boolean | "always";
  onChange?: (v: boolean) => void;
  border: boolean;
}) {
  return (
    <View style={[s.row, border && s.border]}>
      <View style={s.iconTile}>
        <Ionicons name={icon} size={18} color={colors.text2} accessible={false} />
      </View>
      <Text style={s.label} maxFontSizeMultiplier={fontScaleCap.body}>
        {label}
      </Text>
      {value === "always" ? (
        <Text style={s.always} maxFontSizeMultiplier={fontScaleCap.body} accessibilityLabel={`${label}, always shared`}>
          Always
        </Text>
      ) : (
        <Switch
          value={value}
          onValueChange={(v) => {
            haptic("selection");
            onChange?.(v);
          }}
          trackColor={{ true: colors.amber, false: "rgba(255,255,255,0.10)" }}
          thumbColor={value ? colors.bg : undefined}
          accessibilityLabel={`${label}, ${value ? "shared" : "not shared"}`}
        />
      )}
    </View>
  );
}

export function ShareScopeRows({
  scopes,
  onChange,
  isEmployee,
}: {
  scopes: ShareScopes;
  onChange: (next: ShareScopes) => void;
  isEmployee: boolean;
}) {
  const rows = [
    { key: "biz", icon: "car-outline" as const, label: "Business trips", value: "always" as const },
    ...(isEmployee
      ? []
      : [
          {
            key: "earn",
            icon: "cash-outline" as const,
            label: "Earnings",
            value: scopes.shareEarnings,
            onChange: (v: boolean) => onChange({ ...scopes, shareEarnings: v }),
          },
        ]),
    {
      key: "exp",
      icon: "receipt-outline" as const,
      label: "Expenses",
      value: scopes.shareExpenses,
      onChange: (v: boolean) => onChange({ ...scopes, shareExpenses: v }),
    },
    { key: "veh", icon: "briefcase-outline" as const, label: "Vehicles and mileage claim", value: "always" as const },
    {
      key: "pers",
      icon: "map-outline" as const,
      label: "Personal trips",
      value: scopes.sharePersonalTrips,
      onChange: (v: boolean) => onChange({ ...scopes, sharePersonalTrips: v }),
    },
  ];
  return (
    <View>
      <View style={s.card}>
        {rows.map((r, i) => (
          <Row
            key={r.key}
            icon={r.icon}
            label={r.label}
            value={r.value}
            onChange={"onChange" in r ? r.onChange : undefined}
            border={i < rows.length - 1}
          />
        ))}
      </View>
      <Text style={s.help} maxFontSizeMultiplier={fontScaleCap.body}>
        {scopes.sharePersonalTrips
          ? "Turn on if your accountant works out your business-use percentage. They'll see dates, miles and places."
          : "Personal trips stay private unless you turn them on."}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: "hidden",
  },
  row: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 8 },
  border: { borderBottomWidth: 1, borderBottomColor: colors.surfaceBorder },
  iconTile: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  label: { flex: 1, fontSize: 15, fontFamily: fonts.medium, color: colors.text1 },
  always: { fontSize: 14, fontFamily: fonts.medium, color: colors.text2 },
  help: { marginTop: 8, marginHorizontal: 4, fontSize: 13, fontFamily: fonts.regular, color: colors.text2, lineHeight: 18 },
});
