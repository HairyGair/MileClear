// Trips > To sort: one quiet line when an accountant asked for the trips to
// be sorted ("Smith & Co asked for these by 31 Oct"). Nothing when there is
// no open request; never blocks the list (best-effort fetch).

import { useCallback, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useFocusEffect } from "expo-router";
import { fetchPracticeLinks } from "../../lib/api/practice";
import { shortDay } from "../../lib/practice/logic";
import { colors, fonts, fontScaleCap } from "../../lib/theme";

export function PracticeSortLine() {
  const [line, setLine] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchPracticeLinks()
        .then((d) => {
          if (cancelled) return;
          const r = d.requests.find((x) => x.type === "sort_trips" && x.status === "open");
          setLine(
            r ? (r.dueDate ? `${r.practiceName} asked for these by ${shortDay(r.dueDate)}` : `${r.practiceName} asked you to sort these`) : null
          );
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [])
  );
  if (!line) return null;
  return (
    <Text style={s.line} maxFontSizeMultiplier={fontScaleCap.body}>
      {line}
    </Text>
  );
}

const s = StyleSheet.create({
  line: { fontSize: 13, fontFamily: fonts.regular, color: colors.text2, marginBottom: 8 },
});
