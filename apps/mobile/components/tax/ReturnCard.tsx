// The Tax tab's answer for gig and both drivers from 6 April to 31 January:
// the return due next, what is left to sort, and one button into the checklist.
// From 1 February it sits second and only while things remain (overdue copy).

import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import type { TaxOverview } from "@mileclear/shared";
import { Button } from "../Button";
import { colors, fonts, fontScaleCap } from "../../lib/theme";
import {
  daysText,
  daysTone,
  deadlineYear,
  isOverdue,
  returnHeadlineTodo,
  startYearOf,
  type ReturnCardMode,
} from "../../lib/tax/persona";
import { taxCard } from "./cardStyles";

const GOV_UK_FILE_URL = "https://www.gov.uk/log-in-file-self-assessment-tax-return";

const PILL = {
  calm: { bg: "rgba(255,255,255,0.04)", fg: colors.text2 },
  soon: { bg: colors.amberDim, fg: colors.amber },
  urgent: { bg: colors.redDim, fg: colors.red },
} as const;

export function ReturnCard({
  ret,
  mode,
  lead,
  currentTaxYear,
  onStartedThisYear,
}: {
  ret: NonNullable<TaxOverview["return"]>;
  mode: Exclude<ReturnCardMode, "hidden">;
  /** Leading the page (hero styling) or second. */
  lead: boolean;
  /** The current tax year, for the "started after" answer. */
  currentTaxYear: string;
  /** Saves "started this tax year", then the tab refreshes. */
  onStartedThisYear: () => Promise<void>;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const year = deadlineYear(ret.deadline);
  const days = ret.daysToDeadline;
  const tone = PILL[daysTone(days)];
  const overdue = isOverdue(ret);
  const shown = ret.attentionItems.slice(0, 3);
  const more = ret.attentionCount - shown.length;

  const openChecklist = () => router.push("/sa-checklist" as never);

  let headline: string;
  let sub: string | null = null;
  if (mode === "ask") {
    headline = `Did you work for yourself before 6 April ${startYearOf(currentTaxYear)}?`;
    sub = `If you did, you need a ${ret.taxYear} return by 31 January ${year}.`;
  } else if (mode === "done") {
    headline = `Your ${ret.taxYear} return is ready to file`;
    sub = `Everything on your list is done. File by 31 January ${year} at GOV.UK.`;
  } else {
    headline = returnHeadlineTodo(ret.attentionCount, year);
    if (overdue) {
      sub = `The 31 January deadline has passed. If you haven't filed your ${ret.taxYear} return yet, file as soon as you can: the penalty grows the longer it waits.`;
    }
  }

  const a11y =
    mode === "todo"
      ? `Your ${ret.taxYear} return. ${ret.attentionCount} ${ret.attentionCount === 1 ? "thing" : "things"} to sort. ${daysText(days)}.`
      : `Your ${ret.taxYear} return. ${headline}. ${daysText(days)}.`;

  const answerNo = async () => {
    setSaving(true);
    try {
      await onStartedThisYear();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={lead ? taxCard.hero : taxCard.plain}>
      <View accessible accessibilityLabel={a11y}>
        <View style={taxCard.topRow}>
          <Text style={taxCard.eyebrow} maxFontSizeMultiplier={fontScaleCap.body}>
            {`YOUR ${ret.taxYear} RETURN`}
          </Text>
          <View style={[taxCard.pill, { backgroundColor: tone.bg }]}>
            <Text style={[taxCard.pillText, { color: tone.fg }]} maxFontSizeMultiplier={fontScaleCap.none}>
              {daysText(days)}
            </Text>
          </View>
        </View>
        <Text style={taxCard.headline} maxFontSizeMultiplier={fontScaleCap.heading}>{headline}</Text>
        {sub ? <Text style={taxCard.body} maxFontSizeMultiplier={fontScaleCap.body}>{sub}</Text> : null}

        {mode === "todo" && shown.length > 0 && (
          <View style={{ marginTop: 12, gap: 8 }}>
            {shown.map((item) => (
              <View key={item.id} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.amber} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.text1 }}
                    maxFontSizeMultiplier={fontScaleCap.body}
                  >
                    {item.title}
                  </Text>
                  <Text
                    style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.text2 }}
                    numberOfLines={2}
                    maxFontSizeMultiplier={fontScaleCap.body}
                  >
                    {item.detail}
                  </Text>
                </View>
              </View>
            ))}
            {more > 0 && (
              <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.text2, marginLeft: 24 }}>
                {`and ${more} more`}
              </Text>
            )}
          </View>
        )}
      </View>

      <View style={taxCard.actions}>
        {mode === "ask" ? (
          <>
            <Button title="Yes, show my list" variant="primary" fullWidth onPress={openChecklist} />
            <Button
              title="No, I started after that"
              variant="secondary"
              fullWidth
              loading={saving}
              onPress={answerNo}
            />
          </>
        ) : mode === "done" ? (
          <>
            <Button title="See my list" variant="secondary" fullWidth onPress={openChecklist} />
            <View style={{ minHeight: 44, justifyContent: "center", alignItems: "center" }}>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="File at GOV.UK"
                hitSlop={8}
                onPress={() => WebBrowser.openBrowserAsync(GOV_UK_FILE_URL).catch(() => {})}
              >
                <Text style={taxCard.link}>File at GOV.UK</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <Button title="Sort my return" variant={lead ? "primary" : "secondary"} fullWidth onPress={openChecklist} />
        )}
      </View>
    </View>
  );
}
