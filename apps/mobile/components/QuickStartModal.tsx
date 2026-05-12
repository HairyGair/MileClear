import { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppModal } from "./AppModal";
import { colors, fonts, radii, spacing, fontScaleCap } from "../lib/theme";
import { getDatabase } from "../lib/db";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

/**
 * Quick Start — first-launch tutorial. 5 cards introducing the core
 * value loop of MileClear: tracking → classifying → tax readiness →
 * tax submission. Fires once per install (gated by tracking_state
 * key 'quick_start_shown'), can be replayed from Help & Tutorials.
 *
 * Deliberately not a full walkthrough of every screen — it's the
 * "elevator pitch" version so a new user understands what they're
 * looking at when they land on the dashboard. Detailed how-tos live
 * in the Help screen.
 */

interface Card {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}

const CARDS: Card[] = [
  {
    icon: "speedometer-outline",
    title: "Every mile, automatically",
    body: "Drive past 15mph and MileClear starts recording in the background. Set Home and Work as saved locations and we'll auto-detect those routes too. Your Lock Screen shows the trip live while you drive.",
  },
  {
    icon: "swap-horizontal-outline",
    title: "Tag it Work or Personal",
    body: "After each trip, tag it as Work (counts toward HMRC) or Personal (just for your records). Do the same A→B journey three times and we'll auto-classify the fourth — taps disappear fast.",
  },
  {
    icon: "calculator-outline",
    title: "Real-time tax estimate",
    body: "The Tax Readiness card on your dashboard shows what you'll owe HMRC at year-end, updated live as you drive. The 'Set aside this week' figure tells you exactly what to save — no surprises in January.",
  },
  {
    icon: "cloud-upload-outline",
    title: "Submit straight to HMRC",
    body: "From April 2026, sole traders earning £50k+ must submit four quarterly returns to HMRC. MileClear Pro does this for you — Connect once, preview every quarter, tap Submit. No paperwork.",
  },
  {
    icon: "checkmark-circle",
    title: "You're set",
    body: "Add your vehicle in Settings → Vehicles to get started. Tap your avatar any time for Help & Tutorials. Drive safe.",
  },
];

interface QuickStartModalProps {
  visible: boolean;
  onClose: () => void;
}

export function QuickStartModal({ visible, onClose }: QuickStartModalProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);

  const goToPage = useCallback((p: number) => {
    scrollRef.current?.scrollTo({ x: p * SCREEN_WIDTH, animated: true });
    setPage(p);
  }, []);

  const handleScroll = useCallback((event: any) => {
    const x = event.nativeEvent.contentOffset.x;
    setPage(Math.round(x / SCREEN_WIDTH));
  }, []);

  const handleFinish = useCallback(async () => {
    try {
      const db = await getDatabase();
      await db.runAsync(
        "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('quick_start_shown', '1')"
      );
    } catch {
      // Swallow — worst case the tour fires again on next launch.
    }
    onClose();
  }, [onClose]);

  const isLast = page === CARDS.length - 1;

  return (
    <AppModal visible={visible} onRequestClose={handleFinish}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.headerRow}>
            <View style={styles.dots} accessible={false}>
              {CARDS.map((_, i) => (
                <View key={i} style={[styles.dot, page === i && styles.dotActive]} />
              ))}
            </View>
            <TouchableOpacity
              onPress={handleFinish}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Skip Quick Start"
            >
              <Text style={styles.skipText} maxFontSizeMultiplier={fontScaleCap.body}>
                Skip
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleScroll}
          >
            {CARDS.map((card) => (
              <View key={card.title} style={[styles.page, { width: SCREEN_WIDTH }]}>
                <View style={styles.iconWrap}>
                  <Ionicons name={card.icon} size={40} color={colors.amber} />
                </View>
                <Text
                  style={styles.title}
                  maxFontSizeMultiplier={fontScaleCap.heading}
                >
                  {card.title}
                </Text>
                <Text
                  style={styles.body}
                  maxFontSizeMultiplier={fontScaleCap.body}
                >
                  {card.body}
                </Text>
              </View>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.nextBtn}
              onPress={() => (isLast ? handleFinish() : goToPage(page + 1))}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={isLast ? "Get started with MileClear" : "Next card"}
            >
              <Text style={styles.nextBtnText} maxFontSizeMultiplier={fontScaleCap.body}>
                {isLast ? "Get started" : "Next"}
              </Text>
              <Ionicons
                name={isLast ? "checkmark" : "arrow-forward"}
                size={18}
                color={colors.bg}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingBottom: spacing.xl,
    minHeight: "70%",
    maxHeight: "92%",
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  dots: {
    flexDirection: "row",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  dotActive: {
    width: 22,
    backgroundColor: colors.amber,
  },
  skipText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.text2,
  },
  page: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xl,
    alignItems: "center",
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: colors.amberDim,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.3)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: 24,
    fontFamily: fonts.bold,
    color: colors.text1,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  body: {
    fontSize: 15,
    fontFamily: fonts.regular,
    color: colors.text2,
    textAlign: "center",
    lineHeight: 23,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.amber,
    paddingVertical: 16,
    borderRadius: radii.md,
  },
  nextBtnText: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.bg,
  },
});
