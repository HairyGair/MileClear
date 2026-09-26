import { Alert, Linking } from "react-native";

/**
 * The phone could not reach the server at all: no signal, Wi-Fi without
 * internet, or the request dropped. Nothing for support to fix, so the alert
 * says so instead of asking the driver to email us. Orlaith O'Neill, 26 Sep
 * 2026: a vehicle save failed with "Save Failed: Network request failed" and
 * the Contact Support button, and the request never reached the server.
 */
export function isConnectionError(message: string): boolean {
  return /network request failed|failed to fetch|network connection was lost|internet connection appears to be offline|request timed out|could not connect to the server/i.test(
    message
  );
}

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

  if (isConnectionError(message)) {
    if (options?.retryAction) buttons.push({ text: "Try Again", onPress: options.retryAction });
    buttons.push({ text: "OK", style: "cancel" });
    Alert.alert(
      "No connection",
      "Your phone couldn't reach MileClear just now, so this wasn't saved. Check your signal or Wi-Fi and try again.",
      buttons
    );
    return;
  }

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
