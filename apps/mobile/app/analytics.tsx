import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from "react-native";
import { Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { formatPence } from "@mileclear/shared";
import type {
  DrivingAnalytics,
  WeeklyReport,
  FrequentRoute,
  ShiftSweetSpot,
  FuelCostBreakdown,
  EarningsDayPattern,
  CommuteTiming,
} from "@mileclear/shared";
import {
  fetchDrivingAnalytics,
  fetchWeeklyReport,
} from "../lib/api/analytics";
import { useMode } from "../lib/mode/context";
import { PremiumGate } from "../components/PremiumGate";

// ─── Constants ───────────────────────────────────────────────────────────────
const AMBER = "#f5a623";
const GREEN = "#10b981";
const RED = "#ef4444";
const CARD_BG = "#0a1120";
const BORDER = "rgba(255,255,255,0.05)";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#64748b";
const BG = "#030712";

const DAY_ABBREVS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_FULL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const SCREEN_W = Dimensions.get("window").width;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function deltaBadge(delta: number | null): { label: string; positive: boolean } | null {
  if (delta == null) return null;
  const sign = delta >= 0 ? "+" : "";
  return { label: `${sign}${delta.toFixed(0)}%`, positive: delta >= 0 };
}

function fmtMinutes(mins: number): string {
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtHour(hour: number): string {
  if (hour === 0) return "12am";
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return "12pm";
  return `${hour - 12}pm`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DeltaBadge({ delta }: { delta: number | null }) {
  const info = deltaBadge(delta);
  if (!info) return null;
  return (
    <View
      style={[
        s.deltaBadge,
        info.positive ? s.deltaBadgeGreen : s.deltaBadgeRed,
      ]}
    >
      <Ionicons
        name={info.positive ? "trending-up" : "trending-down"}
        size={10}
        color={info.positive ? GREEN : RED}
        accessible={false}
      />
      <Text
        style={[
          s.deltaBadgeText,
          { color: info.positive ? GREEN : RED },
        ]}
      >
        {info.label}
      </Text>
    </View>
  );
}

// ─── Weekly Report Card ───────────────────────────────────────────────────────
function WeeklyReportCard({
  report,
  weeksBack,
  onPrev,
  onNext,
  isPersonal,
  loading,
}: {
  report: WeeklyReport | null;
  weeksBack: number;
  onPrev: () => void;
  onNext: () => void;
  isPersonal: boolean;
  loading: boolean;
}) {
  return (
    <View style={s.card}>
      {/* Header row */}
      <View style={s.cardHeaderRow}>
        <View style={s.cardTitleRow}>
          <Ionicons name="calendar-outline" size={16} color={AMBER} accessible={false} />
          <Text style={s.cardTitle}>This Week</Text>
          {report && (
            <View style={s.weekLabelChip}>
              <Text style={s.weekLabelText}>{report.weekLabel}</Text>
            </View>
          )}
        </View>
        <View style={s.navRow}>
          <TouchableOpacity
            onPress={onPrev}
            style={s.navBtn}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Previous week"
          >
            <Ionicons name="chevron-back" size={18} color={TEXT_2} accessible={false} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onNext}
            style={[s.navBtn, weeksBack === 0 && s.navBtnDisabled]}
            activeOpacity={weeksBack === 0 ? 1 : 0.7}
            disabled={weeksBack === 0}
            accessibilityRole="button"
            accessibilityLabel="Next week"
            accessibilityState={{ disabled: weeksBack === 0 }}
          >
            <Ionicons
              name="chevron-forward"
              size={18}
              color={weeksBack === 0 ? TEXT_3 : TEXT_2}
              accessible={false}
            />
          </TouchableOpacity>
        </View>
      </View>

      {loading || !report ? (
        <View style={s.cardLoading}>
          <ActivityIndicator size="small" color={AMBER} accessibilityLabel="Loading weekly report" />
        </View>
      ) : (
        <>
          {/* Columns */}
          <View style={s.weekColumns}>
            {/* Business column */}
            <View
              style={[
                s.weekCol,
                isPersonal && s.weekColMuted,
              ]}
            >
              <Text style={s.weekColTitle}>Business</Text>
              <WeekStatRow label="Miles" value={report.business.miles.toFixed(1)} />
              <WeekStatRow label="Trips" value={String(report.business.trips)} />
              <WeekStatRow label="Earnings" value={formatPence(report.business.earningsPence)} />
              <WeekStatRow label="Deduction" value={formatPence(report.business.deductionPence)} />
              <WeekStatRow label="Shifts" value={String(report.business.shifts)} />
              {report.business.topPlatform && (
                <WeekStatRow
                  label="Top Platform"
                  value={report.business.topPlatform}
                />
              )}
            </View>

            <View style={s.weekDivider} />

            {/* Personal column */}
            <View
              style={[
                s.weekCol,
                !isPersonal && s.weekColMuted,
              ]}
            >
              <Text style={s.weekColTitle}>Personal</Text>
              <WeekStatRow label="Miles" value={report.personal.miles.toFixed(1)} />
              <WeekStatRow label="Trips" value={String(report.personal.trips)} />
              <WeekStatRow
                label="Avg Trip"
                value={`${report.personal.avgTripMiles.toFixed(1)} mi`}
              />
              <WeekStatRow
                label="Longest"
                value={`${report.personal.longestTripMiles.toFixed(1)} mi`}
              />
            </View>
          </View>

          {/* Combined totals row */}
          <View style={s.weekTotalsRow}>
            <View style={s.weekTotal}>
              <Text style={s.weekTotalValue}>{report.totalMiles.toFixed(1)}</Text>
              <Text style={s.weekTotalLabel}>total mi</Text>
            </View>
            <View style={s.weekTotal}>
              <Text style={s.weekTotalValue}>{report.totalTrips}</Text>
              <Text style={s.weekTotalLabel}>trips</Text>
            </View>
            {report.streakDays > 0 && (
              <View style={[s.weekTotal, s.weekTotalStreak]}>
                <Text style={s.streakValue}>
                  <Ionicons name="flame" size={14} color={AMBER} accessible={false} />{" "}
                  {report.streakDays}d
                </Text>
                <Text style={s.weekTotalLabel}>streak</Text>
              </View>
            )}
          </View>

          {/* Delta badges */}
          {(report.milesDelta != null ||
            report.tripsDelta != null ||
            report.earningsDelta != null) && (
            <View style={s.deltaRow}>
              <Text style={s.deltaRowLabel}>vs last week</Text>
              <DeltaBadge delta={report.milesDelta} />
              <Text style={s.deltaRowSep}>mi</Text>
              <DeltaBadge delta={report.tripsDelta} />
              <Text style={s.deltaRowSep}>trips</Text>
              {report.earningsDelta != null && (
                <>
                  <DeltaBadge delta={report.earningsDelta} />
                  <Text style={s.deltaRowSep}>earn</Text>
                </>
              )}
            </View>
          )}

          {/* New achievements earned this week */}
          {report.newAchievements.length > 0 && (
            <View style={s.achievementRow}>
              <Ionicons name="trophy-outline" size={13} color={AMBER} accessible={false} />
              <Text style={s.achievementRowLabel}>New this week:</Text>
              {report.newAchievements.slice(0, 3).map((label, i) => (
                <View key={i} style={s.achievementChip}>
                  <Text style={s.achievementChipText}>{label}</Text>
                </View>
              ))}
              {report.newAchievements.length > 3 && (
                <Text style={s.achievementChipText}>
                  +{report.newAchievements.length - 3}
                </Text>
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
}

function WeekStatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.weekStatRow}>
      <Text style={s.weekStatLabel}>{label}</Text>
      <Text style={s.weekStatValue}>{value}</Text>
    </View>
  );
}

// ─── Frequent Routes Card ─────────────────────────────────────────────────────
function FrequentRoutesCard({ routes }: { routes: FrequentRoute[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? routes : routes.slice(0, 5);

  if (routes.length === 0) return null;

  return (
    <View style={s.card}>
      <View style={s.cardHeaderRow}>
        <View style={s.cardTitleRow}>
          <Ionicons name="navigate-outline" size={16} color={AMBER} accessible={false} />
          <Text style={s.cardTitle}>Your Routes</Text>
          <View style={s.countChip}>
            <Text style={s.countChipText}>{routes.length}</Text>
          </View>
        </View>
      </View>

      {shown.map((route, i) => (
        <View
          key={i}
          style={[s.routeItem, i < shown.length - 1 && s.routeItemBorder]}
        >
          {/* Addresses */}
          <View style={s.routeAddresses}>
            <View style={s.routeAddressRow}>
              <View style={s.routeDot} />
              <Text style={s.routeAddress} numberOfLines={1}>
                {route.startAddress}
              </Text>
            </View>
            <View style={s.routeLine} />
            <View style={s.routeAddressRow}>
              <View style={[s.routeDot, s.routeDotEnd]} />
              <Text style={s.routeAddress} numberOfLines={1}>
                {route.endAddress}
              </Text>
            </View>
          </View>

          {/* Stats row */}
          <View style={s.routeStatsRow}>
            <View style={s.routeStatChip}>
              <Ionicons name="repeat-outline" size={11} color={AMBER} accessible={false} />
              <Text style={s.routeStatText}>{route.tripCount} trips</Text>
            </View>
            <View style={s.routeStatChip}>
              <Ionicons name="time-outline" size={11} color={TEXT_2} accessible={false} />
              <Text style={s.routeStatText}>
                {fmtMinutes(route.avgDurationMinutes)} avg
              </Text>
            </View>
            <View style={s.routeStatChip}>
              <Ionicons name="flash-outline" size={11} color={GREEN} accessible={false} />
              <Text style={s.routeStatText}>
                {fmtMinutes(route.fastestDurationMinutes)} best
              </Text>
            </View>
            {route.avgDistanceMiles > 0 && (
              <View style={s.routeStatChip}>
                <Ionicons name="map-outline" size={11} color={TEXT_2} accessible={false} />
                <Text style={s.routeStatText}>
                  {route.avgDistanceMiles.toFixed(1)} mi
                </Text>
              </View>
            )}
          </View>

          {/* Day breakdown dots */}
          <View style={s.dayDotsRow}>
            {route.dayBreakdown.map((count, di) => {
              const max = Math.max(...route.dayBreakdown, 1);
              const opacity = 0.2 + (count / max) * 0.8;
              return (
                <View key={di} style={s.dayDotWrap}>
                  <View
                    style={[
                      s.dayDot,
                      {
                        opacity,
                        backgroundColor: count > 0 ? AMBER : TEXT_3,
                      },
                    ]}
                  />
                  <Text style={s.dayDotLabel}>{DAY_ABBREVS[di]}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ))}

      {routes.length > 5 && (
        <TouchableOpacity
          style={s.seeAllBtn}
          onPress={() => setExpanded((v) => !v)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={expanded ? "Show fewer routes" : `See all ${routes.length} routes`}
        >
          <Text style={s.seeAllText}>
            {expanded
              ? "Show less"
              : `See all ${routes.length} routes`}
          </Text>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={14}
            color={AMBER}
            accessible={false}
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Shift Sweet Spots Card ───────────────────────────────────────────────────
function ShiftSweetSpotsCard({ spots }: { spots: ShiftSweetSpot[] }) {
  if (spots.length === 0) return null;

  const maxRate = Math.max(...spots.map((s) => s.avgEarningsPerHourPence), 1);
  const bestIdx = spots.reduce(
    (best, s, i) =>
      s.avgEarningsPerHourPence > spots[best].avgEarningsPerHourPence ? i : best,
    0
  );
  const best = spots[bestIdx];

  return (
    <View style={s.card}>
      <View style={s.cardHeaderRow}>
        <View style={s.cardTitleRow}>
          <Ionicons name="timer-outline" size={16} color={AMBER} accessible={false} />
          <Text style={s.cardTitle}>Best Shift Length</Text>
        </View>
      </View>

      {spots.map((spot, i) => {
        const fill = spot.avgEarningsPerHourPence / maxRate;
        const isBest = i === bestIdx;
        return (
          <View key={i} style={s.sweetSpotRow}>
            <Text
              style={[s.sweetSpotLabel, isBest && s.sweetSpotLabelBest]}
            >
              {spot.durationBucket}
            </Text>
            <View style={s.sweetSpotBarWrap}>
              <View
                style={[
                  s.sweetSpotBar,
                  { width: `${fill * 100}%` as any },
                  isBest && s.sweetSpotBarBest,
                ]}
              />
            </View>
            <Text
              style={[s.sweetSpotRate, isBest && s.sweetSpotRateBest]}
            >
              {formatPence(spot.avgEarningsPerHourPence)}/hr
            </Text>
          </View>
        );
      })}

      {/* Best bucket callout */}
      <View style={s.sweetSpotCallout}>
        <Ionicons name="star" size={13} color={AMBER} accessible={false} />
        <Text style={s.sweetSpotCalloutText}>
          Best: {best.durationBucket} shifts —{" "}
          {best.avgTrips.toFixed(1)} trips &amp; {best.avgMiles.toFixed(1)} mi avg
        </Text>
      </View>
    </View>
  );
}

// ─── Fuel Cost Card ───────────────────────────────────────────────────────────
function FuelCostCard({ fuel }: { fuel: FuelCostBreakdown }) {
  return (
    <View style={s.card}>
      <View style={s.cardHeaderRow}>
        <View style={s.cardTitleRow}>
          <Ionicons name="speedometer-outline" size={16} color={AMBER} accessible={false} />
          <Text style={s.cardTitle}>Running Costs</Text>
        </View>
      </View>

      {/* Hero stat */}
      <View style={s.fuelHero}>
        <Text style={s.fuelHeroValue}>
          {fuel.fuelCostPerMilePence != null
            ? `${fuel.fuelCostPerMilePence.toFixed(1)}p`
            : "—"}
        </Text>
        <Text style={s.fuelHeroLabel}>per mile</Text>
      </View>

      {/* MPG */}
      <View style={s.fuelMpgRow}>
        {fuel.actualMpg != null ? (
          <View style={s.fuelMpgChip}>
            <Ionicons name="checkmark-circle" size={13} color={GREEN} accessible={false} />
            <Text style={[s.fuelMpgText, { color: GREEN }]}>
              {fuel.actualMpg.toFixed(1)} MPG (actual)
            </Text>
          </View>
        ) : fuel.estimatedMpg != null ? (
          <View style={s.fuelMpgChip}>
            <Ionicons name="information-circle-outline" size={13} color={TEXT_2} accessible={false} />
            <Text style={s.fuelMpgText}>
              {fuel.estimatedMpg.toFixed(1)} MPG (estimated)
            </Text>
          </View>
        ) : null}

        {fuel.totalMilesDriven > 0 && (
          <Text style={s.fuelTotalMi}>
            {fuel.totalMilesDriven.toFixed(0)} mi tracked
          </Text>
        )}
      </View>

      {/* Per-vehicle breakdown (only if multiple) */}
      {fuel.perVehicle.length > 1 && (
        <View style={s.fuelVehicleList}>
          <Text style={s.fuelSectionLabel}>By Vehicle</Text>
          {fuel.perVehicle.map((v, i) => (
            <View key={i} style={s.fuelVehicleRow}>
              <View style={s.fuelVehicleInfo}>
                <Ionicons name="car-outline" size={13} color={TEXT_2} accessible={false} />
                <Text style={s.fuelVehicleName} numberOfLines={1}>
                  {v.make} {v.model}
                </Text>
              </View>
              <View style={s.fuelVehicleStats}>
                {v.mpg != null && (
                  <Text style={s.fuelVehicleStat}>{v.mpg.toFixed(1)} MPG</Text>
                )}
                {v.costPerMilePence != null && (
                  <Text style={s.fuelVehicleStat}>
                    {v.costPerMilePence.toFixed(1)}p/mi
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Recent fill-ups */}
      {fuel.recentFillUps.length > 0 && (
        <View style={s.fillUpList}>
          <Text style={s.fuelSectionLabel}>Recent Fill-Ups</Text>
          {fuel.recentFillUps.slice(0, 4).map((f, i) => (
            <View
              key={i}
              style={[
                s.fillUpRow,
                i < Math.min(fuel.recentFillUps.length, 4) - 1 && s.fillUpRowBorder,
              ]}
            >
              <View style={s.fillUpLeft}>
                <Text style={s.fillUpDate}>
                  {new Date(f.date).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                </Text>
                {f.stationName && (
                  <Text style={s.fillUpStation} numberOfLines={1}>
                    {f.stationName}
                  </Text>
                )}
              </View>
              <View style={s.fillUpRight}>
                <Text style={s.fillUpCost}>{formatPence(f.costPence)}</Text>
                <Text style={s.fillUpLitres}>
                  {f.litres.toFixed(1)}L · {f.costPerLitrePence.toFixed(1)}p/L
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Earnings by Day Card ─────────────────────────────────────────────────────
function EarningsByDayCard({ patterns }: { patterns: EarningsDayPattern[] }) {
  if (patterns.length === 0) return null;

  const hasEarnings = patterns.some((p) => p.totalEarningsPence > 0);
  if (!hasEarnings) return null;

  const maxEarnings = Math.max(...patterns.map((p) => p.totalEarningsPence), 1);
  const bestIdx = patterns.reduce(
    (best, p, i) =>
      p.totalEarningsPence > patterns[best].totalEarningsPence ? i : best,
    0
  );
  const best = patterns[bestIdx];

  // Ensure we have all 7 days, fill missing with zeroes
  const sorted = [...patterns].sort((a, b) => a.dayIndex - b.dayIndex);

  return (
    <View style={s.card}>
      <View style={s.cardHeaderRow}>
        <View style={s.cardTitleRow}>
          <Ionicons name="bar-chart-outline" size={16} color={AMBER} accessible={false} />
          <Text style={s.cardTitle}>Best Earning Days</Text>
        </View>
      </View>

      {/* Bar chart */}
      <View style={s.earningsChart}>
        {sorted.map((p, i) => {
          const fill = p.totalEarningsPence / maxEarnings;
          const isBest = p.dayIndex === best.dayIndex;
          return (
            <View key={i} style={s.earningsBarWrap}>
              <View style={s.earningsBarTrack}>
                <View
                  style={[
                    s.earningsBar,
                    { height: `${Math.max(fill * 100, 4)}%` as any },
                    isBest ? s.earningsBarBest : s.earningsBarMuted,
                  ]}
                />
              </View>
              <Text
                style={[
                  s.earningsDayLabel,
                  isBest && s.earningsDayLabelBest,
                ]}
              >
                {DAY_ABBREVS[p.dayIndex]}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Best day callout */}
      <View style={s.earningsCallout}>
        <Ionicons name="trophy-outline" size={13} color={AMBER} accessible={false} />
        <Text style={s.earningsCalloutText}>
          Best day:{" "}
          <Text style={{ color: AMBER }}>
            {DAY_FULL[best.dayIndex]}
          </Text>{" "}
          — avg {formatPence(best.avgEarningsPence)} per session
        </Text>
      </View>
    </View>
  );
}

// ─── Commute Timing Card ──────────────────────────────────────────────────────
function CommuteTimingCard({ commutes }: { commutes: CommuteTiming[] }) {
  if (commutes.length === 0) return null;

  return (
    <View style={s.card}>
      <View style={s.cardHeaderRow}>
        <View style={s.cardTitleRow}>
          <Ionicons name="car-outline" size={16} color={AMBER} accessible={false} />
          <Text style={s.cardTitle}>Commute Intelligence</Text>
        </View>
      </View>

      {commutes.map((commute, ci) => {
        const hoursWithData = commute.byHour.filter((h) => h.tripCount > 0);
        const minAvg = Math.min(...hoursWithData.map((h) => h.avgMinutes), 1);
        const maxAvg = Math.max(...hoursWithData.map((h) => h.avgMinutes), 1);

        return (
          <View
            key={ci}
            style={[
              s.commuteItem,
              ci < commutes.length - 1 && s.commuteItemBorder,
            ]}
          >
            {/* Route label */}
            <Text style={s.commuteRoute}>{commute.routeLabel}</Text>

            {/* Duration stats */}
            <View style={s.commuteDurationRow}>
              <View style={s.commuteDurationStat}>
                <Text style={s.commuteDurationValue}>
                  {fmtMinutes(commute.avgDurationMinutes)}
                </Text>
                <Text style={s.commuteDurationLabel}>avg</Text>
              </View>
              <View style={s.commuteDurationStat}>
                <Text style={[s.commuteDurationValue, { color: GREEN }]}>
                  {fmtMinutes(commute.bestDurationMinutes)}
                </Text>
                <Text style={s.commuteDurationLabel}>best</Text>
              </View>
              <View style={s.commuteDurationStat}>
                <Text style={[s.commuteDurationValue, { color: RED }]}>
                  {fmtMinutes(commute.worstDurationMinutes)}
                </Text>
                <Text style={s.commuteDurationLabel}>worst</Text>
              </View>
            </View>

            {/* Best departure time */}
            <View style={s.commuteBestDepart}>
              <Ionicons name="alarm-outline" size={13} color={AMBER} accessible={false} />
              <Text style={s.commuteBestDepartText}>
                {commute.bestDepartureLabel} for quickest journey
              </Text>
            </View>

            {/* By-hour mini chart (only hours with data) */}
            {hoursWithData.length > 1 && (
              <View style={s.commuteHourChart}>
                {hoursWithData.map((h, hi) => {
                  const range = maxAvg - minAvg || 1;
                  // Taller bar = worse time (more minutes)
                  const fill = (h.avgMinutes - minAvg) / range;
                  const isBest = h.hour === commute.bestDepartureHour;
                  return (
                    <View key={hi} style={s.commuteHourWrap}>
                      <View style={s.commuteHourTrack}>
                        <View
                          style={[
                            s.commuteHourBar,
                            {
                              height: `${Math.max(fill * 100, 8)}%` as any,
                            },
                            isBest
                              ? s.commuteHourBarBest
                              : s.commuteHourBarMuted,
                          ]}
                        />
                      </View>
                      <Text
                        style={[
                          s.commuteHourLabel,
                          isBest && s.commuteHourLabelBest,
                        ]}
                        numberOfLines={1}
                      >
                        {fmtHour(h.hour)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AnalyticsScreen() {
  const { isWork } = useMode();

  const [analytics, setAnalytics] = useState<DrivingAnalytics | null>(null);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [weeksBack, setWeeksBack] = useState(0);
  const [loading, setLoading] = useState(true);
  const [weekLoading, setWeekLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadAnalytics = useCallback(async () => {
    try {
      const res = await fetchDrivingAnalytics();
      setAnalytics(res.data);
      setWeeklyReport(res.data.weeklyReport);
    } catch {
      // Silently fail — show partial UI if possible
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const loadWeeklyReport = useCallback(async (wb: number) => {
    setWeekLoading(true);
    try {
      const res = await fetchWeeklyReport(wb);
      setWeeklyReport(res.data);
    } catch {
      // Keep existing report on failure
    } finally {
      setWeekLoading(false);
    }
  }, []);

  const handlePrevWeek = useCallback(() => {
    const next = weeksBack + 1;
    setWeeksBack(next);
    loadWeeklyReport(next);
  }, [weeksBack, loadWeeklyReport]);

  const handleNextWeek = useCallback(() => {
    if (weeksBack === 0) return;
    const next = weeksBack - 1;
    setWeeksBack(next);
    loadWeeklyReport(next);
  }, [weeksBack, loadWeeklyReport]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setWeeksBack(0);
    loadAnalytics();
  }, [loadAnalytics]);

  if (loading) {
    return (
      <View style={s.loadingContainer}>
        <Stack.Screen
          options={{
            title: "Driving Analytics",
            headerStyle: { backgroundColor: BG },
            headerTintColor: TEXT_1,
            headerTitleStyle: {
              fontFamily: "PlusJakartaSans_600SemiBold",
              color: TEXT_1,
            },
          }}
        />
        <ActivityIndicator size="large" color={AMBER} accessibilityLabel="Loading analytics" />
        <Text style={s.loadingText}>Loading analytics…</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <Stack.Screen
        options={{
          title: "Driving Analytics",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT_1,
          headerTitleStyle: {
            fontFamily: "PlusJakartaSans_600SemiBold",
            color: TEXT_1,
          },
        }}
      />

      <PremiumGate feature="Driving Analytics">
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={AMBER}
          />
        }
      >
        {/* 1. Weekly Report */}
        <WeeklyReportCard
          report={weeklyReport}
          weeksBack={weeksBack}
          onPrev={handlePrevWeek}
          onNext={handleNextWeek}
          isPersonal={!isWork}
          loading={weekLoading}
        />

        {/* 2. Frequent Routes */}
        {analytics && analytics.frequentRoutes.length > 0 && (
          <FrequentRoutesCard routes={analytics.frequentRoutes} />
        )}

        {/* 3. Shift Sweet Spots (work mode only) */}
        {isWork && analytics && analytics.shiftSweetSpots.length > 0 && (
          <ShiftSweetSpotsCard spots={analytics.shiftSweetSpots} />
        )}

        {/* 4. Fuel Cost */}
        {analytics && (
          <FuelCostCard fuel={analytics.fuelCost} />
        )}

        {/* 5. Earnings by Day (work mode only) */}
        {isWork && analytics && (
          <EarningsByDayCard patterns={analytics.earningsByDay} />
        )}

        {/* 6. Commute Timing */}
        {analytics && analytics.commuteTiming.length > 0 && (
          <CommuteTimingCard commutes={analytics.commuteTiming} />
        )}

        {/* Empty state */}
        {analytics &&
          analytics.frequentRoutes.length === 0 &&
          analytics.commuteTiming.length === 0 &&
          analytics.fuelCost.recentFillUps.length === 0 && (
            <View style={s.emptyState}>
              <Ionicons name="analytics-outline" size={40} color={TEXT_3} accessible={false} />
              <Text style={s.emptyTitle}>No data yet</Text>
              <Text style={s.emptySubtitle}>
                Complete a few trips and shifts to see your driving analytics.
              </Text>
            </View>
          )}

        <View style={{ height: 40 }} />
      </ScrollView>
      </PremiumGate>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Layout
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    padding: 16,
    paddingTop: 12,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: BG,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_2,
  },

  // Card base
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 12,
  },
  cardLoading: {
    alignItems: "center",
    paddingVertical: 24,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flex: 1,
    flexWrap: "wrap",
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_700Bold",
    color: TEXT_1,
  },

  // Week navigation
  navRow: {
    flexDirection: "row",
    gap: 4,
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: BORDER,
  },
  navBtnDisabled: {
    opacity: 0.35,
  },

  // Week label chip
  weekLabelChip: {
    backgroundColor: "rgba(245,166,35,0.1)",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.2)",
  },
  weekLabelText: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_500Medium",
    color: AMBER,
  },

  // Count chip
  countChip: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  countChipText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_2,
  },

  // Weekly columns
  weekColumns: {
    flexDirection: "row",
    gap: 0,
    marginBottom: 12,
  },
  weekCol: {
    flex: 1,
    gap: 6,
  },
  weekColMuted: {
    opacity: 0.55,
  },
  weekDivider: {
    width: 1,
    backgroundColor: BORDER,
    marginHorizontal: 12,
    marginVertical: 4,
  },
  weekColTitle: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: AMBER,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  weekStatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  weekStatLabel: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
  },
  weekStatValue: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
  },

  // Week totals row
  weekTotalsRow: {
    flexDirection: "row",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 12,
    marginTop: 2,
  },
  weekTotal: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  weekTotalStreak: {
    backgroundColor: "rgba(245,166,35,0.06)",
    borderColor: "rgba(245,166,35,0.15)",
  },
  weekTotalValue: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_700Bold",
    color: TEXT_1,
  },
  weekTotalLabel: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_2,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  streakValue: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_700Bold",
    color: AMBER,
  },

  // Delta row
  deltaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 10,
  },
  deltaRowLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_2,
    marginRight: 2,
  },
  deltaRowSep: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
  },
  deltaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  deltaBadgeGreen: {
    backgroundColor: "rgba(16,185,129,0.12)",
  },
  deltaBadgeRed: {
    backgroundColor: "rgba(239,68,68,0.12)",
  },
  deltaBadgeText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },

  // Achievements row
  achievementRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 10,
    backgroundColor: "rgba(245,166,35,0.06)",
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.1)",
  },
  achievementRowLabel: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: AMBER,
  },
  achievementChip: {
    backgroundColor: "rgba(245,166,35,0.15)",
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  achievementChipText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: AMBER,
  },

  // Routes
  routeItem: {
    paddingVertical: 12,
  },
  routeItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  routeAddresses: {
    marginBottom: 8,
    gap: 2,
  },
  routeAddressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  routeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: GREEN,
    marginLeft: 1,
  },
  routeDotEnd: {
    backgroundColor: RED,
  },
  routeLine: {
    width: 2,
    height: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginLeft: 4,
    marginVertical: 1,
  },
  routeAddress: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_1,
    flex: 1,
  },
  routeStatsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  routeStatChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  routeStatText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_2,
  },

  // Day dots
  dayDotsRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 2,
  },
  dayDotWrap: {
    alignItems: "center",
    gap: 3,
  },
  dayDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dayDotLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_3,
  },

  // See all button
  seeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingTop: 12,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  seeAllText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: AMBER,
  },

  // Sweet spots
  sweetSpotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  sweetSpotLabel: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_2,
    width: 60,
  },
  sweetSpotLabelBest: {
    color: AMBER,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  sweetSpotBarWrap: {
    flex: 1,
    height: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 4,
    overflow: "hidden",
  },
  sweetSpotBar: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  sweetSpotBarBest: {
    backgroundColor: AMBER,
  },
  sweetSpotRate: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_2,
    width: 56,
    textAlign: "right",
  },
  sweetSpotRateBest: {
    color: AMBER,
  },
  sweetSpotCallout: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(245,166,35,0.06)",
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.1)",
  },
  sweetSpotCalloutText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_2,
    flex: 1,
  },

  // Fuel
  fuelHero: {
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    marginBottom: 12,
  },
  fuelHeroValue: {
    fontSize: 36,
    fontFamily: "PlusJakartaSans_700Bold",
    color: AMBER,
  },
  fuelHeroLabel: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_2,
    marginTop: 2,
  },
  fuelMpgRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    flexWrap: "wrap",
    gap: 8,
  },
  fuelMpgChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: BORDER,
  },
  fuelMpgText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_2,
  },
  fuelTotalMi: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
  },
  fuelSectionLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_2,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 8,
    marginTop: 4,
  },
  fuelVehicleList: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 12,
    marginBottom: 4,
  },
  fuelVehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  fuelVehicleInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  fuelVehicleName: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_1,
    flex: 1,
  },
  fuelVehicleStats: {
    flexDirection: "row",
    gap: 8,
  },
  fuelVehicleStat: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_2,
  },
  fillUpList: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 12,
  },
  fillUpRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  fillUpRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  fillUpLeft: {
    flex: 1,
    gap: 2,
  },
  fillUpDate: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
  },
  fillUpStation: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
  },
  fillUpRight: {
    alignItems: "flex-end",
    gap: 2,
  },
  fillUpCost: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_700Bold",
    color: TEXT_1,
  },
  fillUpLitres: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
  },

  // Earnings by Day
  earningsChart: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 100,
    gap: 6,
    marginBottom: 10,
  },
  earningsBarWrap: {
    flex: 1,
    alignItems: "center",
    gap: 5,
    height: "100%",
  },
  earningsBarTrack: {
    flex: 1,
    width: "100%",
    justifyContent: "flex-end",
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.04)",
    overflow: "hidden",
  },
  earningsBar: {
    width: "100%",
    borderRadius: 4,
  },
  earningsBarBest: {
    backgroundColor: AMBER,
  },
  earningsBarMuted: {
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  earningsDayLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_2,
  },
  earningsDayLabelBest: {
    color: AMBER,
    fontFamily: "PlusJakartaSans_700Bold",
  },
  earningsCallout: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(245,166,35,0.06)",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.1)",
    marginTop: 2,
  },
  earningsCalloutText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_2,
    flex: 1,
  },

  // Commute
  commuteItem: {
    paddingVertical: 12,
  },
  commuteItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    marginBottom: 4,
  },
  commuteRoute: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
    marginBottom: 10,
  },
  commuteDurationRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  commuteDurationStat: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 8,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },
  commuteDurationValue: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_700Bold",
    color: TEXT_1,
  },
  commuteDurationLabel: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_2,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginTop: 2,
  },
  commuteBestDepart: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(245,166,35,0.08)",
    borderRadius: 8,
    padding: 9,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.15)",
  },
  commuteBestDepartText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: AMBER,
    flex: 1,
  },
  commuteHourChart: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 56,
    gap: 4,
  },
  commuteHourWrap: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    height: "100%",
  },
  commuteHourTrack: {
    flex: 1,
    width: "100%",
    justifyContent: "flex-end",
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.04)",
    overflow: "hidden",
  },
  commuteHourBar: {
    width: "100%",
    borderRadius: 3,
  },
  commuteHourBarBest: {
    backgroundColor: AMBER,
  },
  commuteHourBarMuted: {
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  commuteHourLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
  },
  commuteHourLabelBest: {
    color: AMBER,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_700Bold",
    color: TEXT_1,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    textAlign: "center",
    maxWidth: SCREEN_W * 0.7,
    lineHeight: 20,
  },
});
