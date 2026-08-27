import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Alert, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { AppModal } from "../AppModal";
import { Button } from "../Button";
import { colors, fonts, radii, spacing } from "../../lib/theme";

/**
 * Cross-platform text prompt.
 *
 * React Native's Alert.prompt wraps its ENTIRE body in `if (Platform.OS ===
 * 'ios')`, so on Android it is a silent no-op - no dialog, no error, nothing.
 * Screens worked around that with preset-button Alerts ("40p flat", "£25,000"),
 * which meant an Android driver could not type their own employer mileage rate
 * or PAYE figure. Those values feed tax calculations, so approximations are not
 * good enough.
 *
 * This provider gives one promise-based API for both platforms:
 *   - iOS keeps Alert.prompt, called with the same arguments as before, so its
 *     behaviour is unchanged.
 *   - Android gets a real input modal.
 *
 * Mounted once in _layout, same shape as PaywallProvider.
 */

export interface PromptOptions {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  keyboardType?: "default" | "number-pad" | "decimal-pad";
  /** Submit button label. Default "Save". */
  submitLabel?: string;
  /** Cancel button label, or null for no cancel button. Default "Cancel". */
  cancelLabel?: string | null;
  /** Optional third action, e.g. "Skip" - distinct from cancel. */
  neutralLabel?: string;
}

export type PromptResult =
  | { action: "submit"; value: string }
  | { action: "neutral" }
  | { action: "cancel" };

interface PromptContextValue {
  prompt: (options: PromptOptions) => Promise<PromptResult>;
}

const PromptContext = createContext<PromptContextValue>({
  prompt: async () => ({ action: "cancel" }),
});

export function usePrompt() {
  return useContext(PromptContext);
}

export function PromptProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [options, setOptions] = useState<PromptOptions | null>(null);
  const [value, setValue] = useState("");
  // Held across the modal's lifetime; settled exactly once by resolve().
  const resolverRef = useRef<((result: PromptResult) => void) | null>(null);

  const settle = useCallback((result: PromptResult) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setVisible(false);
    resolve?.(result);
  }, []);

  const prompt = useCallback((opts: PromptOptions): Promise<PromptResult> => {
    if (Platform.OS === "ios") {
      // Unchanged iOS path: same Alert.prompt arguments as the call sites used
      // before this provider existed.
      return new Promise<PromptResult>((resolve) => {
        const buttons: Parameters<typeof Alert.prompt>[2] = [];
        if (opts.cancelLabel !== null) {
          buttons.push({
            text: opts.cancelLabel ?? "Cancel",
            style: "cancel",
            onPress: () => resolve({ action: "cancel" }),
          });
        }
        if (opts.neutralLabel) {
          buttons.push({
            text: opts.neutralLabel,
            onPress: () => resolve({ action: "neutral" }),
          });
        }
        buttons.push({
          text: opts.submitLabel ?? "Save",
          onPress: (text?: string) => resolve({ action: "submit", value: text ?? "" }),
        });

        Alert.prompt(
          opts.title,
          opts.message,
          buttons,
          "plain-text",
          opts.defaultValue ?? "",
          opts.keyboardType ?? "default",
        );
      });
    }

    return new Promise<PromptResult>((resolve) => {
      resolverRef.current = resolve;
      setOptions(opts);
      setValue(opts.defaultValue ?? "");
      setVisible(true);
    });
  }, []);

  return (
    <PromptContext.Provider value={{ prompt }}>
      {children}
      <AppModal
        visible={visible}
        animationType="slide"
        onRequestClose={() => settle({ action: "cancel" })}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet} accessibilityViewIsModal={true}>
            <View style={styles.handle} />
            <Text style={styles.title} maxFontSizeMultiplier={1.4}>
              {options?.title}
            </Text>
            {options?.message ? (
              <Text style={styles.message} maxFontSizeMultiplier={1.6}>
                {options.message}
              </Text>
            ) : null}
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={setValue}
              keyboardType={options?.keyboardType ?? "default"}
              placeholder={options?.placeholder}
              placeholderTextColor={colors.text3}
              autoFocus
              selectTextOnFocus
              accessibilityLabel={options?.title}
              onSubmitEditing={() => settle({ action: "submit", value })}
              returnKeyType="done"
            />
            <View style={styles.buttons}>
              <Button
                title={options?.submitLabel ?? "Save"}
                icon="checkmark"
                onPress={() => settle({ action: "submit", value })}
              />
              {options?.neutralLabel ? (
                <Button
                  variant="secondary"
                  title={options.neutralLabel}
                  onPress={() => settle({ action: "neutral" })}
                />
              ) : null}
              {options?.cancelLabel !== null ? (
                <Button
                  variant="ghost"
                  title={options?.cancelLabel ?? "Cancel"}
                  onPress={() => settle({ action: "cancel" })}
                />
              ) : null}
            </View>
          </View>
        </View>
      </AppModal>
    </PromptContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingHorizontal: spacing.lg,
    paddingBottom: 36,
    paddingTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.subtleBorder,
    borderBottomWidth: 0,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.subtleBorder,
    alignSelf: "center",
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 20,
    fontFamily: fonts.semibold,
    color: colors.text1,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  message: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.text2,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.subtleBorder,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 18,
    fontFamily: fonts.semibold,
    color: colors.text1,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  buttons: { gap: spacing.sm },
});
