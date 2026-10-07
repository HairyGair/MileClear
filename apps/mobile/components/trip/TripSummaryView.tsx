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
import { useReducedMotion } from "../../lib/accessibility";
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
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
  distanceMiles: number | null;
  isManual: boolean;
  /** Loaded from the phone because the server fetch failed. */
  waitingToSync: boolean;
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
  /** The ConfidenceBadge, drawn by the parent (it owns that component). */
  confidenceBadge: ReactNode;
  mergeSuggestion: {
    direction: "before" | "after";
    gapMinutes: number;
    gapMeters: number;
    otherTripId: string;
  } | null;
  merging: boolean;
  onMerge: (otherTripId: string) => void;
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

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dateLabel(d: Date): string {
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

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

function useAnimatedToggle() {
  const reduced = useReducedMotion();
  return (apply: () => void) => {
    if (!reduced) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    apply();
  };
}

// ── Pieces ──────────────────────────────────────────────────────────────

function MapBlock(props: Pick<TripSummaryViewProps, "routeCoords" | "routeMatched" | "isManual">) {
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

  const placeholder = props.isManual
    ? { icon: "create-outline" as const, text: "Added by hand, so there's no route to show." }
    : !hasRoute
      ? { icon: "map-outline" as const, text: "The route isn't on this phone yet." }
      : { icon: "map-outline" as const, text: "Map not available here." };

  return (
    <View style={[styles.mapBox, styles.mapPlaceholder, { height }]}>
      <Ionicons name={placeholder.icon} size={28} color="rgba(245, 166, 35, 0.3)" accessible={false} />
      <Text style={styles.mapPlaceholderText} maxFontSizeMultiplier={fontScaleCap.body}>
        {placeholder.text}
      </Text>
    </View>
  );
}

function Pill({ text, icon }: { text: string; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.pill}>
      {icon && <Ionicons name={icon} size={12} color={colors.text2} accessible={false} />}
      <Text style={styles.pillText} maxFontSizeMultiplier={fontScaleCap.heading}>
        {text}
      </Text>
    </View>
  );
}

function Chip({
  label,
  icon,
  selected,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  icon?: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
    >
      {icon ? (
        <Ionicons
          name={icon as keyof typeof Ionicons.glyphMap}
          size={14}
          color={selected ? colors.bg : colors.text2}
          accessible={false}
        />
      ) : null}
      <Text
        style={[styles.chipText, selected && styles.chipTextSelected]}
        maxFontSizeMultiplier={fontScaleCap.display}
      >
        {label}
      </Text>
    </TouchableOpacity>
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

function SubChoice(props: TripSummaryViewProps) {
  const { classification } = props;
  if (classification === "personal") {
    return (
      <View style={styles.subChoice}>
        <Text style={styles.subLabel} maxFontSizeMultiplier={fontScaleCap.heading}>Category</Text>
        <View style={styles.chipWrap}>
          <Chip
            label="None"
            selected={!props.category}
            onPress={() => props.onCategory(undefined)}
            accessibilityLabel="Category: None"
          />
          {TRIP_CATEGORY_META.map((c) => (
            <Chip
              key={c.value}
              label={c.label}
              icon={c.icon}
              selected={props.category === c.value}
              onPress={() => props.onCategory(c.value as TripCategory)}
              accessibilityLabel={`Category: ${c.label}`}
            />
          ))}
        </View>
      </View>
    );
  }
  if (classification === "business" && (props.isGigDriver || props.isEmployeeDriver)) {
    // A "both" driver gets the app chips and the purpose chips, as the old form showed.
    return (
      <>
        {props.isGigDriver && (
      <View style={styles.subChoice}>
        <Text style={styles.subLabel} maxFontSizeMultiplier={fontScaleCap.heading}>Which app?</Text>
        <View style={styles.chipWrap}>
          <Chip
            label="None"
            selected={!props.platformTag}
            onPress={() => props.onPlatform(undefined)}
            accessibilityLabel="App: None"
          />
          {GIG_PLATFORMS.map((p) => (
            <Chip
              key={p.value}
              label={p.label}
              selected={props.platformTag === p.value}
              onPress={() => props.onPlatform(p.value as PlatformTag)}
              accessibilityLabel={`App: ${p.label}`}
            />
          ))}
        </View>
      </View>
        )}
        {props.isEmployeeDriver && (
      <View style={styles.subChoice}>
        <Text style={styles.subLabel} maxFontSizeMultiplier={fontScaleCap.heading}>Purpose</Text>
        <View style={styles.chipWrap}>
          <Chip
            label="None"
            selected={!props.businessPurpose}
            onPress={() => props.onPurpose(undefined)}
            accessibilityLabel="Purpose: None"
          />
          {BUSINESS_PURPOSES.map((bp) => (
            <Chip
              key={bp.value}
              label={bp.label}
              icon={bp.icon}
              selected={props.businessPurpose === bp.value}
              onPress={() => props.onPurpose(bp.value as BusinessPurpose)}
              accessibilityLabel={`Purpose: ${bp.label}`}
            />
          ))}
        </View>
      </View>
        )}
      </>
    );
  }
  return null;
}

function MergeNotice(props: Pick<TripSummaryViewProps, "mergeSuggestion" | "merging" | "onMerge">) {
  const m = props.mergeSuggestion;
  if (!m) return null;
  const gap = m.gapMinutes < 1 ? "under 1" : m.gapMinutes.toFixed(0);
  const dist = m.gapMeters < 100 ? "under 100" : m.gapMeters.toFixed(0);
  return (
    <View style={styles.notice}>
      <Ionicons name="git-merge-outline" size={18} color={colors.amber} accessible={false} />
      <View style={{ flex: 1 }}>
        <Text style={styles.noticeTitle} maxFontSizeMultiplier={fontScaleCap.heading}>
          Looks like a quick stop
        </Text>
        <Text style={styles.noticeBody} maxFontSizeMultiplier={fontScaleCap.body}>
          {m.direction === "after"
            ? `Another trip starts ${gap} min later`
            : `Another trip ended ${gap} min earlier`}
          {` and ${dist} m away. Join them into one trip?`}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.mergeButton}
        onPress={() => props.onMerge(m.otherTripId)}
        disabled={props.merging}
        accessibilityRole="button"
        accessibilityLabel="Merge with the other trip"
      >
        {props.merging ? (
          <ActivityIndicator color={colors.bg} size="small" />
        ) : (
          <Text style={styles.mergeButtonText} maxFontSizeMultiplier={fontScaleCap.display}>Merge</Text>
        )}
      </TouchableOpacity>
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

function ReadOnlyRow({ label, value, onPress, lines }: { label: string; value: string; onPress?: () => void; lines?: number }) {
  const body = (
    <View style={styles.readRow}>
      <Text style={styles.readLabel} maxFontSizeMultiplier={fontScaleCap.heading}>{label}</Text>
      <Text style={styles.readValue} numberOfLines={lines} maxFontSizeMultiplier={fontScaleCap.body}>
        {value}
      </Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. Tap to edit.`}
    >
      {body}
    </TouchableOpacity>
  );
}

function MoreRow({
  icon,
  label,
  onPress,
  busy,
  chip,
  danger,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  busy?: boolean;
  chip?: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  const tint = danger ? DESTRUCTIVE : colors.text2;
  return (
    <TouchableOpacity
      style={styles.moreRow}
      onPress={onPress}
      disabled={disabled || busy}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={tint} accessible={false} />
      <Text
        style={[styles.moreLabel, danger && { color: DESTRUCTIVE }]}
        numberOfLines={2}
        maxFontSizeMultiplier={fontScaleCap.body}
      >
        {label}
      </Text>
      {chip ? (
        <View style={styles.proChip}>
          <Text style={styles.proChipText} maxFontSizeMultiplier={fontScaleCap.none}>{chip}</Text>
        </View>
      ) : null}
      {busy ? <ActivityIndicator color={colors.amber} size="small" /> : null}
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

// ── The summary ─────────────────────────────────────────────────────────

/**
 * What a saved trip opens as: the route, where it went, how far, and the one
 * decision that matters (business or personal). Everything else is behind
 * "Edit trip" or "More". Presentational: trip-form owns the data and every
 * save, this just draws it and calls back.
 */
export function TripSummaryView(props: TripSummaryViewProps) {
  const [speedOpen, setSpeedOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const animate = useAnimatedToggle();

  const { startedAt, endedAt, classification } = props;
  const from = splitAddress(props.startAddress);
  const to = splitAddress(props.endAddress);

  const mins = endedAt ? Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000)) : null;
  const whenLine = endedAt
    ? `${dateLabel(startedAt)}  ·  ${clock(startedAt)} to ${clock(endedAt)}  ·  ${durationLabel(mins ?? 0)}`
    : `${dateLabel(startedAt)}  ·  started ${clock(startedAt)}`;

  const miles = props.distanceMiles != null ? Math.round(props.distanceMiles * 10) / 10 : null;
  const unclassified = classification === "unclassified";

  const pills: { text: string; icon?: keyof typeof Ionicons.glyphMap }[] = [];
  pills.push({ text: props.isManual ? "Added by hand" : "Recorded by GPS" });
  if (props.editedAt) {
    const e = new Date(props.editedAt);
    pills.push({ text: `Edited ${e.getDate()} ${MONTHS[e.getMonth()]}` });
  }
  if (props.waitingToSync) pills.push({ text: "Waiting to sync" });

  const showConfidenceNotice = props.confidenceLevel != null && props.confidenceLevel !== "high";
  const showSpeed = !props.isManual && props.speedAndStops != null;

  return (
    <View>
      <MapBlock routeCoords={props.routeCoords} routeMatched={props.routeMatched} isManual={props.isManual} />

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
      <View style={styles.pillRow}>
        {pills.map((p) => (
          <Pill key={p.text} text={p.text} icon={p.icon} />
        ))}
        {props.diversionText ? <Pill text={props.diversionText} icon="git-branch-outline" /> : null}
      </View>

      {/* Business or personal */}
      <View style={styles.questionRow}>
        <Text
          style={[styles.question, unclassified && { color: colors.amber }]}
          maxFontSizeMultiplier={fontScaleCap.heading}
        >
          Business or personal?
        </Text>
        {unclassified && (
          <Text style={styles.notSorted} maxFontSizeMultiplier={fontScaleCap.body}>Not sorted yet</Text>
        )}
      </View>
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

      <SubChoice {...props} />

      {/* Notices, only when present */}
      {showConfidenceNotice && <View style={styles.noticeGap}>{props.confidenceBadge}</View>}
      <MergeNotice mergeSuggestion={props.mergeSuggestion} merging={props.merging} onMerge={props.onMerge} />
      <CazNotice
        cleanAirZones={props.cleanAirZones}
        loggedCazZones={props.loggedCazZones}
        loggingCaz={props.loggingCaz}
        onLogCaz={props.onLogCaz}
      />

      {/* Read only details */}
      {props.notes.trim() ? (
        <ReadOnlyRow label="Note" value={props.notes.trim()} lines={3} onPress={props.onEdit} />
      ) : null}
      {props.projectLabel.trim() ? (
        <ReadOnlyRow label="Project" value={props.projectLabel.trim()} onPress={props.onEdit} />
      ) : null}
      {props.vehicleName ? <ReadOnlyRow label="Vehicle" value={props.vehicleName} /> : null}

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

      <CollapsibleRow title="More" open={moreOpen} onToggle={() => animate(() => setMoreOpen((v) => !v))}>
        <View style={styles.moreGroup}>
          {!props.isManual && (
            <MoreRow
              icon="shield-checkmark-outline"
              label="Got a fine for this trip?"
              chip={props.showProChip ? "PRO" : undefined}
              onPress={props.onFine}
            />
          )}
          {props.canSplit && (
            <MoreRow icon="git-branch-outline" label="Split into several trips" onPress={props.onSplit} />
          )}
          <MoreRow
            icon="refresh"
            label="Recalculate distance"
            onPress={props.onRecalculate}
            busy={props.recalculating}
          />
          <MoreRow
            icon="speedometer-outline"
            label={props.hasOdometer ? "Edit odometer readings" : "Add odometer readings"}
            onPress={props.onEditOdometer}
          />
          {props.startLat != null && props.startLng != null && (
            <MoreRow
              icon="bookmark-outline"
              label="Save start as a place"
              onPress={() => props.onSavePlace(props.startLat!, props.startLng!, props.startAddress)}
            />
          )}
          {props.endLat != null && props.endLng != null && (
            <MoreRow
              icon="bookmark-outline"
              label="Save end as a place"
              onPress={() => props.onSavePlace(props.endLat!, props.endLng!, props.endAddress)}
            />
          )}
          {props.endLat != null && props.endLng != null && (
            <MoreRow
              icon="arrow-up-circle-outline"
              label="New trip from the end of this one"
              onPress={() => props.onNewTripFrom(props.endLat!, props.endLng!, props.endAddress)}
            />
          )}
          {props.startLat != null && props.startLng != null && (
            <MoreRow
              icon="arrow-up-circle-outline"
              label="New trip from the start of this one"
              onPress={() => props.onNewTripFrom(props.startLat!, props.startLng!, props.startAddress)}
            />
          )}
          {props.endLat != null && props.endLng != null && (
            <MoreRow
              icon="flag-outline"
              label="New trip to the end of this one"
              onPress={() => props.onNewTripTo(props.endLat!, props.endLng!, props.endAddress)}
            />
          )}
          {props.startLat != null && props.startLng != null && (
            <MoreRow
              icon="flag-outline"
              label="New trip to the start of this one"
              onPress={() => props.onNewTripTo(props.startLat!, props.startLng!, props.startAddress)}
            />
          )}
          {props.confidenceLevel === "high" && <View style={styles.moreBadge}>{props.confidenceBadge}</View>}
        </View>
        <View style={[styles.moreGroup, { marginTop: 12 }]}>
          <MoreRow
            icon="trash-outline"
            label="Delete trip"
            danger
            onPress={props.onDelete}
            busy={props.deleting}
            disabled={props.deleting}
          />
        </View>
      </CollapsibleRow>
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
    borderRadius: radii.md,
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
    borderRadius: radii.md,
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
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
    marginBottom: 24,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.08)",
    maxWidth: "100%",
  },
  pillText: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: colors.text2,
    flexShrink: 1,
  },
  questionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: 8,
    marginBottom: 10,
  },
  question: {
    fontSize: 16,
    fontFamily: fonts.semibold,
    color: colors.text1,
  },
  notSorted: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.text3,
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
  subChoice: {
    marginBottom: 8,
  },
  subLabel: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: colors.text2,
    marginBottom: 8,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  chipSelected: {
    backgroundColor: colors.amber,
    borderColor: colors.amber,
  },
  chipText: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: colors.text2,
  },
  chipTextSelected: {
    color: colors.bg,
  },
  noticeGap: {
    marginTop: 8,
  },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
    padding: 14,
    borderRadius: radii.md,
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
  mergeButton: {
    minHeight: 44,
    minWidth: 72,
    paddingHorizontal: 14,
    borderRadius: radii.sm,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  mergeButtonText: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: colors.bg,
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
  readRow: {
    marginTop: 14,
  },
  readLabel: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: colors.text3,
    marginBottom: 2,
  },
  readValue: {
    fontSize: 16,
    fontFamily: fonts.regular,
    color: colors.text1,
    lineHeight: 22,
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
  moreGroup: {
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: "hidden",
  },
  moreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  moreLabel: {
    flex: 1,
    fontSize: 16,
    fontFamily: fonts.regular,
    color: colors.text1,
  },
  moreBadge: {
    padding: 12,
  },
  proChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.amberDim,
    borderWidth: 1,
    borderColor: colors.amberGlow,
  },
  proChipText: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.amber,
    letterSpacing: 0.5,
  },
});
