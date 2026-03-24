import { Alert, Linking } from "react-native";

/**
 * Show an error alert with a "Contact Support" option.
 * Use this for errors the user might need help with (save failures, sync issues, etc.)
 * For simple validation errors, use regular Alert.alert instead.
 */
export function showSupportAlert(
  title: string,
  message: string,
  options?: { retryAction?: () => void }
): void {
  const buttons: { text: string; style?: "cancel" | "destructive" | "default"; onPress?: () => void }[] = [];

  if (options?.retryAction) {
    buttons.push({ text: "Try Again", onPress: options.retryAction });
  }

  buttons.push({
    text: "Contact Support",
    onPress: () =>
      Linking.openURL(
        `mailto:support@mileclear.com?subject=${encodeURIComponent(`MileClear Issue: ${title}`)}&body=${encodeURIComponent(`Hi,\n\nI ran into an issue: ${message}\n\n`)}`
      ),
  });

  buttons.push({ text: "OK", style: "cancel" });

  Alert.alert(title, `${message}\n\nIf this keeps happening, tap "Contact Support" and I'll help.`, buttons);
}
