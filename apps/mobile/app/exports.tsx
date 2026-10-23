import { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useFocusEffect, router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  exportProjectChoices,
  exportProjectSlug,
  exportVehicleChoices,
  exportVehicleLabel,
  exportVehicleSlug,
  parseTaxYear,
  type ExportVehicleLike,
} from "@mileclear/shared";
import { fetchProjectLabels } from "../lib/api/trips";
import { PickerSheet, type PickerOption } from "../components/trip/PickerSheet";
import { downloadAndShareExport } from "../lib/api/exports";
import { fetchProfile } from "../lib/api/user";
import { fetchVehicles } from "../lib/api/vehicles";
import { odometerLogCsvPath } from "../lib/api/odometer";
import { dayKeyOf } from "../lib/odometer/logic";
import { usePaywall } from "../components/paywall";
import { DateTimePickerField } from "../components/DateTimePickerField";
import { colors, fonts } from "../lib/theme";
import { useTaxOverview } from "../lib/tax/useTaxOverview";
import { useCountryFeatures } from "../lib/country/country";
import { defaultExportYear, recentTaxYears } from "../lib/tax/taxYears";

// Local theme aliases — same pattern as the (tabs) screens.
const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const BG = colors.bg;
const GREEN = colors.green;
/** The "All vehicles" row in the Which vehicle? sheet. Not a vehicle id. */
const ALL_VEHICLES_KEY = "__all__";
/** The "All clients" row in the Which client? sheet. Not a label (labels are trimmed text). */
const ALL_CLIENTS_KEY = "\u0000all";
/** Fallback wait for the sheet's slide-out when onDismiss doesn't fire (Android). */
const PICKER_DISMISS_MS = 350;

type LoadingKey = "csv" | "pdf" | "self-assessment" | "odometer" | null;

export default function ExportsScreen() {
  const { showPaywall } = usePaywall();
  const taxYears = recentTaxYears(4);
  const overview = useTaxOverview();
  // The return due next while it leads (6 April to 31 January), else this year.
  const [selectedYear, setSelectedYear] = useState(() => defaultExportYear(overview.data, taxYears[0]));
  const [loadingKey, setLoadingKey] = useState<LoadingKey>(null);
  const [isPremium, setIsPremium] = useState<boolean | null>(null);
  // Tax-year vs custom date-range mode for CSV/PDF (the server supports both;
  // self-assessment is always tax-year). Defaults to a sensible last-30-days.
  const [rangeModeChoice, setRangeMode] = useState<"taxYear" | "dateRange">("taxYear");
  // Outside the UK (23 Oct 2026) the UK tax year (6 April) means nothing, so
  // downloads are by date range only and the HMRC rows are hidden.
  const country = useCountryFeatures();
  const rangeMode = country.ukTax ? rangeModeChoice : "dateRange";
  const [fromDate, setFromDate] = useState<Date>(() => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const [toDate, setToDate] = useState<Date>(() => new Date());
  // Business trips only for the CSV and Trip Report (5 Oct 2026). Both used to
  // include every trip, so a report sent to an employer carried the driver's
  // personal drives too (Sarah Webb). On by default; the server already
  // filters on ?classification=business. Self Assessment is business-only
  // by nature and ignores it.
  const [businessOnly, setBusinessOnly] = useState(true);

  useFocusEffect(
    useCallback(() => {
      fetchProfile()
        .then((res) => setIsPremium(res.data.isPremium))
        .catch(() => setIsPremium(false));
    }, [])
  );

  const pickTaxYear = useCallback(() => {
    Alert.alert(
      "Tax year",
      undefined,
      [
        ...taxYears.map((year) => ({
          text: year,
          onPress: () => setSelectedYear(year),
        })),
        { text: "Cancel", style: "cancel" as const },
      ]
    );
  }, [taxYears]);

  const handleDownload = useCallback(
    async (
      type: "csv" | "pdf" | "self-assessment",
      car?: { id: string; slug: string },
      client?: { label: string; slug: string }
    ) => {
      setLoadingKey(type);
      try {
        const ext = type === "csv" ? "csv" : "pdf";
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        const mime =
          type === "csv" ? "text/csv" : "application/pdf";

        // Self-assessment is always a tax-year report. CSV/PDF honour the
        // custom date range when selected, else the tax year.
        const useRange = rangeMode === "dateRange" && type !== "self-assessment";
        const rangeLabel = `${fromDate.toISOString().slice(0, 10)}_${toDate.toISOString().slice(0, 10)}`;
        const carPart = car ? `${car.slug}-` : "";
        const clientPart = client ? `${client.slug}-` : "";
        const filename = `mileclear-${type}-${clientPart}${carPart}${useRange ? rangeLabel : selectedYear}-${date}.${ext}`;
        const base = useRange
          ? `from=${fromDate.toISOString()}&to=${toDate.toISOString()}`
          : `taxYear=${selectedYear}`;
        let param = businessOnly && type !== "self-assessment" ? `${base}&classification=business` : base;
        if (car && type !== "self-assessment") param += `&vehicleId=${encodeURIComponent(car.id)}`;
        // The Self Assessment report is always the whole business.
        if (client && type !== "self-assessment") param += `&projectLabel=${encodeURIComponent(client.label)}`;

        await downloadAndShareExport(
          `/exports/${type}?${param}`,
          filename,
          mime
        );
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Download failed";
        if (msg === "Premium subscription required") {
          showPaywall("exports");
          return;
        }
        Alert.alert("Export failed", msg);
      } finally {
        setLoadingKey(null);
      }
    },
    [selectedYear, rangeMode, fromDate, toDate, showPaywall, businessOnly]
  );

  // "Which vehicle?" as a sheet, not Alert.alert: Android keeps only three
  // Alert buttons (Cancel and the 3rd vehicle onwards were lost) and its Alert
  // can't be dismissed by tapping outside. Closing the sheet downloads nothing.
  // The same sheet asks "Which client?" (23 Oct 2026), before the vehicle.
  const [vehiclePicker, setVehiclePicker] = useState<{
    title: string;
    options: PickerOption[];
    onPick: (key: string) => void;
  } | null>(null);
  // The title stays put while the sheet slides away (the state is already null).
  const pickerTitleRef = useRef("Which vehicle?");
  if (vehiclePicker) pickerTitleRef.current = vehiclePicker.title;
  const pickerTitle = pickerTitleRef.current;
  // Set before the vehicle list is fetched, so a quick double tap can't open
  // two pickers or start two downloads.
  const pickingRef = useRef(false);
  // The chosen download waits until the sheet has gone, so the share sheet or
  // the paywall never tries to open while the picker is still sliding out.
  // iOS tells us (onDismiss); otherwise a timer, long enough for the slide.
  const pendingPickRef = useRef<(() => void) | null>(null);
  const pickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runPendingPick = useCallback(() => {
    if (pickTimerRef.current) {
      clearTimeout(pickTimerRef.current);
      pickTimerRef.current = null;
    }
    const run = pendingPickRef.current;
    pendingPickRef.current = null;
    run?.();
  }, []);

  const closeVehiclePicker = useCallback(() => {
    setVehiclePicker(null);
    if (pendingPickRef.current && !pickTimerRef.current) {
      pickTimerRef.current = setTimeout(runPendingPick, PICKER_DISMISS_MS);
    }
  }, [runPendingPick]);

  useEffect(
    () => () => {
      // Leaving the screen mid-slide: start nothing.
      if (pickTimerRef.current) clearTimeout(pickTimerRef.current);
      pendingPickRef.current = null;
    },
    []
  );

  // Vehicles, and for the trip downloads the Project / client labels too.
  // Null while another tap is being handled.
  const loadChoices = useCallback(
    async (withLabels: boolean): Promise<{ vehicles: ExportVehicleLike[]; labels: string[] } | null> => {
      // Also refuse while a picked download is waiting for the sheet to go.
      if (pickingRef.current || pendingPickRef.current) return null;
      pickingRef.current = true;
      try {
        const [vehicles, labels] = await Promise.all([
          // No list: carry on as with one vehicle / no clients.
          fetchVehicles().then((r) => r.data).catch(() => [] as ExportVehicleLike[]),
          withLabels ? fetchProjectLabels().catch(() => [] as string[]) : Promise.resolve([] as string[]),
        ]);
        return { vehicles, labels };
      } finally {
        pickingRef.current = false;
      }
    },
    []
  );

  const loadVehicles = useCallback(
    async (): Promise<ExportVehicleLike[] | null> => (await loadChoices(false))?.vehicles ?? null,
    [loadChoices]
  );

  // CSV and Trip Report: with tagged trips, ask which client, "All clients"
  // first (23 Oct 2026); with 2+ vehicles, then ask which one, "All vehicles"
  // first (Colin, 17 Oct 2026). Neither: straight through, as before.
  const handleTripDownload = useCallback(
    async (type: "csv" | "pdf") => {
      if (loadingKey !== null) return;
      if (isPremium === false) {
        handleDownload(type);
        return;
      }
      const loaded = await loadChoices(true);
      if (loaded === null) return; // a tap is already being handled
      const { vehicles, labels } = loaded;
      const carChoices = exportVehicleChoices(vehicles);
      const clientChoices = exportProjectChoices(labels);

      const askVehicle = (client?: { label: string; slug: string }) => {
        if (!carChoices) {
          handleDownload(type, undefined, client);
          return;
        }
        setVehiclePicker({
          title: "Which vehicle?",
          options: carChoices.map((c) => ({ key: c.vehicleId ?? ALL_VEHICLES_KEY, label: c.label })),
          onPick: (key) => {
            const v = vehicles.find((x) => x.id === key);
            handleDownload(type, v ? { id: v.id, slug: exportVehicleSlug(v) } : undefined, client);
          },
        });
      };

      if (!clientChoices) {
        askVehicle();
        return;
      }
      setVehiclePicker({
        title: "Which client?",
        options: clientChoices.map((c) => ({ key: c.projectLabel ?? ALL_CLIENTS_KEY, label: c.label })),
        // Runs once this sheet has gone, so the vehicle sheet can open next.
        onPick: (key) =>
          askVehicle(key === ALL_CLIENTS_KEY ? undefined : { label: key, slug: exportProjectSlug(key) }),
      });
    },
    [loadingKey, isPremium, handleDownload, loadChoices]
  );

  // Odometer log CSV (Pro): the same tax year or date range as the other
  // downloads, for the default vehicle, or a chosen one when there are 2+.
  const downloadOdometerLog = useCallback(
    async (vehicleId?: string) => {
      setLoadingKey("odometer");
      try {
        const today = new Date();
        let from: Date;
        let to: Date;
        if (rangeMode === "dateRange") {
          from = fromDate;
          to = toDate;
        } else {
          const { start, end } = parseTaxYear(selectedYear);
          from = start;
          to = end.getTime() > today.getTime() ? today : end;
        }
        const fromKey = dayKeyOf(from);
        const toKey = dayKeyOf(to);
        await downloadAndShareExport(
          odometerLogCsvPath({ vehicleId, from: fromKey, to: toKey }),
          `mileclear-odometer-log-${fromKey}-to-${toKey}.csv`,
          "text/csv"
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Download failed";
        if (msg === "Premium subscription required") {
          showPaywall("odometer_log_csv");
          return;
        }
        Alert.alert("Export failed", msg);
      } finally {
        setLoadingKey(null);
      }
    },
    [rangeMode, fromDate, toDate, selectedYear, showPaywall]
  );

  const handleOdometerLog = useCallback(async () => {
    if (loadingKey !== null) return;
    if (isPremium === false) {
      showPaywall("odometer_log_csv");
      return;
    }
    const vehicles = await loadVehicles();
    if (vehicles === null) return; // a tap is already being handled
    if (vehicles.length > 1) {
      // The odometer belongs to one vehicle, so there is no "All vehicles" here.
      setVehiclePicker({
        title: "Which vehicle?",
        options: vehicles.map((v) => ({ key: v.id, label: exportVehicleLabel(v) })),
        onPick: (key) => downloadOdometerLog(key),
      });
      return;
    }
    downloadOdometerLog(vehicles[0]?.id);
  }, [loadingKey, isPremium, showPaywall, downloadOdometerLog, loadVehicles]);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Downloads",
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {isPremium === false && (
          <TouchableOpacity
            style={styles.paywallBanner}
            onPress={() => showPaywall("exports")}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Upgrade to MileClear Pro"
          >
            <Text style={styles.paywallTitle}>Pro feature</Text>
            <Text style={styles.paywallText}>
              Downloads are part of MileClear Pro.
            </Text>
            <Text style={styles.paywallCta}>Upgrade to Pro</Text>
            <Text style={styles.paywallLegal}>
              Auto-renews monthly. Cancel anytime.
            </Text>
            <View style={styles.paywallLinks}>
              <Text style={styles.paywallLink} onPress={() => WebBrowser.openBrowserAsync("https://mileclear.com/terms")}>Terms of Use</Text>
              <Text style={styles.paywallSep}>|</Text>
              <Text style={styles.paywallLink} onPress={() => WebBrowser.openBrowserAsync("https://mileclear.com/privacy")}>Privacy Policy</Text>
            </View>
          </TouchableOpacity>
        )}

        <Text style={styles.subtitle}>
          Your trips and figures as PDF or CSV, for your records, your accountant or your employer.
        </Text>

        {/* Period mode toggle: tax year or a custom date range */}
        {country.ukTax && <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeBtn, rangeMode === "taxYear" && styles.modeBtnActive]}
            onPress={() => setRangeMode("taxYear")}
            accessibilityRole="button"
            accessibilityState={{ selected: rangeMode === "taxYear" }}
            accessibilityLabel="Export by tax year"
          >
            <Text style={[styles.modeBtnText, rangeMode === "taxYear" && styles.modeBtnTextActive]}>Tax year</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, rangeMode === "dateRange" && styles.modeBtnActive]}
            onPress={() => setRangeMode("dateRange")}
            accessibilityRole="button"
            accessibilityState={{ selected: rangeMode === "dateRange" }}
            accessibilityLabel="Export by custom date range"
          >
            <Text style={[styles.modeBtnText, rangeMode === "dateRange" && styles.modeBtnTextActive]}>Date range</Text>
          </TouchableOpacity>
        </View>}

        {rangeMode === "taxYear" ? (
          <TouchableOpacity
            style={styles.yearPicker}
            onPress={pickTaxYear}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Tax year: ${selectedYear}. Tap to change`}
          >
            <Text style={styles.yearLabel}>Tax year</Text>
            <Text style={styles.yearValue}>{selectedYear}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.rangeFields}>
            <DateTimePickerField label="From" value={fromDate} onChange={setFromDate} maximumDate={toDate} />
            <DateTimePickerField label="To" value={toDate} onChange={setToDate} maximumDate={new Date()} />
            <Text style={styles.rangeNote}>
              {country.selfAssessment
                ? "CSV and PDF reports cover this range. The Self Assessment report is always a full tax year."
                : "CSV and PDF reports cover this range."}
            </Text>
          </View>
        )}

        {/* Self Assessment Wizard link */}
        {country.selfAssessment && <TouchableOpacity
          style={styles.saWizardRow}
          onPress={() => router.push("/self-assessment")}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Open box by box"
        >
          <View style={styles.saWizardIcon}>
            <Ionicons name="document-text-outline" size={20} color={AMBER} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.saWizardTitle}>Box by box</Text>
            <Text style={styles.saWizardDesc}>
              Your income, mileage, expenses and tax estimate, box by box
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={TEXT_3} style={{ marginLeft: 8 }} />
        </TouchableOpacity>}

        {/* Mileage certificate link */}
        {country.ukTax && <TouchableOpacity
          style={styles.saWizardRow}
          onPress={() => router.push("/mileage-certificate")}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Open mileage certificate"
        >
          <View style={styles.saWizardIcon}>
            <Ionicons name="ribbon-outline" size={20} color={AMBER} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.saWizardTitle}>Mileage certificate</Text>
            <Text style={styles.saWizardDesc}>
              A record of your miles with a link anyone can check, for an insurer, employer, accountant or buyer
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={TEXT_3} style={{ marginLeft: 8 }} />
        </TouchableOpacity>}

        {/* Download rows */}
        <Text style={styles.sectionTitle}>Downloads</Text>

        <View style={[styles.row, styles.switchRow]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Business trips only</Text>
            <Text style={styles.rowDesc}>
              {businessOnly
                ? "The CSV and Trip Report leave out personal and unsorted trips. Best for sending to an employer."
                : "The CSV and Trip Report include every trip, personal ones too."}
            </Text>
          </View>
          <Switch
            value={businessOnly}
            onValueChange={setBusinessOnly}
            trackColor={{ true: AMBER }}
            accessibilityLabel="Business trips only in the CSV and Trip Report"
          />
        </View>

        {country.selfAssessment && <TouchableOpacity
          style={styles.row}
          onPress={() => handleDownload("self-assessment")}
          disabled={loadingKey !== null}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Download Self Assessment PDF for tax year"
          accessibilityState={{ disabled: loadingKey !== null }}
        >
          <View style={styles.rowIconWrap}>
            <Ionicons name="shield-checkmark" size={20} color={GREEN} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.rowTitleRow}>
              <Text style={styles.rowTitle}>Self Assessment</Text>
            </View>
            <Text style={styles.rowDesc}>
              A full report with vehicle breakdown, monthly summary and the mileage rates used. Good to hand to your accountant.
            </Text>
          </View>
          {loadingKey === "self-assessment" ? (
            <ActivityIndicator color={AMBER} accessibilityLabel="Loading" />
          ) : (
            <Ionicons name="chevron-forward" size={18} color={TEXT_3} style={{ marginLeft: 8 }} accessible={false} />
          )}
        </TouchableOpacity>}

        <TouchableOpacity
          style={styles.row}
          onPress={() => handleTripDownload("pdf")}
          disabled={loadingKey !== null}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Download Trip Report PDF for tax year"
          accessibilityState={{ disabled: loadingKey !== null }}
        >
          <View style={styles.rowIconWrap}>
            <Ionicons name="document-text" size={20} color={AMBER} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Trip Report (PDF)</Text>
            <Text style={styles.rowDesc}>
              Trip-by-trip report with summary figures and a unique reference number.
            </Text>
          </View>
          {loadingKey === "pdf" ? (
            <ActivityIndicator color={AMBER} accessibilityLabel="Loading" />
          ) : (
            <Ionicons name="chevron-forward" size={18} color={TEXT_3} style={{ marginLeft: 8 }} accessible={false} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.row}
          onPress={() => handleTripDownload("csv")}
          disabled={loadingKey !== null}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Download Trip Data CSV for tax year"
          accessibilityState={{ disabled: loadingKey !== null }}
        >
          <View style={styles.rowIconWrap}>
            <Ionicons name="grid" size={20} color={TEXT_3} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Trip Data (CSV)</Text>
            <Text style={styles.rowDesc}>
              Every trip with the mileage rate applied. Open it in Excel or accounting software.
            </Text>
          </View>
          {loadingKey === "csv" ? (
            <ActivityIndicator color={AMBER} accessibilityLabel="Loading" />
          ) : (
            <Ionicons name="chevron-forward" size={18} color={TEXT_3} style={{ marginLeft: 8 }} accessible={false} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.row}
          onPress={handleOdometerLog}
          disabled={loadingKey !== null}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Download Odometer readings CSV"
          accessibilityState={{ disabled: loadingKey !== null }}
        >
          <View style={styles.rowIconWrap}>
            <Ionicons name="speedometer-outline" size={20} color={TEXT_3} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Odometer readings (CSV)</Text>
            <Text style={styles.rowDesc}>Start and end readings for each day you drove.</Text>
          </View>
          {loadingKey === "odometer" ? (
            <ActivityIndicator color={AMBER} accessibilityLabel="Loading" />
          ) : (
            <Ionicons name="chevron-forward" size={18} color={TEXT_3} style={{ marginLeft: 8 }} accessible={false} />
          )}
        </TouchableOpacity>

        {/* Coming Soon rows (UK accounting, so UK only) */}
        {country.ukTax && <Text style={[styles.sectionTitle, { marginTop: 28 }]}>
          Accounting
        </Text>}

        {(country.ukTax ? ["Xero", "FreeAgent"] : []).map((name) => (
          <View key={name} style={[styles.row, { opacity: 0.5 }]}>
            <View style={{ flex: 1 }}>
              <View style={styles.comingSoonRow}>
                <Text style={styles.rowTitle}>{name}</Text>
                <Text style={styles.comingSoonBadge}>Coming soon</Text>
              </View>
              <Text style={styles.rowDesc}>
                Direct export to {name} is coming soon.
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
      <PickerSheet
        visible={vehiclePicker !== null}
        title={pickerTitle}
        options={vehiclePicker?.options ?? []}
        onPick={(key) => {
          // PickerSheet calls onClose straight after this; the download starts once it has gone.
          const picker = vehiclePicker;
          if (picker) pendingPickRef.current = () => picker.onPick(key);
        }}
        onClose={closeVehiclePicker}
        onDismiss={runPendingPick}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_2,
    marginBottom: 24,
  },
  modeToggle: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: "center",
  },
  modeBtnActive: { backgroundColor: AMBER },
  modeBtnText: { fontFamily: fonts.semibold, fontSize: 13, color: TEXT_2 },
  modeBtnTextActive: { color: BG },
  rangeFields: { marginBottom: 28 },
  rangeNote: { color: TEXT_3, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, marginTop: 4 },
  yearPicker: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  yearLabel: {
    fontSize: 15,
    fontFamily: fonts.regular,
    color: TEXT_2,
  },
  yearValue: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: AMBER,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: "#fff",
    marginBottom: 12,
  },
  row: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  rowIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  switchRow: {
    alignItems: "center",
    gap: 12,
  },
  rowTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  rowTitle: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: "#fff",
    marginBottom: 4,
  },
  rowDesc: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_3,
    lineHeight: 18,
  },
  comingSoonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  comingSoonBadge: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: TEXT_2,
    backgroundColor: "#374151",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  paywallBanner: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: AMBER,
  },
  paywallTitle: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: AMBER,
    marginBottom: 4,
  },
  paywallText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 20,
    marginBottom: 10,
  },
  paywallCta: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: AMBER,
  },
  paywallLegal: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: TEXT_3,
    marginTop: 8,
  },
  paywallLinks: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  paywallLink: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: "#3b82f6",
  },
  paywallSep: {
    fontSize: 11,
    color: TEXT_3,
  },
  saWizardRow: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.2)",
  },
  saWizardIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(245,166,35,0.08)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  saWizardTitle: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: "#fff",
    marginBottom: 3,
  },
  saWizardDesc: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
    lineHeight: 17,
  },
});
