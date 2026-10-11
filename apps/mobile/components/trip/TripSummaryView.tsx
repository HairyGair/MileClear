import { useState, type ReactNode } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  LayoutAnimation,
  UIManager,
  Platform,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GIG_PLATFORMS, BUSINESS_PURPOSES, TRIP_CATEGORY_META, formatPence } from "@mileclear/shared";
import type {
  TripClassification,
  TripCategory,
  PlatformTag,
  BusinessPurpose,
  CazTripAssessment,
} from "@mileclear/shared";
import { TripMapWidget } from "../map/TripMapWidget";
import { MiniRoute } from "../home/MiniRoute";
import { PickerSheet, type PickerOption } from "./PickerSheet";
import { useReducedMotion } from "../../lib/accessibility";
import { dayLabel } from "../../lib/trips/dayOrder";
import { distanceWarning, tripMadeLine } from "../../lib/trips/tripLabels";
import { colors, fonts, radii, fontScaleCap } from "../../lib/theme";

// Maps are invisible in Expo Go; the summary draws its own placeholder then,
// at the same height, so the layout never jumps. Same guard as TripMapWidget.
const hasNativeMap =
  Platform.OS !== "web" && UIManager.getViewManagerConfig?.("AIRMap") != null;

// The destructive text colour from SPEC-VISUAL (7.3:1 on bg).
const DESTRUCTIVE = "#f87171";

interface LatLng {
  lat: number;
  lng: number;
}

export interface TripSummaryViewProps {
  // The trip
  startedAt: Date;
  endedAt: Date | null;
  startAddress: string | null;
  endAddress: string | null;
  /** Saved place names ("Home", "Depot") for each end, as the Trips list shows them. */
  startPlaceName: string | null;
  endPlaceName: string | null;
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
  distanceMiles: number | null;
  isManual: boolean;
  /** Loaded from the phone because the server fetch failed. */
  waitingToSync: boolean;
  /** When the server saved the trip, for "Saved later". */
  createdAt: string | null;
  /** The server marks a trip made by splitting a longer one. */
  splitLeg: boolean;
  editedAt: string | null;
  diversionText: string | null;
  routeCoords: LatLng[];
  routeMatched: LatLng[];

  // Classification (one-tap saves are handled by the parent)
  classification: TripClassification;
  category?: TripCategory;
  platformTag?: PlatformTag;
  businessPurpose?: BusinessPurpose;
  isGigDriver: boolean;
  isEmployeeDriver: boolean;
  onClassify: (value: "business" | "personal") => void;
  onCategory: (value: TripCategory | undefined) => void;
  onPlatform: (value: PlatformTag | undefined) => void;
  onPurpose: (value: BusinessPurpose | undefined) => void;
  /** "Saved", or the offline wording. Shown under the choice for a moment. */
  savedNote: string | null;
  /** "Changes saved" after an edit, shown under the when line. */
  changesSaved: boolean;

  // Read-only details
  notes: string;
  projectLabel: string;
  vehicleName: string | null;

  // Notices
  confidenceLevel: "high" | "medium" | "low" | null;
  confidenceReasons: string[];
  mergeSuggestion: {
    direction: "before" | "after";
    gapMinutes: number;
    gapMeters: number;
    otherTripId: string;
  } | null;
  merging: boolean;
  onMerge: (otherTripId: string) => void;
  /** The one-time "A stop starts a new trip" note, on the later piece of the
   *  driver's first split trip (first-run tour, borrowed from direction B). */
  firstSplitNote?: boolean;
  cleanAirZones: CazTripAssessment | null;
  loggedCazZones: Set<string>;
  loggingCaz: string | null;
  onLogCaz: (charge: { zoneId: string; name: string; chargePence: number }) => void;

  // Speed and stops (GPS trips with insights): the parent's existing card.
  speedAndStops: ReactNode;

  // Actions
  onEdit: () => void;
  onEditOdometer: () => void;
  hasOdometer: boolean;
  canSplit: boolean;
  onSplit: () => void;
  onFine: () => void;
  showProChip: boolean;
  recalculating: boolean;
  onRecalculate: () => void;
  onSavePlace: (lat: number, lng: number, addr: string | null) => void;
  onNewTripFrom: (lat: number, lng: number, addr: string | null) => void;
  onNewTripTo: (lat: number, lng: number, addr: string | null) => void;
  deleting: boolean;
  onDelete: () => void;
}

// ── Formatting ──────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function clock(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function durationLabel(mins: number): string {
  if (mins < 1) return "under 1 min";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** "Home, 12 Main St, Washington" -> ["Home", "12 Main St, Washington"]. */
function splitAddress(addr: string | null): { first: string; rest: string | null } | null {
  if (!addr) return null;
  const i = addr.indexOf(",");
  if (i < 0) return { first: addr.trim(), rest: null };
  return { first: addr.slice(0, i).trim(), rest: addr.slice(i + 1).trim() || null };
}

/** A saved place's name first (as the Trips list shows it), the address under it. */
function placeLines(name: string | null, addr: string | null): { first: string; rest: string | null } | null {
  if (name) {
    const a = splitAddress(addr);
    const rest = a ? (a.rest ?? a.first) : null;
    return { first: name, rest: rest && rest !== name ? rest : null };
  }
  return splitAddress(addr);
}

/** "Client Meeting" -> "Client meeting". Brand names (the apps) stay as they are. */
function sentenceCase(label: string): string {
  return label.charAt(0) + label.slice(1).toLowerCase();
}

function useAnimatedToggle() {
  const reduced = useReducedMotion();
  return (apply: () => void) => {
    if (!reduced) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    apply();
  };
}

// ── Pieces ──────────────────────────────────────────────────────────────

function MapBlock(
  props: Pick<TripSummaryViewProps, "routeCoords" | "routeMatched" | "isManual" | "startLat" | "startLng" | "endLat" | "endLng">
) {
  const { height: windowHeight } = useWindowDimensions();
  // 180 on a small phone (SE), 200 otherwise.
  const height = windowHeight < 700 ? 180 : 200;
  const hasRoute = props.routeCoords.length >= 2;

  if (hasRoute && hasNativeMap) {
    return (
      <View style={[styles.mapBox, { height }]}>
        <TripMapWidget
          coordinates={props.routeCoords}
          matchedCoordinates={props.routeMatched.length >= 2 ? props.routeMatched : null}
          height={height}
          lineWidth={4}
        />
      </View>
    );
  }

  // A trip added by hand draws the dashed start-to-end line the Trips list
  // and Home use for it, so the two screens agree.
  const ends =
    props.startLat != null && props.startLng != null && props.endLat != null && props.endLng != null
      ? { start: { lat: props.startLat, lng: props.startLng }, end: { lat: props.endLat, lng: props.endLng } }
      : null;
  if (props.isManual && ends) {
    return (
      <View style={[styles.mapBox, styles.mapPlaceholder, { height }]}>
        <MiniRoute route={[]} start={ends.start} end={ends.end} size={height - 72} dashed />
        <Text style={styles.mapPlaceholderText} maxFontSizeMultiplier={fontScaleCap.body}>
          Added by you, so there&apos;s no route to show.
        </Text>
      </View>
    );
  }

  const placeholder = props.isManual
    ? { icon: "create-outline" as const, text: "Added by you, so there's no route to show." }
    : !hasRoute
      ? { icon: "map-outline" as const, text: "The route isn't on this phone yet." }
      : { icon: "map-outline" as const, text: "Map not available here." };

  return (
    <View style={[styles.mapBox, styles.mapPlaceholder, { height }]}>
      <Ionicons name={placeholder.icon} size={28} color={colors.text3} accessible={false} />
      <Text style={styles.mapPlaceholderText} maxFontSizeMultiplier={fontScaleCap.body}>
        {placeholder.text}
      </Text>
    </View>
  );
}

function ChoiceSegment({
  kind,
  selected,
  onPress,
}: {
  kind: "business" | "personal";
  selected: boolean;
  onPress: () => void;
}) {
  const business = kind === "business";
  const label = business ? "Business" : "Personal";
  const iconName = business
    ? selected ? "briefcase" : "briefcase-outline"
    : selected ? "person" : "person-outline";
  const fg = selected ? (business ? colors.bg : colors.text1) : colors.text2;
  return (
    <TouchableOpacity
      style={[
        styles.segment,
        selected && business && styles.segmentBusiness,
        selected && !business && styles.segmentPersonal,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
    >
      <Ionicons name={iconName as keyof typeof Ionicons.glyphMap} size={18} color={fg} accessible={false} />
      <Text
        style={[styles.segmentText, { color: fg, fontFamily: selected ? fonts.bold : fonts.semibold }]}
        numberOfLines={1}
        maxFontSizeMultiplier={fontScaleCap.display}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function FirstSplitNote({ joinLabel }: { joinLabel: string }) {
  return (
    <View style={[styles.notice, { alignItems: "flex-start" }]} accessible>
      <Ionicons name="information-circle-outline" size={18} color={colors.amber} accessible={false} />
      <View style={{ flex: 1 }}>
        <Text style={styles.noticeTitle} maxFontSizeMultiplier={fontScaleCap.heading}>
          A stop starts a new trip
        </Text>
        <Text style={styles.noticeBody} maxFontSizeMultiplier={fontScaleCap.body}>
          Stop somewhere for 4 minutes or more and the next drive is a new trip, so a shop stop gives you two. Nothing
          is lost. To join them, tap {joinLabel} under Fix this trip below.
        </Text>
      </View>
    </View>
  );
}

function CazNotice(
  props: Pick<TripSummaryViewProps, "cleanAirZones" | "loggedCazZones" | "loggingCaz" | "onLogCaz">
) {
  const caz = props.cleanAirZones;
  if (!caz || caz.charges.length === 0) return null;
  return (
    <View style={[styles.notice, styles.noticeColumn]}>
      <View style={styles.cazHeader}>
        <Ionicons name="alert-circle" size={18} color={colors.amber} accessible={false} />
        <Text style={styles.noticeTitle} maxFontSizeMultiplier={fontScaleCap.heading}>
          Clean Air Zone charge may apply
        </Text>
      </View>
      <Text style={styles.noticeBody} maxFontSizeMultiplier={fontScaleCap.body}>
        This trip looks like it entered a charging zone in a vehicle that may not be exempt. If you
        paid, log it as a deductible expense.
      </Text>
      {caz.charges.map((c) => {
        const logged = props.loggedCazZones.has(c.zoneId);
        return (
          <View key={c.zoneId} style={styles.cazRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cazZone} maxFontSizeMultiplier={fontScaleCap.heading}>{c.name}</Text>
              <Text style={styles.cazCharge} maxFontSizeMultiplier={fontScaleCap.body}>
                {formatPence(c.chargePence)} daily charge
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.cazButton, logged && styles.cazButtonDone]}
              onPress={() => !logged && props.onLogCaz(c)}
              disabled={logged || props.loggingCaz === c.zoneId}
              accessibilityRole="button"
              accessibilityLabel={logged ? `${c.name} charge logged` : `Log the ${c.name} charge as an expense`}
            >
              {props.loggingCaz === c.zoneId ? (
                <ActivityIndicator color={colors.amber} size="small" />
              ) : logged ? (
                <>
                  <Ionicons name="checkmark" size={14} color={colors.green} accessible={false} />
                  <Text style={[styles.cazButtonText, { color: colors.green }]}>Logged</Text>
                </>
              ) : (
                <Text style={styles.cazButtonText} maxFontSizeMultiplier={fontScaleCap.display}>Log charge</Text>
              )}
            </TouchableOpacity>
          </View>
        );
      })}
      <Text style={styles.cazDisclaimer} maxFontSizeMultiplier={fontScaleCap.body}>
        Based on your vehicle&apos;s emissions and the zone boundary. If unsure, use the official
        checker. Zone boundaries © OpenStreetMap contributors, Transport for London and local
        authorities.
      </Text>
    </View>
  );
}

/** Home's amber strip: "The distance may be off", why, and "Check". */
function DistanceWarning({
  level,
  reasons,
  onCheck,
  busy,
}: {
  level: TripSummaryViewProps["confidenceLevel"];
  reasons: string[];
  onCheck: () => void;
  busy: boolean;
}) {
  const w = distanceWarning(level, reasons);
  if (!w) return null;
  return (
    <TouchableOpacity
      style={styles.warning}
      onPress={onCheck}
      disabled={busy}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${w.title}. ${w.body} Check`}
      accessibilityHint="Works out the miles again along the roads"
    >
      <Ionicons name="alert-circle" size={20} color={colors.amber} accessible={false} />
      <View style={{ flex: 1 }}>
        <Text style={styles.warningTitle} maxFontSizeMultiplier={fontScaleCap.heading}>{w.title}</Text>
        <Text style={styles.warningBody} maxFontSizeMultiplier={fontScaleCap.body}>{w.body}</Text>
      </View>
      {busy ? (
        <ActivityIndicator color={colors.amber} size="small" />
      ) : (
        <Text style={styles.warningAction} maxFontSizeMultiplier={fontScaleCap.body}>Check</Text>
      )}
    </TouchableOpacity>
  );
}

/** One row in a grouped card: grey icon, title (and a grey line), value, chevron. */
function Row({
  icon,
  label,
  sub,
  value,
  valueAccent,
  chip,
  onPress,
  busy,
  first,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub?: string;
  value?: string;
  /** The value is an invitation ("Add"), not a fact. */
  valueAccent?: boolean;
  chip?: string;
  onPress?: () => void;
  busy?: boolean;
  first?: boolean;
}) {
  const body = (
    <>
      <Ionicons name={icon} size={20} color={colors.text2} accessible={false} />
      <View style={styles.rowText}>
        <Text style={styles.rowLabel} numberOfLines={2} maxFontSizeMultiplier={fontScaleCap.body}>
          {label}
        </Text>
        {sub ? (
          <Text style={styles.rowSub} numberOfLines={2} maxFontSizeMultiplier={fontScaleCap.body}>
            {sub}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text
          style={[styles.rowValue, valueAccent && { color: colors.amber }]}
          numberOfLines={1}
          maxFontSizeMultiplier={fontScaleCap.body}
        >
          {value}
        </Text>
      ) : null}
      {chip ? (
        <View style={styles.proChip}>
          <Text style={styles.proChipText} maxFontSizeMultiplier={fontScaleCap.none}>{chip}</Text>
        </View>
      ) : null}
      {busy ? <ActivityIndicator color={colors.text2} size="small" /> : null}
      {onPress && !busy ? <Ionicons name="chevron-forward" size={16} color={colors.text3} accessible={false} /> : null}
    </>
  );
  const style = [styles.row, !first && styles.rowBorder];
  if (!onPress) {
    return (
      <View style={style} accessible accessibilityLabel={value ? `${label}: ${value}` : label}>
        {body}
      </View>
    );
  }
  return (
    <TouchableOpacity
      style={style}
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={[label, value, sub].filter(Boolean).join(". ")}
      accessibilityState={{ busy: !!busy }}
    >
      {body}
    </TouchableOpacity>
  );
}

function CollapsibleRow({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <View>
      <TouchableOpacity
        style={styles.collapseRow}
        onPress={onToggle}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.collapseText} maxFontSizeMultiplier={fontScaleCap.body}>{title}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.text2} accessible={false} />
      </TouchableOpacity>
      {open && children}
    </View>
  );
}

type Sheet = "app" | "purpose" | "category" | "place" | "newTrip" | null;

const NONE = "__none__";

// ── The summary ─────────────────────────────────────────────────────────

/**
 * What a saved trip opens as: the route, where it went, how far, how it was
 * made, and the one decision that matters (business or personal). The rest
 * sits in two short groups: "Fix this trip" and "Use this trip"
 * (PROPOSALS 6.5). Presentational: trip-form owns the data and every save,
 * this just draws it and calls back.
 */
export function TripSummaryView(props: TripSummaryViewProps) {
  const [speedOpen, setSpeedOpen] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const animate = useAnimatedToggle();

  const { startedAt, endedAt, classification } = props;
  const from = placeLines(props.startPlaceName, props.startAddress);
  const to = placeLines(props.endPlaceName, props.endAddress);
  const fromName = from?.first ?? null;
  const toName = to?.first ?? null;

  const mins = endedAt ? Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000)) : null;
  const whenLine = endedAt
    ? `${dayLabel(startedAt)} · ${clock(startedAt)} to ${clock(endedAt)} · ${durationLabel(mins ?? 0)}`
    : `${dayLabel(startedAt)} · started ${clock(startedAt)}`;

  const miles = props.distanceMiles != null ? Math.round(props.distanceMiles * 10) / 10 : null;
  const unclassified = classification === "unclassified";

  const made = tripMadeLine(
    {
      isManualEntry: props.isManual,
      classification,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt ? endedAt.toISOString() : null,
      createdAt: props.createdAt,
    },
    { waitingToUpload: props.waitingToSync, splitLeg: props.splitLeg }
  );
  const madeIcon: keyof typeof Ionicons.glyphMap = made.done
    ? "checkmark-circle"
    : props.waitingToSync
      ? "cloud-upload-outline"
      : props.isManual
        ? "create-outline"
        : props.splitLeg
          ? "cut-outline"
          : "time-outline";
  const extras: string[] = [];
  if (props.editedAt) {
    const e = new Date(props.editedAt);
    extras.push(`Edited ${e.getDate()} ${MONTHS[e.getMonth()]}`);
  }

  const showSpeed = !props.isManual && props.speedAndStops != null;

  // Which app for gig drivers, Purpose for drivers who drive for an employer,
  // Category for Personal trips. One row each, opening a short picker.
  const showApp = classification === "business" && props.isGigDriver;
  const showPurpose = classification === "business" && props.isEmployeeDriver;
  const showCategory = classification === "personal";
  const platformLabel = GIG_PLATFORMS.find((p) => p.value === props.platformTag)?.label;
  const purposeMeta = BUSINESS_PURPOSES.find((p) => p.value === props.businessPurpose);
  const categoryMeta = TRIP_CATEGORY_META.find((c) => c.value === props.category);
  const note = props.notes.trim();
  const project = props.projectLabel.trim();

  const appOptions: PickerOption[] = [
    { key: NONE, label: "None" },
    ...GIG_PLATFORMS.map((p) => ({ key: p.value, label: p.label })),
  ];
  const purposeOptions: PickerOption[] = [
    { key: NONE, label: "None" },
    ...BUSINESS_PURPOSES.map((p) => ({ key: p.value, label: sentenceCase(p.label), icon: p.icon })),
  ];
  const categoryOptions: PickerOption[] = [
    { key: NONE, label: "None" },
    ...TRIP_CATEGORY_META.map((c) => ({ key: c.value, label: sentenceCase(c.label), icon: c.icon })),
  ];

  const hasStart = props.startLat != null && props.startLng != null;
  const hasEnd = props.endLat != null && props.endLng != null;
  const startWord = fromName ?? "the start";
  const endWord = toName ?? "the end";
  const placeOptions: PickerOption[] = [
    ...(hasStart ? [{ key: "start", label: `Save ${startWord}`, sub: "Where this trip started", icon: "bookmark-outline" }] : []),
    ...(hasEnd ? [{ key: "end", label: `Save ${endWord}`, sub: "Where this trip ended", icon: "bookmark-outline" }] : []),
  ];
  const newTripOptions: PickerOption[] = [
    ...(hasEnd ? [{ key: "from-end", label: `From ${endWord}`, sub: "Starts where this trip ended", icon: "arrow-up-circle-outline" }] : []),
    ...(hasStart ? [{ key: "from-start", label: `From ${startWord}`, sub: "Starts where this trip started", icon: "arrow-up-circle-outline" }] : []),
    ...(hasEnd ? [{ key: "to-end", label: `To ${endWord}`, sub: "Ends where this trip ended", icon: "flag-outline" }] : []),
    ...(hasStart ? [{ key: "to-start", label: `To ${startWord}`, sub: "Ends where this trip started", icon: "flag-outline" }] : []),
  ];

  const pickNewTrip = (key: string) => {
    const start = [props.startLat!, props.startLng!, props.startAddress] as const;
    const end = [props.endLat!, props.endLng!, props.endAddress] as const;
    if (key === "from-end") props.onNewTripFrom(...end);
    else if (key === "from-start") props.onNewTripFrom(...start);
    else if (key === "to-end") props.onNewTripTo(...end);
    else if (key === "to-start") props.onNewTripTo(...start);
  };

  const m = props.mergeSuggestion;
  const joinRow = m
    ? {
        label: m.direction === "after" ? "Join with the next trip" : "Join with the trip before",
        sub:
          (m.direction === "after"
            ? `Starts ${m.gapMinutes < 1 ? "under 1" : m.gapMinutes.toFixed(0)} min later`
            : `Ended ${m.gapMinutes < 1 ? "under 1" : m.gapMinutes.toFixed(0)} min earlier`) +
          `, ${m.gapMeters < 100 ? "under 100" : m.gapMeters.toFixed(0)} m away`,
      }
    : null;

  return (
    <View>
      <MapBlock
        routeCoords={props.routeCoords}
        routeMatched={props.routeMatched}
        isManual={props.isManual}
        startLat={props.startLat}
        startLng={props.startLng}
        endLat={props.endLat}
        endLng={props.endLng}
      />

      <Text style={styles.when} maxFontSizeMultiplier={fontScaleCap.body}>{whenLine}</Text>
      {props.changesSaved && (
        <Text style={styles.savedText} accessibilityLiveRegion="polite" maxFontSizeMultiplier={fontScaleCap.body}>
          Changes saved
        </Text>
      )}

      {/* From / To */}
      <View style={styles.placesRow}>
        <View style={styles.connector} accessible={false}>
          <View style={styles.connectorDotStart} />
          <View style={styles.connectorLine} />
          <View style={styles.connectorDotEnd} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.placeMain} numberOfLines={2} maxFontSizeMultiplier={fontScaleCap.heading}>
            {from?.first ?? "Start not recorded"}
          </Text>
          {from?.rest ? (
            <Text style={styles.placeRest} numberOfLines={1} maxFontSizeMultiplier={fontScaleCap.body}>
              {from.rest}
            </Text>
          ) : null}
          <View style={{ height: 14 }} />
          {to ? (
            <>
              <Text style={styles.placeMain} numberOfLines={2} maxFontSizeMultiplier={fontScaleCap.heading}>
                {to.first}
              </Text>
              {to.rest ? (
                <Text style={styles.placeRest} numberOfLines={1} maxFontSizeMultiplier={fontScaleCap.body}>
                  {to.rest}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.placeRest} maxFontSizeMultiplier={fontScaleCap.body}>End not recorded</Text>
          )}
        </View>
      </View>

      {/* Distance */}
      <View
        style={styles.milesRow}
        accessible
        accessibilityLabel={miles != null ? `${miles} ${miles === 1 ? "mile" : "miles"}` : "Distance not known"}
      >
        <Text style={styles.milesValue} maxFontSizeMultiplier={fontScaleCap.display}>
          {miles != null ? miles.toFixed(1) : "--"}
        </Text>
        {miles != null && (
          <Text style={styles.milesUnit} maxFontSizeMultiplier={fontScaleCap.display}>
            {miles === 1 ? " mile" : " miles"}
          </Text>
        )}
      </View>

      {/* How the trip was made: a green tick only when it's recorded and saved. */}
      <View style={styles.madeRow}>
        <Ionicons name={madeIcon} size={16} color={made.done ? colors.green : colors.text2} accessible={false} />
        <Text style={styles.madeText} maxFontSizeMultiplier={fontScaleCap.body}>
          {[made.text, ...extras].join(" · ")}
        </Text>
      </View>
      {props.diversionText ? (
        <View style={styles.madeRow}>
          <Ionicons name="git-branch-outline" size={16} color={colors.text2} accessible={false} />
          <Text style={styles.madeText} maxFontSizeMultiplier={fontScaleCap.body}>{props.diversionText}</Text>
        </View>
      ) : null}

      {/* Business or personal */}
      <Text
        style={[styles.question, unclassified && { color: colors.amber }]}
        maxFontSizeMultiplier={fontScaleCap.heading}
        accessibilityRole="header"
      >
        Business or personal?
      </Text>
      <View
        style={[styles.track, unclassified && { borderColor: colors.amberGlow }]}
        accessibilityRole="radiogroup"
      >
        <ChoiceSegment
          kind="business"
          selected={classification === "business"}
          onPress={() => props.onClassify("business")}
        />
        <ChoiceSegment
          kind="personal"
          selected={classification === "personal"}
          onPress={() => props.onClassify("personal")}
        />
      </View>
      {/* Reserve the line so the layout does not jump when it appears. */}
      <Text style={styles.savedText} accessibilityLiveRegion="polite" maxFontSizeMultiplier={fontScaleCap.body}>
        {props.savedNote ?? " "}
      </Text>

      {/* Which app, Purpose (or Category), Note: rows that open a short picker. */}
      <View style={styles.group}>
        {showApp && (
          <Row
            first
            icon="phone-portrait-outline"
            label="Which app"
            value={platformLabel ?? "None"}
            onPress={() => setSheet("app")}
          />
        )}
        {showPurpose && (
          <Row
            first={!showApp}
            icon="flag-outline"
            label="Purpose"
            value={purposeMeta ? sentenceCase(purposeMeta.label) : "None"}
            onPress={() => setSheet("purpose")}
          />
        )}
        {showCategory && (
          <Row
            first
            icon="pricetag-outline"
            label="Category"
            value={categoryMeta ? sentenceCase(categoryMeta.label) : "None"}
            onPress={() => setSheet("category")}
          />
        )}
        <Row
          first={!showApp && !showPurpose && !showCategory}
          icon="create-outline"
          label="Note"
          sub={note || undefined}
          value={note ? undefined : "Add"}
          valueAccent={!note}
          onPress={props.onEdit}
        />
        {project ? <Row icon="briefcase-outline" label="Project" value={project} onPress={props.onEdit} /> : null}
        {props.vehicleName ? <Row icon="car-outline" label="Vehicle" value={props.vehicleName} /> : null}
      </View>

      {props.firstSplitNote && joinRow ? <FirstSplitNote joinLabel={joinRow.label} /> : null}
      <CazNotice
        cleanAirZones={props.cleanAirZones}
        loggedCazZones={props.loggedCazZones}
        loggingCaz={props.loggingCaz}
        onLogCaz={props.onLogCaz}
      />

      <TouchableOpacity
        style={styles.editButton}
        onPress={props.onEdit}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Edit trip"
      >
        <Ionicons name="create-outline" size={18} color={colors.text1} accessible={false} />
        <Text style={styles.editButtonText} maxFontSizeMultiplier={fontScaleCap.display}>Edit trip</Text>
      </TouchableOpacity>

      {showSpeed && (
        <CollapsibleRow
          title="Speed and stops"
          open={speedOpen}
          onToggle={() => animate(() => setSpeedOpen((v) => !v))}
        >
          {props.speedAndStops}
        </CollapsibleRow>
      )}

      {/* Only when the distance may be off; never red, nothing is broken. */}
      <View style={{ marginTop: 16 }}>
        <DistanceWarning
          level={props.confidenceLevel}
          reasons={props.confidenceReasons}
          onCheck={props.onRecalculate}
          busy={props.recalculating}
        />
      </View>

      <Text style={styles.groupTitle} accessibilityRole="header" maxFontSizeMultiplier={fontScaleCap.heading}>
        Fix this trip
      </Text>
      <View style={styles.group}>
        <Row
          first
          icon="swap-vertical-outline"
          label="Work out the miles again"
          sub="Uses the road route between the two places"
          onPress={props.onRecalculate}
          busy={props.recalculating}
        />
        {props.canSplit && (
          <Row icon="cut-outline" label="Split into separate trips" sub="If you stopped on the way" onPress={props.onSplit} />
        )}
        {joinRow && m && (
          <Row
            icon="git-merge-outline"
            label={joinRow.label}
            sub={joinRow.sub}
            onPress={() => props.onMerge(m.otherTripId)}
            busy={props.merging}
          />
        )}
        <Row
          icon="speedometer-outline"
          label="Odometer readings"
          value={props.hasOdometer ? "Edit" : "Add"}
          valueAccent={!props.hasOdometer}
          onPress={props.onEditOdometer}
        />
      </View>

      <Text style={styles.groupTitle} accessibilityRole="header" maxFontSizeMultiplier={fontScaleCap.heading}>
        Use this trip
      </Text>
      <View style={styles.group}>
        {placeOptions.length > 0 && (
          <Row
            first
            icon="bookmark-outline"
            label="Save a place"
            sub={fromName && toName ? `Name ${fromName} or ${toName}` : "Name where you went"}
            onPress={() => setSheet("place")}
          />
        )}
        {newTripOptions.length > 0 && (
          <Row
            first={placeOptions.length === 0}
            icon="add"
            label="New trip from here"
            sub="Back home, or on to the next drop"
            onPress={() => setSheet("newTrip")}
          />
        )}
        {!props.isManual && (
          <Row
            first={placeOptions.length === 0 && newTripOptions.length === 0}
            icon="shield-checkmark-outline"
            label="Got a fine for this trip?"
            chip={props.showProChip ? "Pro" : undefined}
            onPress={props.onFine}
          />
        )}
      </View>

      <TouchableOpacity
        style={styles.deleteButton}
        onPress={props.onDelete}
        disabled={props.deleting}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Delete trip"
      >
        {props.deleting ? (
          <ActivityIndicator color={DESTRUCTIVE} size="small" />
        ) : (
          <Ionicons name="trash-outline" size={18} color={DESTRUCTIVE} accessible={false} />
        )}
        <Text style={styles.deleteText} maxFontSizeMultiplier={fontScaleCap.display}>Delete trip</Text>
      </TouchableOpacity>

      <PickerSheet
        visible={sheet === "app"}
        title="Which app"
        options={appOptions}
        selectedKey={props.platformTag ?? NONE}
        onPick={(k) => props.onPlatform(k === NONE ? undefined : (k as PlatformTag))}
        onClose={() => setSheet(null)}
      />
      <PickerSheet
        visible={sheet === "purpose"}
        title="Purpose"
        options={purposeOptions}
        selectedKey={props.businessPurpose ?? NONE}
        onPick={(k) => props.onPurpose(k === NONE ? undefined : (k as BusinessPurpose))}
        onClose={() => setSheet(null)}
      />
      <PickerSheet
        visible={sheet === "category"}
        title="Category"
        options={categoryOptions}
        selectedKey={props.category ?? NONE}
        onPick={(k) => props.onCategory(k === NONE ? undefined : (k as TripCategory))}
        onClose={() => setSheet(null)}
      />
      <PickerSheet
        visible={sheet === "place"}
        title="Save a place"
        options={placeOptions}
        onPick={(k) => {
          if (k === "start") props.onSavePlace(props.startLat!, props.startLng!, props.startAddress);
          else if (k === "end") props.onSavePlace(props.endLat!, props.endLng!, props.endAddress);
        }}
        onClose={() => setSheet(null)}
      />
      <PickerSheet
        visible={sheet === "newTrip"}
        title="New trip from here"
        options={newTripOptions}
        onPick={pickNewTrip}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 52,
    marginTop: 16,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  editButtonText: {
    fontSize: 16,
    fontFamily: fonts.semibold,
    color: colors.text1,
  },
  mapBox: {
    borderRadius: radii.lg,
    overflow: "hidden",
    marginBottom: 16,
  },
  mapPlaceholder: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
  },
  mapPlaceholderText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.text2,
    textAlign: "center",
  },
  when: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.text2,
    marginBottom: 14,
  },
  savedText: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: colors.green,
    marginTop: -8,
    marginBottom: 12,
    minHeight: 20,
  },
  placesRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  connector: {
    width: 12,
    alignItems: "center",
    paddingTop: 7,
    paddingBottom: 7,
  },
  connectorDotStart: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.text1,
  },
  connectorLine: {
    flex: 1,
    width: 2,
    backgroundColor: colors.hairline,
    marginVertical: 3,
  },
  connectorDotEnd: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.amber,
  },
  placeMain: {
    fontSize: 18,
    fontFamily: fonts.semibold,
    color: colors.text1,
  },
  placeRest: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.text3,
    marginTop: 2,
  },
  milesRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 4,
  },
  milesValue: {
    fontSize: 44,
    fontFamily: fonts.bold,
    color: colors.text1,
    letterSpacing: -0.5,
  },
  milesUnit: {
    fontSize: 20,
    fontFamily: fonts.semibold,
    color: colors.text2,
  },
  madeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  madeText: {
    flex: 1,
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.text2,
  },
  question: {
    fontSize: 16,
    fontFamily: fonts.semibold,
    color: colors.text1,
    marginTop: 22,
    marginBottom: 10,
  },
  track: {
    flexDirection: "row",
    height: 56,
    padding: 4,
    gap: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
    marginBottom: 12,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  segmentBusiness: {
    backgroundColor: colors.amber,
    borderColor: colors.amber,
  },
  segmentPersonal: {
    backgroundColor: colors.personal,
    borderColor: colors.personalEdge,
  },
  segmentText: {
    fontSize: 16,
  },
  group: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: "hidden",
  },
  groupTitle: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.text2,
    marginTop: 24,
    marginBottom: 8,
    marginLeft: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 16,
    fontFamily: fonts.regular,
    color: colors.text1,
  },
  rowSub: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.text2,
    marginTop: 2,
  },
  rowValue: {
    maxWidth: "45%",
    fontSize: 15,
    fontFamily: fonts.medium,
    color: colors.text2,
  },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
    padding: 14,
    borderRadius: radii.lg,
    backgroundColor: colors.amberDim,
    borderWidth: 1,
    borderColor: colors.amberGlow,
  },
  noticeColumn: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 8,
  },
  noticeTitle: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: colors.text1,
    flexShrink: 1,
  },
  noticeBody: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.text2,
    lineHeight: 20,
    marginTop: 2,
  },
  // Home's warning strip
  warning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.amberDim,
  },
  warningTitle: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: colors.text1,
  },
  warningBody: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.text2,
    marginTop: 2,
  },
  warningAction: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.amber,
  },
  cazHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cazRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 6,
  },
  cazZone: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: colors.text1,
  },
  cazCharge: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.text2,
  },
  cazButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 44,
    minWidth: 96,
    paddingHorizontal: 14,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.amber,
  },
  cazButtonDone: {
    borderColor: colors.green,
  },
  cazButtonText: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: colors.amber,
  },
  cazDisclaimer: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.text3,
    lineHeight: 17,
    marginTop: 4,
  },
  collapseRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    marginTop: 8,
  },
  collapseText: {
    fontSize: 16,
    fontFamily: fonts.semibold,
    color: colors.text2,
    flexShrink: 1,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 52,
    marginTop: 24,
  },
  deleteText: {
    fontSize: 16,
    fontFamily: fonts.semibold,
    color: DESTRUCTIVE,
  },
  proChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: colors.amberDim,
  },
  proChipText: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.amber,
  },
});
