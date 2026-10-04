/**
 * Ticket defender (Pro, Oct 2026).
 *
 * (A) A driver gets a penalty notice weeks later (bus lane, parking, moving
 * traffic, Clean Air Zone). They enter the date and time on it, and
 * optionally where and which vehicle. MileClear shows what it recorded
 * around then (POST /ticket-defender/lookup) and can make a PDF record to
 * send with an appeal (GET /ticket-defender/pack, shared like Tax Exports).
 *
 * (B) "Charges to pay": recent trips into a Clean Air Zone or the London
 * ULEZ in a vehicle that may not be exempt, with each zone's pay-by date, a
 * link to the official payment page and an "I've paid" tick.
 *
 * Wording rule: never say the record proves anything or that an appeal will
 * succeed. It is a record of where MileClear recorded the phone.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  formatPence,
  TICKET_NOTICE_TYPES,
  type CazChargeItem,
  type TicketDefenderLookup,
  type TicketNoticeType,
} from "@mileclear/shared";
import {
  downloadTicketPack,
  fetchCazCharges,
  lookupTicketRecord,
  setCazChargePaid,
  type TicketPackParams,
} from "../lib/api/ticketDefender";
import { fetchVehicles, type VehicleWithCaz } from "../lib/api/vehicles";
import { useUser } from "../lib/user/context";
import { usePaywall } from "../components/paywall";
import { DateTimePickerField } from "../components/DateTimePickerField";
import { LocationPickerField } from "../components/LocationPickerField";
import { Button } from "../components/Button";
import { colors, fonts } from "../lib/theme";
import { haptic } from "../lib/haptics";

const BG = colors.bg;
const CARD_BG = colors.surface;
const BORDER = colors.surfaceBorder;
const AMBER = colors.amber;
const GREEN = colors.green;
const RED = colors.red;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-10-05" -> "Mon 5 Oct". Pure string maths, no time zone involved. */
function dayLabel(day: string): string {
  const [y, m, d] = day.split("-").map((n) => parseInt(n, 10));
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday} ${d} ${MONTHS[m - 1]}`;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function deadlineText(c: CazChargeItem): string {
  if (!c.deadline) return "Check the zone's website for when to pay.";
  const day = dayLabel(c.deadline.deadlineDay);
  return c.zoneId === "london-ulez" ? `Pay by midnight at the end of ${day}` : `Pay by 11:59pm on ${day}`;
}

function payLabel(c: CazChargeItem): string {
  return c.deadline?.payUrl.includes("tfl.gov.uk") ? "Pay on TfL" : "Pay on GOV.UK";
}

// ── Screen ────────────────────────────────────────────────────────────────

export default function TicketDefenderScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ at?: string }>();
  const { user } = useUser();
  const { showPaywall } = usePaywall();
  const isPremium = !!user?.isPremium;

  const initialAt = useMemo(() => {
    if (!params.at) return null;
    const d = new Date(params.at);
    return Number.isFinite(d.getTime()) ? d : null;
  }, [params.at]);

  const [noticeType, setNoticeType] = useState<TicketNoticeType | null>(null);
  const [at, setAt] = useState<Date | null>(initialAt);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [postcode, setPostcode] = useState("");
  const [vehicles, setVehicles] = useState<VehicleWithCaz[]>([]);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [issuer, setIssuer] = useState("");

  const [looking, setLooking] = useState(false);
  const [result, setResult] = useState<TicketDefenderLookup | null>(null);
  const [downloading, setDownloading] = useState(false);

  const [charges, setCharges] = useState<CazChargeItem[] | null>(null);
  const [chargesError, setChargesError] = useState(false);
  const [ticking, setTicking] = useState<string | null>(null);

  useEffect(() => {
    if (!isPremium) return;
    fetchVehicles()
      .then((r) => setVehicles(r.data))
      .catch(() => {});
    fetchCazCharges()
      .then((r) => setCharges(r.data))
      .catch(() => setChargesError(true));
  }, [isPremium]);

  const requestParams = useCallback((): TicketPackParams | null => {
    if (!at) return null;
    const pc = postcode.trim();
    return {
      at: at.toISOString(),
      ...(lat != null && lng != null
        ? { lat, lng, locationLabel: address ?? undefined }
        : pc
          ? { postcode: pc }
          : {}),
      ...(vehicleId ? { vehicleId } : {}),
    };
  }, [at, lat, lng, address, postcode, vehicleId]);

  const handleLookup = useCallback(async () => {
    const p = requestParams();
    if (!p || looking) return;
    setLooking(true);
    try {
      const res = await lookupTicketRecord(p);
      setResult(res.data);
      haptic("success");
    } catch (err) {
      Alert.alert("Couldn't look that up", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setLooking(false);
    }
  }, [requestParams, looking]);

  const handleDownload = useCallback(async () => {
    const p = requestParams();
    if (!p || downloading) return;
    setDownloading(true);
    try {
      await downloadTicketPack({
        ...p,
        ...(noticeType ? { noticeType } : {}),
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        ...(issuer.trim() ? { issuer: issuer.trim() } : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Download failed";
      if (msg === "Premium subscription required") {
        showPaywall("ticket_defender");
        return;
      }
      Alert.alert("Couldn't make the PDF", "Please try again in a moment.");
    } finally {
      setDownloading(false);
    }
  }, [requestParams, downloading, noticeType, reference, issuer, showPaywall]);

  const togglePaid = useCallback(
    async (c: CazChargeItem) => {
      if (ticking) return;
      const nextPaid = c.status !== "paid";
      setTicking(c.key);
      try {
        await setCazChargePaid(c.tripIds[0], c.zoneId, nextPaid);
        haptic("selection");
        const r = await fetchCazCharges();
        setCharges(r.data);
      } catch {
        Alert.alert("Couldn't save that", "Please try again.");
      } finally {
        setTicking(null);
      }
    },
    [ticking]
  );

  // ── Gates ───────────────────────────────────────────────────────────────

  if (!user) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: "Ticket defender" }} />
        <View style={styles.centreBox}>
          <ActivityIndicator size="large" color={AMBER} accessibilityLabel="Loading" />
        </View>
      </View>
    );
  }

  if (!isPremium) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: "Ticket defender" }} />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.lockBadge, { alignSelf: "center", marginTop: 12 }]}>
            <Ionicons name="shield-checkmark-outline" size={28} color={AMBER} />
          </View>
          <Text style={styles.centreTitle}>Got a fine you don't recognise?</Text>
          <Text style={styles.centreBody}>
            Enter the date and time on a bus lane, parking or Clean Air Zone notice. MileClear shows
            where it recorded your phone around then, how fast it was moving and how accurate the GPS
            was, and makes a PDF record you can send with an appeal. It also lists Clean Air Zone
            charges you may need to pay, with the date to pay by.
          </Text>
          <View style={styles.card}>
            <Text style={styles.exampleTag}>EXAMPLE</Text>
            <Text style={styles.summaryLine}>
              At 14:32 on Tue 15 Sep MileClear recorded your Vauxhall Astra near Durham Road,
              Gateshead, 1.2 miles from the location on the notice, moving at about 24 mph.
            </Text>
            <Text style={styles.summaryLine}>GPS accuracy around that time was about 8 metres.</Text>
          </View>
          <Button title="See Pro" icon="star" onPress={() => showPaywall("ticket_defender")} style={{ marginTop: 20 }} />
          <Text style={styles.smallPrint}>
            MileClear only knows where your phone was. This is a record, not legal advice.
          </Text>
        </ScrollView>
      </View>
    );
  }

  // ── Pro ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Ticket defender" }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.heading}>Check a fine</Text>
          <Text style={styles.subheading}>
            Enter the date and time on the notice. MileClear shows what it recorded within an hour
            either side.
          </Text>

          <Text style={styles.label}>Type of notice</Text>
          <View style={styles.chipRow}>
            {TICKET_NOTICE_TYPES.map((t) => {
              const on = noticeType === t.value;
              return (
                <TouchableOpacity
                  key={t.value}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => setNoticeType(on ? null : t.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <DateTimePickerField
            label="Date and time on the notice"
            value={at}
            onChange={(d) => {
              setAt(d);
              setResult(null);
            }}
            maximumDate={new Date()}
            hideNow
          />

          <LocationPickerField
            label="Where (optional)"
            lat={lat}
            lng={lng}
            address={address}
            onLocationChange={(la, ln, addr) => {
              setLat(la);
              setLng(ln);
              setAddress(addr);
              setPostcode("");
              setResult(null);
            }}
            onClear={() => {
              setLat(null);
              setLng(null);
              setAddress(null);
              setResult(null);
            }}
          />
          {lat == null && (
            <TextInput
              style={styles.input}
              placeholder="Or type the postcode from the notice"
              placeholderTextColor={TEXT_3}
              value={postcode}
              onChangeText={(v) => {
                setPostcode(v);
                setResult(null);
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={9}
              accessibilityLabel="Postcode from the notice"
            />
          )}

          {vehicles.length > 1 && (
            <>
              <Text style={styles.label}>Vehicle</Text>
              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, vehicleId == null && styles.chipOn]}
                  onPress={() => setVehicleId(null)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.chipText, vehicleId == null && styles.chipTextOn]}>Any</Text>
                </TouchableOpacity>
                {vehicles.map((v) => {
                  const on = vehicleId === v.id;
                  return (
                    <TouchableOpacity
                      key={v.id}
                      style={[styles.chip, on && styles.chipOn]}
                      onPress={() => {
                        setVehicleId(v.id);
                        setResult(null);
                      }}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>
                        {v.registrationPlate ?? `${v.make} ${v.model}`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          <Button
            title="Find my record"
            icon="search"
            onPress={handleLookup}
            loading={looking}
            disabled={!at}
            style={{ marginTop: 20 }}
          />

          {result && (
            <ResultCard
              result={result}
              reference={reference}
              issuer={issuer}
              onReference={setReference}
              onIssuer={setIssuer}
              onDownload={handleDownload}
              downloading={downloading}
              onOpenTrip={(id) => router.push(`/trip-form?id=${id}` as never)}
            />
          )}

          <ChargesSection
            charges={charges}
            error={chargesError}
            ticking={ticking}
            onTogglePaid={togglePaid}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Result ────────────────────────────────────────────────────────────────

function ResultCard({
  result,
  reference,
  issuer,
  onReference,
  onIssuer,
  onDownload,
  downloading,
  onOpenTrip,
}: {
  result: TicketDefenderLookup;
  reference: string;
  issuer: string;
  onReference: (v: string) => void;
  onIssuer: (v: string) => void;
  onDownload: () => void;
  downloading: boolean;
  onOpenTrip: (id: string) => void;
}) {
  const n = result.nearestInTime;
  const icon =
    result.status === "recorded" ? "navigate-circle-outline" : result.status === "manual_only" ? "create-outline" : "help-circle-outline";
  return (
    <View style={[styles.card, { marginTop: 20 }]}>
      <View style={styles.cardHeader}>
        <Ionicons name={icon} size={20} color={AMBER} />
        <Text style={styles.cardTitle}>What MileClear recorded</Text>
      </View>

      {result.summary.map((line, i) => (
        <Text key={i} style={styles.summaryLine}>
          {line}
        </Text>
      ))}

      {n && (
        <View style={styles.statRow}>
          <Stat label="Recorded at" value={timeLabel(n.recordedAt)} />
          <Stat label="Speed" value={n.speedMph == null ? "Unknown" : `${n.speedMph} mph`} />
          <Stat label="GPS accuracy" value={n.accuracy == null ? "Unknown" : `${Math.round(n.accuracy)} m`} />
        </View>
      )}

      {result.trips.length > 0 && (
        <View style={{ marginTop: 12 }}>
          <Text style={styles.sectionLabel}>JOURNEYS AROUND THEN</Text>
          {result.trips.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={styles.tripRow}
              onPress={() => onOpenTrip(t.id)}
              accessibilityRole="button"
              accessibilityLabel={`Open the journey at ${timeLabel(t.startedAt)}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.tripTime}>
                  {timeLabel(t.startedAt)}
                  {t.endedAt ? ` to ${timeLabel(t.endedAt)}` : ""} · {t.distanceMiles.toFixed(1)} mi
                </Text>
                <Text style={styles.tripPlaces} numberOfLines={1}>
                  {[t.startAddress, t.endAddress].filter(Boolean).join(" to ") || (t.isManualEntry ? "Entered by hand" : "Recorded journey")}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={TEXT_3} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={{ marginTop: 12 }}>
        {result.caveats.map((c, i) => (
          <Text key={i} style={styles.caveat}>
            {c}
          </Text>
        ))}
      </View>

      <Text style={[styles.sectionLabel, { marginTop: 16 }]}>FOR THE PDF (OPTIONAL)</Text>
      <TextInput
        style={styles.input}
        placeholder="Notice reference (PCN number)"
        placeholderTextColor={TEXT_3}
        value={reference}
        onChangeText={onReference}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={40}
      />
      <TextInput
        style={styles.input}
        placeholder="Issued by (for example, the council)"
        placeholderTextColor={TEXT_3}
        value={issuer}
        onChangeText={onIssuer}
        maxLength={80}
      />
      <Button
        title="Download evidence pack"
        icon="document-text-outline"
        variant="secondary"
        onPress={onDownload}
        loading={downloading}
        style={{ marginTop: 12 }}
      />
      <Text style={styles.smallPrint}>
        A PDF record of where MileClear recorded your phone, with the points, speeds and a drawn
        route. It is a record, not legal advice.
      </Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ── Charges to pay ────────────────────────────────────────────────────────

function ChargesSection({
  charges,
  error,
  ticking,
  onTogglePaid,
}: {
  charges: CazChargeItem[] | null;
  error: boolean;
  ticking: string | null;
  onTogglePaid: (c: CazChargeItem) => void;
}) {
  return (
    <View style={{ marginTop: 32 }}>
      <Text style={styles.heading}>Charges to pay</Text>
      <Text style={styles.subheading}>
        Trips in the last 4 weeks that went into a Clean Air Zone or the London ULEZ in a vehicle
        that may not be exempt. One charge per zone per day.
      </Text>

      {charges == null && !error && <ActivityIndicator color={AMBER} style={{ marginVertical: 16 }} />}
      {error && <Text style={styles.caveat}>Couldn't load your charges. Go back and open this screen again.</Text>}
      {charges && charges.length === 0 && (
        <View style={styles.card}>
          <Text style={styles.summaryLine}>No Clean Air Zone or ULEZ charges in the last 4 weeks.</Text>
        </View>
      )}

      {charges?.map((c) => {
        const paid = c.status === "paid";
        const overdue = c.status === "overdue";
        return (
          <View key={c.key} style={[styles.card, { marginBottom: 10 }]}>
            <View style={styles.chargeTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.chargeZone}>{c.zoneName}</Text>
                <Text style={styles.chargeMeta}>
                  {dayLabel(c.travelDay)} · {formatPence(c.chargePence)} daily charge
                  {c.tripIds.length > 1 ? ` · ${c.tripIds.length} trips` : ""}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.paidBtn, paid && styles.paidBtnOn]}
                onPress={() => onTogglePaid(c)}
                disabled={ticking === c.key}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: paid }}
                accessibilityLabel={`I've paid the ${c.zoneName} charge for ${dayLabel(c.travelDay)}`}
              >
                {ticking === c.key ? (
                  <ActivityIndicator size="small" color={AMBER} />
                ) : (
                  <>
                    <Ionicons name={paid ? "checkmark-circle" : "ellipse-outline"} size={16} color={paid ? GREEN : TEXT_2} />
                    <Text style={[styles.paidText, paid && { color: GREEN }]}>I've paid</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {!paid && (
              <Text style={[styles.deadline, overdue && { color: RED }]}>
                {overdue ? "The pay-by date has passed. " : ""}
                {deadlineText(c)}
              </Text>
            )}
            {c.confidence !== "confirmed" && !paid && (
              <Text style={styles.caveat}>
                Based on your vehicle's age, not its exact emissions standard. Check the official checker
                before you pay.
              </Text>
            )}

            {!paid && (
              <View style={styles.linkRow}>
                {c.deadline && (
                  <TouchableOpacity onPress={() => Linking.openURL(c.deadline!.payUrl)} accessibilityRole="link">
                    <Text style={styles.link}>{payLabel(c)}</Text>
                  </TouchableOpacity>
                )}
                {c.infoUrl && (
                  <TouchableOpacity onPress={() => Linking.openURL(c.infoUrl!)} accessibilityRole="link">
                    <Text style={styles.link}>Zone website</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        );
      })}

      {charges && charges.length > 0 && (
        <Text style={styles.smallPrint}>
          Worked out from your vehicle's emissions and the zone boundary. If you're not sure, use the
          official checker. Zone boundaries © OpenStreetMap contributors, Transport for London and
          local councils.
        </Text>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content: { padding: 16, paddingBottom: 56 },
  centreBox: { flex: 1, justifyContent: "center", alignItems: "center", padding: 28 },
  lockBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.amberDim,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  centreTitle: { fontSize: 20, fontFamily: fonts.bold, color: TEXT_1, textAlign: "center", marginBottom: 10 },
  centreBody: { fontSize: 14, fontFamily: fonts.regular, color: TEXT_2, textAlign: "center", lineHeight: 21, marginBottom: 20 },
  heading: { fontSize: 22, fontFamily: fonts.bold, color: TEXT_1, marginTop: 8, marginBottom: 6 },
  subheading: { fontSize: 14, fontFamily: fonts.regular, color: TEXT_2, lineHeight: 21, marginBottom: 8 },
  label: { fontSize: 14, fontFamily: fonts.semibold, color: TEXT_2, marginTop: 16, marginBottom: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
  },
  chipOn: { backgroundColor: colors.amberDim, borderColor: AMBER },
  chipText: { fontSize: 13, fontFamily: fonts.medium, color: TEXT_2 },
  chipTextOn: { color: AMBER },
  input: {
    backgroundColor: CARD_BG,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 10,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: TEXT_1,
  },
  card: { backgroundColor: CARD_BG, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 16 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  cardTitle: { fontSize: 16, fontFamily: fonts.bold, color: TEXT_1 },
  exampleTag: { fontSize: 11, fontFamily: fonts.bold, color: TEXT_3, letterSpacing: 1, marginBottom: 8 },
  summaryLine: { fontSize: 15, fontFamily: fonts.regular, color: TEXT_1, lineHeight: 22, marginBottom: 8 },
  statRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  stat: { flex: 1, backgroundColor: BG, borderRadius: 10, padding: 10, alignItems: "center" },
  statValue: { fontSize: 16, fontFamily: fonts.bold, color: AMBER },
  statLabel: { fontSize: 11, fontFamily: fonts.medium, color: TEXT_3, marginTop: 2 },
  sectionLabel: { fontSize: 11, fontFamily: fonts.bold, color: TEXT_3, letterSpacing: 1, marginBottom: 6 },
  tripRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  tripTime: { fontSize: 14, fontFamily: fonts.semibold, color: TEXT_1 },
  tripPlaces: { fontSize: 13, fontFamily: fonts.regular, color: TEXT_2, marginTop: 2 },
  caveat: { fontSize: 12, fontFamily: fonts.regular, color: TEXT_3, lineHeight: 18, marginTop: 4 },
  smallPrint: { fontSize: 12, fontFamily: fonts.regular, color: TEXT_3, lineHeight: 18, marginTop: 10, textAlign: "center" },
  chargeTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  chargeZone: { fontSize: 15, fontFamily: fonts.bold, color: TEXT_1 },
  chargeMeta: { fontSize: 13, fontFamily: fonts.regular, color: TEXT_2, marginTop: 2 },
  paidBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    minWidth: 92,
    justifyContent: "center",
  },
  paidBtnOn: { borderColor: GREEN, backgroundColor: colors.greenDim },
  paidText: { fontSize: 13, fontFamily: fonts.semibold, color: TEXT_2 },
  deadline: { fontSize: 14, fontFamily: fonts.semibold, color: AMBER, marginTop: 10 },
  linkRow: { flexDirection: "row", gap: 18, marginTop: 10 },
  link: { fontSize: 14, fontFamily: fonts.semibold, color: AMBER, textDecorationLine: "underline" },
});
