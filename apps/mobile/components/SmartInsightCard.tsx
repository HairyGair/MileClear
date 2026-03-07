import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { GamificationStats, Vehicle } from "@mileclear/shared";
import {
  type Insight,
  getTopInsights,
  dismissInsight,
} from "../lib/insights/index";

interface SmartInsightCardProps {
  stats: GamificationStats | null;
  vehicles: Vehicle[];
  isPremium: boolean;
  isWork: boolean;
  unclassifiedCount?: number;
}

export function SmartInsightCard({
  stats,
  vehicles,
  isPremium,
  isWork,
  unclassifiedCount,
}: SmartInsightCardProps) {
  const router = useRouter();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    getTopInsights({ stats, vehicles, isPremium, isWork, unclassifiedCount }, 5).then(
      setInsights
    );
  }, [stats, vehicles, isPremium, isWork, unclassifiedCount]);

  const handleDismiss = useCallback(async () => {
    const current = insights[currentIndex];
    if (!current) return;

    await dismissInsight(current.id);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    const remaining = insights.filter((_, i) => i !== currentIndex);
    setInsights(remaining);
    if (currentIndex >= remaining.length) {
      setCurrentIndex(Math.max(0, remaining.length - 1));
    }
  }, [insights, currentIndex]);

  const handleAction = useCallback(() => {
    const current = insights[currentIndex];
    if (current?.actionRoute) {
      router.push(current.actionRoute as any);
    }
  }, [insights, currentIndex, router]);

  const handleCycle = useCallback(() => {
    if (insights.length <= 1) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCurrentIndex((prev) => (prev + 1) % insights.length);
  }, [insights.length]);

  if (insights.length === 0) return null;

  const insight = insights[currentIndex];
  if (!insight) return null;

  const borderColor =
    insight.priority === "urgent"
      ? "#ef4444"
      : insight.priority === "actionable"
        ? "#f59e0b"
        : insight.priority === "positive"
          ? "#10b981"
          : "#6366f1";

  return (
    <View style={[s.card, { borderLeftColor: borderColor }]}>
      <View style={s.header}>
        <View style={[s.iconWrap, { backgroundColor: insight.iconColor + "18" }]}>
          <Ionicons
            name={insight.icon as any}
            size={18}
            color={insight.iconColor}
          />
        </View>
        <View style={s.textWrap}>
          <Text style={s.title} numberOfLines={1}>
            {insight.title}
          </Text>
          <Text style={s.body} numberOfLines={2}>
            {insight.body}
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleDismiss}
          hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
          style={s.dismissBtn}
        >
          <Ionicons name="close" size={16} color="#6b7280" />
        </TouchableOpacity>
      </View>

      {(insight.actionLabel || insights.length > 1) && (
        <View style={s.footer}>
          {insight.actionLabel ? (
            <TouchableOpacity onPress={handleAction} style={s.actionBtn}>
              <Text style={[s.actionText, { color: insight.iconColor }]}>
                {insight.actionLabel}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={14}
                color={insight.iconColor}
              />
            </TouchableOpacity>
          ) : (
            <View />
          )}
          {insights.length > 1 && (
            <TouchableOpacity onPress={handleCycle} style={s.cycleBtn}>
              <View style={s.dots}>
                {insights.map((_, i) => (
                  <View
                    key={i}
                    style={[s.dot, i === currentIndex && s.dotActive]}
                  />
                ))}
              </View>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: "#0a1120",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    borderLeftWidth: 3,
    padding: 14,
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  textWrap: {
    flex: 1,
    paddingTop: 1,
  },
  title: {
    color: "#f0f2f5",
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    marginBottom: 2,
  },
  body: {
    color: "#8494a7",
    fontSize: 12.5,
    fontFamily: "PlusJakartaSans_400Regular",
    lineHeight: 17,
  },
  dismissBtn: {
    paddingTop: 2,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.04)",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  actionText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  cycleBtn: {
    padding: 4,
  },
  dots: {
    flexDirection: "row",
    gap: 5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  dotActive: {
    backgroundColor: "#f5a623",
    width: 12,
  },
});
