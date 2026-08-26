import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { getDatabase } from "../lib/db";
import { useUser } from "../lib/user/context";
import { colors, fonts } from "../lib/theme";

// Must match the key written by app/nominate-manager.tsx on a successful
// submission — both files own this string independently (see that file
// for the matching comment) rather than sharing a helper module, so a
// mismatch here would show the card forever. Keep them in sync.
/** Exported so the form screen writes the same key. Two independent copies of
 *  a persistence key drift the moment one of them is renamed. */
export const NOMINATE_PROMPT_STATE_KEY = "nominate_manager_prompt_state";
const STATE_KEY = NOMINATE_PROMPT_STATE_KEY;

type PromptState = "checking" | "open" | "closed";

interface NominateManagerCardProps {
  /** True once the driver has at least one trip marked Business. */
  hasBusinessMileage: boolean;
}

/**
 * The highest-priority item on the roadmap: companies almost never search
 * for a mileage tool (140 UK searches/month across every employer
 * keyword), but driver-side search is ten times that and we already have
 * the drivers. So the acquisition route is a driver telling us they claim
 * from an employer, and us inviting their manager into Milesheet.
 *
 * Gated hard so it never nags a gig worker: hidden once the driver is
 * already in a company (fetched via useUser), unless they look like an
 * employee (workType is employee/both, or they already have a business
 * trip on record), and only until they've answered once. "Yes" opens the
 * form; "No" and the close button both record the decision locally and
 * for good — we never ask again, and we never phone home just to ask.
 */
export function NominateManagerCard({ hasBusinessMileage }: NominateManagerCardProps) {
  const { user, isCompanyDriver } = useUser();
  const router = useRouter();
  const [state, setState] = useState<PromptState>("checking");

  const refresh = useCallback(async () => {
    try {
      const db = await getDatabase();
      const row = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = ?",
        [STATE_KEY]
      );
      setState(row ? "closed" : "open");
    } catch {
      // Unreadable local state — fail open. Worst case we ask once more
      // than we should; we must never nag, so never fail closed either.
      setState("open");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const looksLikeEmployee =
    user?.workType === "employee" || user?.workType === "both" || hasBusinessMileage;

  if (state !== "open" || isCompanyDriver || !looksLikeEmployee) return null;

  const decline = async () => {
    setState("closed");
    try {
      const db = await getDatabase();
      await db.runAsync(
        "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)",
        [STATE_KEY, "declined"]
      );
    } catch {
      // Local write failed — the card may reappear next launch. Harmless.
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Ionicons name="briefcase-outline" size={18} color={colors.amber} accessible={false} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Do you claim mileage back from work?</Text>
          <Text style={styles.body}>
            If your employer reimburses your mileage, we can invite your manager to Milesheet,
            the company side of MileClear, so they can approve it each month.
          </Text>
        </View>
        <TouchableOpacity
          onPress={decline}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="No, dismiss this"
        >
          <Ionicons name="close" size={16} color="#6b7280" accessible={false} />
        </TouchableOpacity>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnPrimary]}
          onPress={() => router.push("/nominate-manager" as any)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Yes, invite my manager to Milesheet"
        >
          <Text style={styles.actionBtnTextPrimary}>Yes, invite my manager</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={decline}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="No, I don't claim mileage from an employer"
        >
          <Text style={styles.actionBtnText}>No</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(245, 166, 35, 0.06)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.18)",
    padding: 14,
    marginBottom: 12,
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(245, 166, 35, 0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: colors.text1, fontSize: 14, fontFamily: fonts.semibold, marginBottom: 2 },
  body: { color: colors.text2, fontSize: 12.5, fontFamily: fonts.regular, lineHeight: 17 },
  closeBtn: {
    width: 44,
    height: 44,
    marginTop: -13,
    marginRight: -13,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.35)",
    backgroundColor: "rgba(245, 166, 35, 0.06)",
  },
  actionBtnPrimary: {
    backgroundColor: colors.amber,
    borderColor: colors.amber,
  },
  actionBtnText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.amber,
  },
  actionBtnTextPrimary: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: "#0b0e14",
  },
});
