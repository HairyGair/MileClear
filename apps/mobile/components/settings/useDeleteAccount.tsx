import { useCallback, useState, type ReactElement } from "react";
import { Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { AppModal } from "../AppModal";
import { useAuth } from "../../lib/auth/context";
import { deleteAccount } from "../../lib/api/user";
import { fetchGamificationStats } from "../../lib/api/gamification";
import { colors, fonts, radii, spacing } from "../../lib/theme";

/**
 * Delete account, moved inside Your account (Oct 2026 Settings redesign).
 * Same flow as the old Profile tab: password required, local copy wiped,
 * then logged out. iOS uses Alert.prompt; Android needs an inline modal.
 *
 *   const del = useDeleteAccount();
 *   <Row onPress={del.start} />  ...  {del.element}
 */
export function useDeleteAccount(): { start: () => void; deleting: boolean; element: ReactElement } {
  const { logout } = useAuth();
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");

  // The server row is gone at this point, so the local copy is the only
  // one left and there is nothing it could still sync to. Unconditional
  // wipe: unlike logout, deletion is deliberate and irreversible, so
  // keeping a shadow copy of the user's trips and home/work pins on the
  // handset would defeat the erasure they just asked for.
  const wipeLocalDataAfterDeletion = async () => {
    try {
      const { resetLocalData } = await import("../../lib/db/index");
      await resetLocalData();
    } catch {
      // Never leave the user stuck on a spinner over housekeeping; the
      // ownership check still wipes when the next account signs in.
    }
  };

  const start = useCallback(async () => {
    let message = "This is permanent and cannot be undone. Enter your password to confirm.";
    try {
      const res = await fetchGamificationStats();
      const s = res.data;
      if (s.totalTrips > 0) {
        message = `You've tracked ${s.totalTrips} trips and ${s.totalMiles.toFixed(0)} miles. This is permanent and cannot be undone. Enter your password to confirm.`;
      }
    } catch {}
    if (Platform.OS === "ios") {
      Alert.prompt(
        "Delete Account",
        message,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async (password: string | undefined) => {
              if (!password) return;
              setDeletingAccount(true);
              try {
                await deleteAccount(password);
                await wipeLocalDataAfterDeletion();
                await logout();
              } catch (err: unknown) {
                Alert.alert(
                  "Couldn't delete your account",
                  err instanceof Error ? err.message : "Try again in a moment."
                );
                setDeletingAccount(false);
              }
            },
          },
        ],
        "secure-text"
      );
    } else {
      setDeletePassword("");
      setShowDeleteModal(true);
    }
  }, [logout]);

  const confirmDeleteAndroid = useCallback(async () => {
    if (!deletePassword) return;
    setDeletingAccount(true);
    try {
      await deleteAccount(deletePassword);
      setShowDeleteModal(false);
      await wipeLocalDataAfterDeletion();
      await logout();
    } catch (err: unknown) {
      Alert.alert(
        "Couldn't delete your account",
        err instanceof Error ? err.message : "Try again in a moment."
      );
      setDeletingAccount(false);
    }
  }, [deletePassword, logout]);



  const element = (
      <AppModal
        visible={showDeleteModal}
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent} accessibilityViewIsModal={true}>
            <Text style={styles.modalTitle} accessibilityRole="header">Delete Account</Text>
            <Text style={styles.modalMessage}>
              This is permanent and cannot be undone. Enter your password to confirm.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={deletePassword}
              accessibilityLabel="Password"
              onChangeText={setDeletePassword}
              placeholder="Password"
              placeholderTextColor={colors.text3}
              secureTextEntry
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setShowDeleteModal(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalDelete, !deletePassword && styles.buttonDisabled]}
                onPress={confirmDeleteAndroid}
                disabled={!deletePassword || deletingAccount}
                accessibilityRole="button"
                accessibilityLabel={deletingAccount ? "Deleting account" : "Confirm delete account"}
                accessibilityState={{ disabled: !deletePassword || deletingAccount, busy: deletingAccount }}
              >
                <Text style={styles.modalDeleteText}>
                  {deletingAccount ? "Deleting..." : "Delete"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </AppModal>
  );

  return { start, deleting: deletingAccount, element };
}

const styles = StyleSheet.create({
  // Delete-account modal (Android)
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xxl,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    width: "100%",
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: fonts.bold,
    color: colors.text1,
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.text2,
    marginBottom: 16,
    lineHeight: 18,
  },
  modalInput: {
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: colors.text1,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  modalCancel: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: radii.md,
    alignItems: "center",
  },
  modalCancelText: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: colors.text2,
  },
  modalDelete: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: colors.red,
    borderRadius: radii.md,
    alignItems: "center",
  },
  modalDeleteText: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: "#fff",
  },
  buttonDisabled: {
    opacity: 0.4,
  },
});
