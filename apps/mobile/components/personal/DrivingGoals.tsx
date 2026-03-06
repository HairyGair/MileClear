/**
 * DrivingGoals — personal weekly mileage goal card
 *
 * Persists the target to SQLite tracking_state using the key
 * 'personal_goal_miles'. Reads on mount and after every save.
 *
 * Usage:
 *   import { DrivingGoals } from "../components/personal/DrivingGoals";
 *   <DrivingGoals weekMiles={23.4} />
 */

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getDatabase } from "../../lib/db/index";

// ─── Constants ───────────────────────────────────────────────────────────────

const GOAL_KEY = "personal_goal_miles";
const PROGRESS_BAR_HEIGHT = 7;

// ─── Types ───────────────────────────────────────────────────────────────────

interface DrivingGoalsProps {
  weekMiles: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMiles(miles: number): string {
  if (miles < 10) return miles.toFixed(1);
  return Math.round(miles).toLocaleString("en-GB");
}

function getStatusMessage(
  weekMiles: number,
  target: number
): { text: string; color: string } {
  const remaining = target - weekMiles;
  const pct = Math.round((weekMiles / target) * 100);

  if (weekMiles === 0) {
    return { text: "No miles recorded yet this week", color: "#4a5568" };
  }
  if (remaining <= 0) {
    const over = Math.abs(remaining);
    return {
      text:
        over < 0.1
          ? "You hit your target exactly!"
          : `${formatMiles(over)} miles over target`,
      color: "#ef4444",
    };
  }
  if (pct >= 80) {
    return {
      text: `Almost there — ${formatMiles(remaining)} miles to go`,
      color: "#10b981",
    };
  }
  if (pct >= 50) {
    return {
      text: `On track — ${formatMiles(remaining)} miles to go`,
      color: "#10b981",
    };
  }
  return {
    text: `${formatMiles(remaining)} miles left this week`,
    color: "#8494a7",
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DrivingGoals({ weekMiles }: DrivingGoalsProps) {
  const [target, setTarget] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Animated value for the progress bar width (0–1)
  const progressAnim = useRef(new Animated.Value(0)).current;

  // ── Load from SQLite ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const db = await getDatabase();
        const row = await db.getFirstAsync<{ value: string }>(
          "SELECT value FROM tracking_state WHERE key = ?",
          [GOAL_KEY]
        );
        if (!cancelled) {
          const parsed = row ? parseFloat(row.value) : null;
          setTarget(parsed && isFinite(parsed) && parsed > 0 ? parsed : null);
        }
      } catch {
        // Silently ignore — goal is non-critical
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Animate progress bar whenever target or weekMiles changes ─────────────
  useEffect(() => {
    if (target === null || target <= 0) {
      progressAnim.setValue(0);
      return;
    }
    const pct = Math.min(weekMiles / target, 1);
    Animated.spring(progressAnim, {
      toValue: pct,
      tension: 60,
      friction: 10,
      useNativeDriver: false, // width % not supported by native driver
    }).start();
  }, [weekMiles, target, progressAnim]);

  // ── Persist goal to SQLite ────────────────────────────────────────────────
  async function saveGoal(miles: number) {
    try {
      const db = await getDatabase();
      await db.runAsync(
        "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)",
        [GOAL_KEY, String(miles)]
      );
      setTarget(miles);
    } catch {
      Alert.alert("Error", "Could not save your goal. Please try again.");
    }
  }

  async function clearGoal() {
    try {
      const db = await getDatabase();
      await db.runAsync("DELETE FROM tracking_state WHERE key = ?", [GOAL_KEY]);
      setTarget(null);
      progressAnim.setValue(0);
    } catch {
      Alert.alert("Error", "Could not clear your goal. Please try again.");
    }
  }

  // ── Prompt helpers ────────────────────────────────────────────────────────
  function promptSetGoal(prefill?: string) {
    if (Platform.OS === "ios") {
      Alert.prompt(
        "Weekly Miles Goal",
        "Set your target miles for this week (e.g. 50).\nDriving less than your goal keeps you on track.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Save",
            onPress: (value: string | undefined) => {
              if (!value) return;
              const parsed = parseFloat(value.trim());
              if (!isFinite(parsed) || parsed <= 0) {
                Alert.alert(
                  "Invalid number",
                  "Please enter a positive number of miles."
                );
                return;
              }
              saveGoal(Math.round(parsed * 10) / 10);
            },
          },
        ],
        "plain-text",
        prefill ?? "",
        "number-pad"
      );
    } else {
      // Android — two-step approach: confirm then fallback
      // Alert.prompt is iOS-only; on Android we use a simple confirm flow
      // prompting the user to edit via a pre-seeded value shown in the message.
      const currentVal = prefill ?? (target ? String(target) : "");
      Alert.alert(
        "Weekly Miles Goal",
        `Current target: ${currentVal || "none"}\n\nEnter your new weekly target in the box below.\n\nTip: type a number then tap Save.`,
        [
          { text: "Cancel", style: "cancel" },
          ...(target !== null
            ? [
                {
                  text: "Clear goal",
                  style: "destructive" as const,
                  onPress: clearGoal,
                },
              ]
            : []),
          {
            text: "Set to 25 mi",
            onPress: () => saveGoal(25),
          },
          {
            text: "Set to 50 mi",
            onPress: () => saveGoal(50),
          },
          {
            text: "Set to 100 mi",
            onPress: () => saveGoal(100),
          },
        ]
      );
    }
  }

  function confirmClearGoal() {
    Alert.alert(
      "Clear Goal",
      "Remove your weekly mileage goal?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: clearGoal,
        },
      ]
    );
  }

  // ── Loading state — render nothing to avoid layout jump ──────────────────
  if (loading) return null;

  // ── No goal set: render nothing on dashboard (goal is set via Profile) ────
  if (target === null) return null;

  // ── Goal set: show progress ───────────────────────────────────────────────
  const progressPct = Math.min(weekMiles / target, 1);
  const isOver = weekMiles > target;
  const isComplete = weekMiles >= target;
  const status = getStatusMessage(weekMiles, target);

  const progressColor = isOver
    ? "#ef4444"
    : progressPct >= 0.8
    ? "#10b981"
    : "#f5a623";

  // Animated bar width as a percentage string
  const animatedWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.card}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={styles.iconWrap}>
          <Ionicons
            name={isComplete ? "checkmark-circle" : "flag"}
            size={16}
            color={isComplete ? "#10b981" : "#f5a623"}
          />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Weekly Goal</Text>
          <Text style={styles.subtitle}>
            {isOver ? "Limit" : "Target"}: {formatMiles(target)} miles
          </Text>
        </View>

        {/* Edit / clear buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => promptSetGoal(String(target))}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
          >
            <Ionicons name="pencil" size={14} color="#8494a7" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={confirmClearGoal}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
          >
            <Ionicons name="close" size={15} color="#4a5568" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Miles reading */}
      <View style={styles.milesRow}>
        <Text style={[styles.milesValue, isOver && styles.milesValueOver]}>
          {formatMiles(weekMiles)}
        </Text>
        <Text style={styles.milesSlash}> / </Text>
        <Text style={styles.milesTarget}>{formatMiles(target)}</Text>
        <Text style={styles.milesUnit}> miles</Text>

        {/* Percentage badge */}
        <View
          style={[
            styles.pctBadge,
            {
              backgroundColor: isOver
                ? "rgba(239,68,68,0.12)"
                : isComplete
                ? "rgba(16,185,129,0.12)"
                : "rgba(245,166,35,0.10)",
            },
          ]}
        >
          <Text
            style={[
              styles.pctText,
              {
                color: isOver
                  ? "#ef4444"
                  : isComplete
                  ? "#10b981"
                  : "#f5a623",
              },
            ]}
          >
            {Math.round(progressPct * 100)}%
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBg}>
        <Animated.View
          style={[
            styles.progressFill,
            {
              width: animatedWidth,
              backgroundColor: progressColor,
            },
          ]}
        />
        {/* 100% marker line */}
        {isOver && (
          <View style={styles.overflowIndicator} />
        )}
      </View>

      {/* Status message */}
      <View style={styles.statusRow}>
        <Ionicons
          name={
            isOver
              ? "warning-outline"
              : isComplete
              ? "checkmark-circle-outline"
              : "information-circle-outline"
          }
          size={13}
          color={status.color}
        />
        <Text style={[styles.statusText, { color: status.color }]}>
          {status.text}
        </Text>
      </View>

      {/* Success banner */}
      {isComplete && !isOver && (
        <View style={styles.successBanner}>
          <Ionicons name="trophy" size={13} color="#10b981" />
          <Text style={styles.successText}>
            Goal achieved this week — well done!
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#0a1120",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },

  // ── Empty state ──
  emptyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f0f2f5",
  },
  emptySubtitle: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#4a5568",
    marginTop: 2,
  },
  setGoalBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#f5a623",
    borderRadius: 10,
    paddingVertical: 11,
  },
  setGoalBtnText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
    letterSpacing: 0.1,
  },

  // ── Goal set state ──
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(245, 166, 35, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f0f2f5",
  },
  subtitle: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#4a5568",
    marginTop: 1,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  actionBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    justifyContent: "center",
    alignItems: "center",
  },

  // ── Miles reading ──
  milesRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 12,
    flexWrap: "wrap",
  },
  milesValue: {
    fontSize: 28,
    fontFamily: "PlusJakartaSans_300Light",
    color: "#f5a623",
    letterSpacing: -0.8,
  },
  milesValueOver: {
    color: "#ef4444",
  },
  milesSlash: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_300Light",
    color: "#4a5568",
  },
  milesTarget: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#8494a7",
  },
  milesUnit: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#4a5568",
    marginLeft: 2,
  },
  pctBadge: {
    marginLeft: "auto",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "center",
  },
  pctText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_700Bold",
    letterSpacing: 0.2,
  },

  // ── Progress bar ──
  progressBg: {
    height: PROGRESS_BAR_HEIGHT,
    borderRadius: PROGRESS_BAR_HEIGHT / 2,
    backgroundColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
    marginBottom: 10,
  },
  progressFill: {
    height: "100%",
    borderRadius: PROGRESS_BAR_HEIGHT / 2,
  },
  overflowIndicator: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
  },

  // ── Status ──
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statusText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    flexShrink: 1,
  },

  // ── Success banner ──
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.04)",
  },
  successText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#10b981",
  },
});
