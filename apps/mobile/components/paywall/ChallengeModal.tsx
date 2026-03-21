import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getDatabase } from "../../lib/db/index";
import { Button } from "../Button";

const BG = "#030712";
const CARD_BG = "#0a1120";
const AMBER = "#f5a623";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#64748b";
const SUCCESS = "#10b981";

interface ChallengeModalProps {
  visible: boolean;
  onClose: () => void;
}

export function ChallengeModal({ visible, onClose }: ChallengeModalProps) {
  const [daysCompleted, setDaysCompleted] = useState(0);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        const db = await getDatabase();
        const row = await db.getFirstAsync<{ value: string }>(
          "SELECT value FROM tracking_state WHERE key = 'challenge_days_completed'"
        );
        setDaysCompleted(row ? parseInt(row.value, 10) : 0);
      } catch {}
    })();
  }, [visible]);

  const handleAccept = useCallback(async () => {
    try {
      const db = await getDatabase();
      const today = new Date().toISOString().slice(0, 10);
      await db.runAsync(
        "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('challenge_offered', 'true')"
      );
      await db.runAsync(
        "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('challenge_start_date', ?)",
        [today]
      );
      await db.runAsync(
        "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('challenge_days_completed', '0')"
      );
    } catch {}
    onClose();
  }, [onClose]);

  const handleDecline = useCallback(async () => {
    try {
      const db = await getDatabase();
      await db.runAsync(
        "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('challenge_offered', 'true')"
      );
    } catch {}
    onClose();
  }, [onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.iconWrap}>
            <Ionicons name="trophy" size={36} color={AMBER} />
          </View>

          <Text style={s.heading}>3-Day Challenge</Text>
          <Text style={s.subtitle}>
            Track 3 days in a row and unlock a special Pro offer.
          </Text>

          {/* Progress dots */}
          <View style={s.progressRow}>
            {[1, 2, 3].map((day) => (
              <View key={day} style={s.progressItem}>
                <View
                  style={[
                    s.progressDot,
                    daysCompleted >= day && s.progressDotCompleted,
                  ]}
                >
                  {daysCompleted >= day && (
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  )}
                </View>
                <Text style={s.progressLabel}>Day {day}</Text>
              </View>
            ))}
          </View>

          <Button
            variant="hero"
            title="Accept Challenge"
            icon="flame"
            size="lg"
            onPress={handleAccept}
          />
          <TouchableOpacity
            style={s.declineBtn}
            onPress={handleDecline}
            activeOpacity={0.7}
          >
            <Text style={s.declineText}>No thanks</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    padding: 28,
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(245, 166, 35, 0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  heading: {
    fontSize: 22,
    fontFamily: "PlusJakartaSans_700Bold",
    color: TEXT_1,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 24,
  },
  progressRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 28,
    marginBottom: 28,
  },
  progressItem: {
    alignItems: "center",
    gap: 6,
  },
  progressDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  progressDotCompleted: {
    backgroundColor: SUCCESS,
    borderColor: SUCCESS,
  },
  progressLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_3,
  },
  declineBtn: {
    marginTop: 12,
    paddingVertical: 8,
  },
  declineText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
  },
});
