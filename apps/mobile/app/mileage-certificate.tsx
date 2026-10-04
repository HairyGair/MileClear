import { useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  CERTIFICATE_PURPOSES,
  CERTIFICATE_STATEMENT,
  formatCertificateCode,
  formatCertificateDate,
  getTaxYear,
  parseTaxYear,
  toCertificateDate,
  type CertificatePurpose,
  type MileageCertificatePreview,
  type MileageCertificateSummary,
} from "@mileclear/shared";
import {
  createCertificate,
  fetchCertificates,
  previewCertificate,
  revokeCertificate,
  shareCertificatePdf,
} from "../lib/api/certificates";
import { fetchVehicles, type VehicleWithCaz } from "../lib/api/vehicles";
import { useUser } from "../lib/user/context";
import { usePaywall } from "../components/paywall";
import { DateTimePickerField } from "../components/DateTimePickerField";
import { colors, fonts, fontScaleCap, radii, shared, spacing } from "../lib/theme";

/**
 * Mileage certificate (Pro). A PDF record of the miles recorded for a period,
 * with a code and a link (mileclear.com/verify/<code>) anyone can use to check
 * it. Free drivers see the figures it would carry and a "See Pro" button.
 * The figures are frozen when it is made; the driver can withdraw it here.
 */

type PeriodChoice = { kind: "taxYear"; taxYear: string } | { kind: "custom" };

function recentTaxYears(count: number): string[] {
  const start = parseInt(getTaxYear(new Date()).slice(0, 4), 10);
  return Array.from({ length: count }, (_, i) => `${start - i}-${String(start - i + 1).slice(2)}`);
}

function miles(n: number): string {
  return `${n.toLocaleString("en-GB", { maximumFractionDigits: 1 })} mi`;
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
}

function shortIsoDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function vehicleName(v: VehicleWithCaz): string {
  const plate = v.registrationPlate ? ` (${v.registrationPlate.toUpperCase()})` : "";
  return `${v.make} ${v.model}${plate}`;
}

export default function MileageCertificateScreen() {
  const { user } = useUser();
  const { showPaywall } = usePaywall();
  const isPremium = !!user?.isPremium;

  const taxYears = useMemo(() => recentTaxYears(4), []);
  const currentTaxYear = taxYears[0];
  const [period, setPeriod] = useState<PeriodChoice>({ kind: "taxYear", taxYear: taxYears[1] });
  const [fromDate, setFromDate] = useState<Date>(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d;
  });
  const [toDate, setToDate] = useState<Date>(() => new Date());
  const [vehicles, setVehicles] = useState<VehicleWithCaz[]>([]);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<CertificatePurpose | null>(null);

  const [preview, setPreview] = useState<MileageCertificatePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [certs, setCerts] = useState<MileageCertificateSummary[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const range = useMemo(() => {
    if (period.kind === "taxYear") {
      const { start, end } = parseTaxYear(period.taxYear);
      return { periodStart: toCertificateDate(start), periodEnd: toCertificateDate(end) };
    }
    return { periodStart: toCertificateDate(fromDate), periodEnd: toCertificateDate(toDate) };
  }, [period, fromDate, toDate]);

  const loadCerts = useCallback(async () => {
    if (!isPremium) return;
    try {
      const res = await fetchCertificates();
      setCerts(res.data);
    } catch {
      // The list is a convenience; the rest of the screen still works.
    }
  }, [isPremium]);

  useFocusEffect(
    useCallback(() => {
      fetchVehicles()
        .then((res) => setVehicles(res.data))
        .catch(() => {});
      loadCerts();
    }, [loadCerts])
  );

  // Figures for the current choices, a moment after the last change.
  useEffect(() => {
    let cancelled = false;
    setPreviewLoading(true);
    const t = setTimeout(() => {
      previewCertificate({ ...range, vehicleId })
        .then((res) => {
          if (cancelled) return;
          setPreview(res.data);
          setPreviewError(null);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setPreview(null);
          setPreviewError(err instanceof Error ? err.message : "Couldn't load your figures.");
        })
        .finally(() => {
          if (!cancelled) setPreviewLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [range, vehicleId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCerts();
    setRefreshing(false);
  }, [loadCerts]);

  const share = useCallback(async (cert: MileageCertificateSummary) => {
    setBusyId(cert.id);
    try {
      await shareCertificatePdf(cert);
    } catch (err) {
      Alert.alert("Couldn't share the PDF", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusyId(null);
    }
  }, []);

  const shareLink = useCallback((cert: MileageCertificateSummary) => {
    Share.share({
      message: `My MileClear mileage record (code ${formatCertificateCode(cert.code)}): ${cert.verifyUrl}`,
    }).catch(() => {});
  }, []);

  const withdraw = useCallback(
    (cert: MileageCertificateSummary) => {
      Alert.alert(
        "Withdraw this certificate?",
        "Anyone who opens its link will see that you withdrew it, and none of the figures. This can't be undone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Withdraw",
            style: "destructive",
            onPress: async () => {
              setBusyId(cert.id);
              try {
                const res = await revokeCertificate(cert.id);
                setCerts((list) => list.map((c) => (c.id === cert.id ? res.data : c)));
              } catch (err) {
                Alert.alert("Couldn't withdraw it", err instanceof Error ? err.message : "Please try again.");
              } finally {
                setBusyId(null);
              }
            },
          },
        ]
      );
    },
    []
  );

  const create = useCallback(async () => {
    if (!isPremium) {
      showPaywall("mileage_certificate");
      return;
    }
    setCreating(true);
    try {
      const res = await createCertificate({ ...range, vehicleId, purpose });
      setCerts((list) => [res.data, ...list]);
      Alert.alert(
        "Certificate made",
        `Code ${formatCertificateCode(res.data.code)}. Share the PDF, or send the link so they can check it themselves.`,
        [
          { text: "Later", style: "cancel" },
          { text: "Share link", onPress: () => shareLink(res.data) },
          { text: "Share PDF", onPress: () => share(res.data) },
        ]
      );
    } catch (err) {
      const e = err as { code?: string; message?: string };
      if (e.code === "PREMIUM_REQUIRED") {
        showPaywall("mileage_certificate");
        return;
      }
      Alert.alert("Couldn't make the certificate", e.message ?? "Please try again.");
    } finally {
      setCreating(false);
    }
  }, [isPremium, range, vehicleId, purpose, showPaywall, share, shareLink]);

  const periodLine = preview
    ? `${formatCertificateDate(preview.periodStart)} to ${formatCertificateDate(preview.periodEnd)}`
    : `${formatCertificateDate(range.periodStart)} to ${formatCertificateDate(range.periodEnd)}`;
  const noTrips = !!preview && preview.trips === 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.amber} />}
    >
      <Text style={styles.intro} maxFontSizeMultiplier={fontScaleCap.body}>
        A PDF of the miles you have recorded, with a link anyone can use to check it. Useful for an
        insurer (business use), an employer, an accountant, or someone buying your car.
      </Text>

      {/* Period */}
      <Text style={styles.label}>Period</Text>
      <View style={styles.chips}>
        {taxYears.map((ty) => {
          const active = period.kind === "taxYear" && period.taxYear === ty;
          return (
            <TouchableOpacity
              key={ty}
              style={[shared.chip, active && shared.chipActive]}
              onPress={() => setPeriod({ kind: "taxYear", taxYear: ty })}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[shared.chipText, active && shared.chipTextActive]}>
                {ty === currentTaxYear ? `${ty} so far` : ty}
              </Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={[shared.chip, period.kind === "custom" && shared.chipActive]}
          onPress={() => setPeriod({ kind: "custom" })}
          accessibilityRole="button"
          accessibilityState={{ selected: period.kind === "custom" }}
        >
          <Text style={[shared.chipText, period.kind === "custom" && shared.chipTextActive]}>Custom dates</Text>
        </TouchableOpacity>
      </View>
      {period.kind === "custom" && (
        <View style={styles.dates}>
          <DateTimePickerField label="From" value={fromDate} onChange={setFromDate} maximumDate={toDate} mode="date" hideNow />
          <DateTimePickerField label="To" value={toDate} onChange={setToDate} maximumDate={new Date()} mode="date" />
        </View>
      )}

      {/* Vehicle */}
      {vehicles.length > 0 && (
        <>
          <Text style={styles.label}>Vehicle</Text>
          <View style={styles.chips}>
            <TouchableOpacity
              style={[shared.chip, vehicleId === null && shared.chipActive]}
              onPress={() => setVehicleId(null)}
              accessibilityRole="button"
              accessibilityState={{ selected: vehicleId === null }}
            >
              <Text style={[shared.chipText, vehicleId === null && shared.chipTextActive]}>All vehicles</Text>
            </TouchableOpacity>
            {vehicles.map((v) => (
              <TouchableOpacity
                key={v.id}
                style={[shared.chip, vehicleId === v.id && shared.chipActive]}
                onPress={() => setVehicleId(v.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: vehicleId === v.id }}
              >
                <Text style={[shared.chipText, vehicleId === v.id && shared.chipTextActive]}>{vehicleName(v)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Purpose */}
      <Text style={styles.label}>Who is it for?</Text>
      <View style={styles.chips}>
        {CERTIFICATE_PURPOSES.map((p) => {
          const active = purpose === p.value;
          return (
            <TouchableOpacity
              key={p.value}
              style={[shared.chip, active && shared.chipActive]}
              onPress={() => setPurpose(active ? null : p.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[shared.chipText, active && shared.chipTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.hint}>Printed at the top of the certificate. Optional.</Text>

      {/* Preview */}
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Ionicons name="ribbon-outline" size={18} color={colors.amber} />
          <Text style={styles.cardTitle}>What it will say</Text>
          {previewLoading && <ActivityIndicator size="small" color={colors.amber} style={{ marginLeft: "auto" }} />}
        </View>
        <Text style={styles.cardSub}>{periodLine}</Text>
        {previewError ? (
          <Text style={styles.error}>{previewError}</Text>
        ) : preview ? (
          <>
            <Text style={styles.bigNumber} maxFontSizeMultiplier={fontScaleCap.display}>
              {miles(preview.totalMiles)}
            </Text>
            <Text style={styles.cardSub}>
              {plural(preview.trips, "trip", "trips")}
              {preview.trips > 0 ? `, ${preview.gpsMilesPercent}% of the miles recorded by GPS` : ""}
            </Text>
            <View style={styles.rows}>
              <Row label="Business" value={miles(preview.businessMiles)} />
              <Row label="Personal" value={miles(preview.personalMiles)} />
              <Row label="Not yet marked" value={miles(preview.unclassifiedMiles)} />
              <Row label="Recorded by GPS" value={`${plural(preview.gpsTrips, "trip", "trips")}, ${miles(preview.gpsMiles)}`} />
              <Row label="Added by hand" value={`${plural(preview.manualTrips, "trip", "trips")}, ${miles(preview.manualMiles)}`} />
              {preview.firstTripAt && preview.lastTripAt && (
                <Row label="Trips from" value={`${shortIsoDate(preview.firstTripAt)} to ${shortIsoDate(preview.lastTripAt)}`} />
              )}
              <Row
                label={preview.vehicles.length > 1 ? "Vehicles" : "Vehicle"}
                value={
                  preview.vehicles.length === 0
                    ? "None set on these trips"
                    : preview.vehicles.map((v) => `${v.make} ${v.model}`).join(", ")
                }
              />
              <Row label="Name" value={preview.driverName} />
            </View>
            {preview.unclassifiedMiles > 0 && (
              <Text style={styles.hint}>
                Some miles are not marked business or personal yet. If that matters to whoever you are
                sending it to, mark those trips first.
              </Text>
            )}
          </>
        ) : null}
      </View>

      <TouchableOpacity
        style={[styles.primary, (creating || noTrips || !!previewError) && isPremium && styles.primaryDisabled]}
        onPress={create}
        disabled={creating || (isPremium && (noTrips || !!previewError))}
        accessibilityRole="button"
        accessibilityLabel={isPremium ? "Create certificate" : "See Pro"}
      >
        {creating ? (
          <ActivityIndicator color={colors.bg} />
        ) : (
          <Text style={styles.primaryText}>{isPremium ? "Create certificate" : "See Pro"}</Text>
        )}
      </TouchableOpacity>
      {!isPremium && (
        <Text style={styles.hint}>Certificates are part of MileClear Pro. The figures above are free to look at.</Text>
      )}

      {/* Issued */}
      {isPremium && certs.length > 0 && (
        <>
          <Text style={[shared.sectionTitle, { marginTop: spacing.xxl }]}>Your certificates</Text>
          {certs.map((c) => {
            const withdrawn = !!c.revokedAt;
            const busy = busyId === c.id;
            return (
              <View key={c.id} style={[styles.card, withdrawn && { opacity: 0.6 }]}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle}>
                    {c.taxYear ? `Tax year ${c.taxYear}` : `${formatCertificateDate(c.periodStart)} to ${formatCertificateDate(c.periodEnd)}`}
                  </Text>
                  {withdrawn && <Text style={styles.badge}>Withdrawn</Text>}
                </View>
                <Text style={styles.cardSub}>
                  {miles(c.totalMiles)}, {plural(c.trips, "trip", "trips")} · {c.vehicleLabel}
                </Text>
                <Text style={styles.meta}>
                  Made {shortIsoDate(c.createdAt)} · {formatCertificateCode(c.code)}
                </Text>
                {!withdrawn && (
                  <View style={styles.actions}>
                    <Action icon="document-outline" label="Share PDF" onPress={() => share(c)} busy={busy} />
                    <Action icon="link-outline" label="Share link" onPress={() => shareLink(c)} />
                    <Action icon="close-circle-outline" label="Withdraw" onPress={() => withdraw(c)} danger />
                  </View>
                )}
              </View>
            );
          })}
        </>
      )}

      <Text style={styles.small}>
        {CERTIFICATE_STATEMENT} It shows totals only: no routes or addresses. The link page shows the
        plate with its last letters hidden.
      </Text>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function Action({
  icon,
  label,
  onPress,
  busy,
  danger,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  busy?: boolean;
  danger?: boolean;
}) {
  const color = danger ? colors.red : colors.amber;
  return (
    <TouchableOpacity style={styles.action} onPress={onPress} disabled={busy} accessibilityRole="button" accessibilityLabel={label}>
      {busy ? <ActivityIndicator size="small" color={color} /> : <Ionicons name={icon} size={16} color={color} />}
      <Text style={[styles.actionText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 48 },
  intro: { color: colors.text2, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, marginBottom: spacing.xl },
  label: { color: colors.text1, fontFamily: fonts.semibold, fontSize: 14, marginBottom: spacing.sm, marginTop: spacing.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  dates: { marginTop: spacing.md },
  hint: { color: colors.text3, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, marginTop: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.lg,
    marginTop: spacing.xl,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cardTitle: { color: colors.text1, fontFamily: fonts.bold, fontSize: 15, flexShrink: 1 },
  cardSub: { color: colors.text2, fontFamily: fonts.regular, fontSize: 13, marginTop: spacing.xs },
  bigNumber: { color: colors.amber, fontFamily: fonts.bold, fontSize: 30, marginTop: spacing.md },
  rows: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.subtleBorder, paddingTop: spacing.sm },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, gap: spacing.md },
  rowLabel: { color: colors.text2, fontFamily: fonts.regular, fontSize: 13 },
  rowValue: { color: colors.text1, fontFamily: fonts.semibold, fontSize: 13, flexShrink: 1, textAlign: "right" },
  error: { color: colors.red, fontFamily: fonts.medium, fontSize: 13, marginTop: spacing.md },
  primary: {
    backgroundColor: colors.amber,
    borderRadius: radii.md,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: spacing.xl,
  },
  primaryDisabled: { opacity: 0.5 },
  primaryText: { color: colors.bg, fontFamily: fonts.bold, fontSize: 16 },
  badge: {
    marginLeft: "auto",
    color: colors.text2,
    backgroundColor: colors.surfaceBorder,
    fontFamily: fonts.bold,
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.sm,
    overflow: "hidden",
  },
  meta: { color: colors.text3, fontFamily: fonts.regular, fontSize: 12, marginTop: spacing.xs },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg, marginTop: spacing.md },
  action: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6 },
  actionText: { fontFamily: fonts.semibold, fontSize: 13 },
  small: { color: colors.text3, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, marginTop: spacing.xxl },
});
