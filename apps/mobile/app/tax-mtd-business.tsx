import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  fetchHmrcBusinessDetails,
  setHmrcBusinessId,
  type HmrcBusinessDetails,
} from "../lib/api/hmrc";
import { isApiError } from "../lib/api";
import { BetaBanner } from "../components/BetaBanner";
import { colors, fonts } from "../lib/theme";

const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const BG = colors.bg;

export default function TaxMtdBusinessScreen() {
  const { businessId } = useLocalSearchParams<{ businessId: string }>();
  const [details, setDetails] = useState<HmrcBusinessDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchHmrcBusinessDetails(businessId);
        if (!cancelled) {
          setDetails(res.data);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            isApiError(err) ? err.message : err instanceof Error ? err.message : "Couldn't load business details."
          );
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const onConfirm = useCallback(async () => {
    if (!businessId) return;
    setSubmitting(true);
    try {
      await setHmrcBusinessId(businessId);
      router.back();
    } catch (err) {
      Alert.alert(
        "Couldn't save",
        isApiError(err) ? err.message : err instanceof Error ? err.message : "Try again."
      );
    } finally {
      setSubmitting(false);
    }
  }, [businessId]);

  if (loading) {
    return (
      <View style={[styles.center, { flex: 1, backgroundColor: BG }]}>
        <Stack.Screen options={{ title: "Confirm trade", headerStyle: { backgroundColor: BG }, headerTintColor: TEXT_1 }} />
        <ActivityIndicator color={AMBER} size="large" />
      </View>
    );
  }

  if (error || !details) {
    return (
      <View style={[styles.center, { flex: 1, backgroundColor: BG, padding: 24 }]}>
        <Stack.Screen options={{ title: "Confirm trade", headerStyle: { backgroundColor: BG }, headerTintColor: TEXT_1 }} />
        <Ionicons name="alert-circle-outline" size={48} color={TEXT_3} />
        <Text style={[styles.title, { marginTop: 16 }]}>Couldn't load business details</Text>
        <Text style={styles.body}>{error ?? "Unknown error."}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: BG }} contentContainerStyle={{ padding: 16, paddingBottom: 64 }}>
      <Stack.Screen options={{ title: "Confirm trade", headerStyle: { backgroundColor: BG }, headerTintColor: TEXT_1 }} />
      <BetaBanner
        label="Beta · Sandbox"
        title="HMRC integration is in beta"
        body="MTD submissions currently go to HMRC's test system while we finish production accreditation."
      />
      <View style={styles.card}>
        <Ionicons name="briefcase-outline" size={48} color={AMBER} style={{ alignSelf: "center" }} />
        <Text style={styles.title}>{details.tradingName ?? "Self-Employment"}</Text>
        <Text style={styles.subtitle}>{details.businessId}</Text>

        <View style={styles.divider} />

        <DetailRow label="Type" value={formatBusinessType(details.typeOfBusiness)} />
        {details.accountingType && (
          <DetailRow label="Accounting" value={details.accountingType === "CASH" ? "Cash basis" : "Accruals"} />
        )}
        {details.commencementDate && (
          <DetailRow label="Started" value={formatDate(details.commencementDate)} />
        )}
        {details.cessationDate && (
          <DetailRow label="Ceased" value={formatDate(details.cessationDate)} />
        )}
        {details.businessAddress && (
          <DetailRow label="Address" value={formatAddress(details.businessAddress)} />
        )}

        <View style={styles.divider} />

        <Text style={styles.warningTitle}>Confirm before you continue</Text>
        <Text style={styles.warningBody}>
          MileClear will submit quarterly figures against this trade. If the details
          don't match the work you actually do — make changes via HMRC's Self
          Assessment online before you continue.
        </Text>

        <TouchableOpacity
          style={[styles.primaryButton, submitting && styles.buttonDisabled]}
          onPress={onConfirm}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="This is the right trade"
          accessibilityState={{ disabled: submitting }}
        >
          {submitting ? (
            <ActivityIndicator color="#000" />
          ) : (
            <>
              <Text style={styles.primaryButtonText}>This is the right trade</Text>
              <Ionicons name="checkmark" size={18} color="#000" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function formatBusinessType(t: string): string {
  if (t === "self-employment") return "Self-Employment";
  if (t === "uk-property") return "UK Property";
  if (t === "foreign-property") return "Foreign Property";
  return t;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function formatAddress(addr: HmrcBusinessDetails["businessAddress"]): string {
  if (!addr) return "—";
  return [addr.line1, addr.line2, addr.line3, addr.line4, addr.postalCode]
    .filter(Boolean)
    .join(", ");
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: CARD_BG, borderRadius: 16, padding: 24, gap: 6 },
  title: {
    color: TEXT_1,
    fontSize: 22,
    fontFamily: fonts.bold,
    textAlign: "center",
    marginTop: 8,
  },
  subtitle: {
    color: TEXT_3,
    fontSize: 12,
    fontFamily: fonts.regular,
    textAlign: "center",
  },
  body: { color: TEXT_2, fontSize: 14, textAlign: "center", marginTop: 8, fontFamily: fonts.regular },
  divider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    marginVertical: 16,
  },
  row: { flexDirection: "row", paddingVertical: 8, gap: 12 },
  rowLabel: {
    color: TEXT_3,
    fontSize: 12,
    fontFamily: fonts.semibold,
    width: 96,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  rowValue: { color: TEXT_1, fontSize: 14, fontFamily: fonts.regular, flex: 1 },
  warningTitle: { color: TEXT_1, fontSize: 14, fontFamily: fonts.semibold },
  warningBody: { color: TEXT_2, fontSize: 13, fontFamily: fonts.regular, lineHeight: 19, marginTop: 4 },
  primaryButton: {
    backgroundColor: AMBER,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: "#000", fontFamily: fonts.semibold, fontSize: 16 },
});
