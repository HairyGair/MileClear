import { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
} from "react-native";
import { AVATARS, AvatarIcon, UserAvatar } from "./AvatarRegistry";

const AMBER = "#f5a623";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const CARD_BG = "#0a1120";
const CARD_BORDER = "rgba(255,255,255,0.05)";

interface AvatarPickerProps {
  currentAvatarId: string | null;
  onSelect: (avatarId: string | null) => void;
}

export function AvatarPicker({ currentAvatarId, onSelect }: AvatarPickerProps) {
  const [visible, setVisible] = useState(false);

  const handleSelect = useCallback(
    (id: string | null) => {
      onSelect(id);
      setVisible(false);
    },
    [onSelect]
  );

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setVisible(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Change avatar. Current: ${currentAvatarId ?? "initials"}`}
      >
        <UserAvatar avatarId={currentAvatarId} name="?" size={64} />
        <Text style={styles.changeText}>Change Avatar</Text>
      </TouchableOpacity>

      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet} accessibilityViewIsModal>
            <View style={styles.handle} />
            <Text style={styles.title}>Choose Your Ride</Text>

            <ScrollView
              contentContainerStyle={styles.grid}
              showsVerticalScrollIndicator={false}
            >
              {/* Remove avatar option */}
              <TouchableOpacity
                style={[
                  styles.cell,
                  currentAvatarId === null && styles.cellSelected,
                ]}
                onPress={() => handleSelect(null)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Initials avatar"
                accessibilityState={{ selected: currentAvatarId === null }}
              >
                <UserAvatar name="A" size={52} />
                <Text style={styles.cellLabel} numberOfLines={1}>
                  Initials
                </Text>
              </TouchableOpacity>

              {AVATARS.map((avatar) => (
                <TouchableOpacity
                  key={avatar.id}
                  style={[
                    styles.cell,
                    currentAvatarId === avatar.id && styles.cellSelected,
                  ]}
                  onPress={() => handleSelect(avatar.id)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${avatar.label} avatar`}
                  accessibilityState={{ selected: currentAvatarId === avatar.id }}
                >
                  <AvatarIcon avatarId={avatar.id} size={52} />
                  <Text style={styles.cellLabel} numberOfLines={1}>
                    {avatar.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setVisible(false)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Cancel avatar selection"
            >
              <Text style={styles.closeBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
  changeText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    color: AMBER,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#0a1120",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 12,
    maxHeight: "80%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderBottomWidth: 0,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontFamily: "PlusJakartaSans_300Light",
    color: TEXT_1,
    textAlign: "center",
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingBottom: 16,
  },
  cell: {
    width: "22%" as any,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  cellSelected: {
    borderColor: AMBER,
    backgroundColor: "rgba(245, 166, 35, 0.08)",
  },
  cellLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_2,
    marginTop: 4,
    textAlign: "center",
  },
  closeBtn: {
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  closeBtnText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_2,
  },
});
