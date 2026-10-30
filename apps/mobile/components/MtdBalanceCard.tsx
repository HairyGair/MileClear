import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { formatPence } from "@mileclear/shared";
import { colors, fonts } from "../lib/theme";
import { fetchHmrcBalance, type HmrcBalance } from "../lib/api/hmrc";
import { isApiError } from "../lib/api";
import { isNotSignedUpError } from "../lib/tax/mtdSignUp";
import { balanceRows, GOVUK_PAY_SELF_ASSESSMENT } from "../lib/tax/mtdBalance";

type Load =
  | { kind: "loading" }
  | { kind: "hidden" }
  | { kind: "failed" }
  | { kind: "ready"; balance: HmrcBalance };

/**
 * "What you owe HMRC" on the quarterly updates screen, from HMRC's Self
 * Assessment account. Hidden while the server has it switched off, and when
 * another card already explains the problem (expired connection, not signed
 * up). `refreshKey` changes on pull-to-refresh.
 */
export function MtdBalanceCard({ refreshKey }: { refreshKey: number }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    fetchHmrcBalance()
      .then((res) => {
        if (!alive) return;
        const { available, balance } = res.data;
        setLoad(available && balance ? { kind: "ready", balance } : { kind: "hidden" });
      })
      .catch((err) => {
        if (!alive) return;
        const handledElsewhere =
          (isApiError(err) && err.code === "HMRC_REAUTH_REQUIRED") || isNotSignedUpError(err);
        setLoad({ kind: handledElsewhere ? "hidden" : "failed" });
      });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  if (load.kind === "loading" || load.kind === "hidden") return null;

  if (load.kind === "failed") {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>What you owe HMRC</Text>
        <Text style={styles.small}>We couldn't check with HMRC just now. Pull down to try again.</Text>
      </View>
    );
  }

  const b = load.balance;
  const rows = balanceRows(b);

  return (
    <View style={[styles.card, b.overduePence > 0 && styles.cardWarn]} accessibilityLabel="What you owe HMRC">
      <Text style={styles.title}>What you owe HMRC</Text>

      {rows.length === 0 ? (
        <View style={styles.clearRow}>
          <Ionicons name="checkmark-circle" size={20} color={colors.green} accessible={false} />
          <Text style={styles.body}>
            {b.nothingYet ? "HMRC hasn't charged you anything yet." : "Nothing to pay right now."}
          </Text>
        </View>
      ) : (
        rows.map((r) => (
          <View key={r.label} style={styles.row} accessible accessibilityLabel={`${r.label}: ${formatPence(r.pence)}${r.when ? `, ${r.when}` : ""}`}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, r.tone === "overdue" && { color: colors.red }]}>{r.label}</Text>
              {r.when && <Text style={styles.small}>{r.when}</Text>}
            </View>
            <Text style={[styles.amount, r.tone === "overdue" && { color: colors.red }]}>{formatPence(r.pence)}</Text>
          </View>
        ))
      )}

      {b.creditPence > 0 && (
        <Text style={styles.body}>You have {formatPence(b.creditPence)} credit with HMRC.</Text>
      )}

      {rows.length > 0 && (
        <TouchableOpacity
          style={styles.primary}
          onPress={() => void WebBrowser.openBrowserAsync(GOVUK_PAY_SELF_ASSESSMENT)}
          accessibilityRole="link"
          accessibilityLabel="Pay on GOV.UK"
        >
          <Text style={styles.primaryText}>Pay on GOV.UK</Text>
          <Ionicons name="open-outline" size={16} color="#000" />
        </TouchableOpacity>
      )}

      <Text style={styles.small}>
        From HMRC, for tax years since you joined Making Tax Digital. Earlier years are in your HMRC online account.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginTop: 16, gap: 8 },
  cardWarn: { borderWidth: 1, borderColor: colors.red },
  title: { color: colors.text1, fontSize: 16, fontFamily: fonts.bold },
  body: { color: colors.text2, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, flexShrink: 1 },
  small: { color: colors.text3, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular },
  clearRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowLabel: { color: colors.text1, fontSize: 15, fontFamily: fonts.semibold },
  amount: { color: colors.text1, fontSize: 17, fontFamily: fonts.bold },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.amber,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  primaryText: { color: "#000", fontSize: 15, fontFamily: fonts.semibold },
});
