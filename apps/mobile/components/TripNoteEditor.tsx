import { useState } from "react";
import { View, TextInput, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../lib/theme";

/**
 * A trip's user-facing note. The `notes` column is overloaded with internal
 * state markers (e.g. __unconfirmed__, __shaded__) for transient trips, so we
 * hide anything marker-prefixed and only ever surface genuine user text.
 */
export function displayNote(notes: string | null | undefined): string {
  return notes && !notes.startsWith("__") ? notes : "";
}

/**
 * Shared inline note editor (used by the Trips list cards and the dashboard
 * "add a note" nudge). Keeps its draft in local state so typing doesn't
 * re-render the parent list, and saves on blur via onSave.
 */
export function TripNoteEditor({
  initial,
  onSave,
  autoFocus = true,
}: {
  initial: string;
  onSave: (text: string) => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(initial);
  return (
    <View style={styles.row}>
      <Ionicons name="create-outline" size={14} color={colors.amber} style={{ marginTop: 3 }} accessible={false} />
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="Add a note for this trip"
        placeholderTextColor={colors.text3}
        autoFocus={autoFocus}
        multiline
        maxLength={1000}
        onBlur={() => onSave(text)}
        accessibilityLabel="Trip note"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  input: {
    flex: 1,
    color: colors.text1,
    fontSize: 13,
    fontFamily: fonts.regular,
    padding: 0,
    paddingBottom: 2,
    minHeight: 20,
    maxHeight: 96,
  },
});
