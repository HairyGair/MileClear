// Link-or-keep sheet that surfaces when marking an invoice paid (or
// creating a paid invoice) finds a manual earning that looks like the
// same money. Without this, freelancers like Laura end up with the
// same £400 counted twice on their Tax Readiness card (21 May 2026).
//
// Design: single sheet, friendly copy, no dropdowns. We trust the
// server to pre-filter to a tight match window (±50p, ±14 days, not
// already linked) so the choice is meaningful. If the user picks
// "Link", the earning stops being counted on the tax snapshot. If
// they pick "Keep both", we never ask about THIS invoice again.

import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppModal } from "../AppModal";
import { linkInvoiceToEarning, type Invoice, type PotentialEarningMatch } from "../../lib/api/invoices";
import { colors, fonts } from "../../lib/theme";

const BG = colors.bg;
const CARD_BG = colors.surface;
const CARD_BORDER = colors.surfaceBorder;
const AMBER = colors.amber;
const GREEN = colors.green;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;

interface LinkEarningSheetProps {
  visible: boolean;
  invoice: Invoice | null;
  matches: PotentialEarningMatch[];
  /** Fires after a successful link or when the user dismisses with
   *  "Keep both". The parent should reload its data + close the sheet. */
  onResolved: () => void;
  onClose: () => void;
}

function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

function platformLabel(platform: string): string {
  // Keep this in sync with GIG_PLATFORMS in @mileclear/shared — but the
  // common case is the manual "freelance" / "other" tags. Lowercase the
  // raw value as a sane fallback.
  const known: Record<string, string> = {
    freelance: "Freelance",
    other: "Other",
    uber: "Uber",
    deliveroo: "Deliveroo",
    just_eat: "Just Eat",
    amazon_flex: "Amazon Flex",
    stuart: "Stuart",
    gophr: "Gophr",
    dpd: "DPD",
    yodel: "Yodel",
    evri: "Evri",
  };
  return known[platform] ?? platform.replace(/_/g, " ");
}

export function LinkEarningSheet({
  visible,
  invoice,
  matches,
  onResolved,
  onClose,
}: LinkEarningSheetProps) {
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const handleLink = async (earningId: string) => {
    if (!invoice) return;
    setLinkingId(earningId);
    setErrorText(null);
    try {
      await linkInvoiceToEarning(invoice.id, earningId);
      onResolved();
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : "Couldn't link them. Try again.");
    } finally {
      setLinkingId(null);
    }
  };

  if (!invoice) return null;

  const singular = matches.length === 1;
  const onlyMatch = singular ? matches[0] : null;

  return (
    <AppModal visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="link-outline" size={20} color={AMBER} />
            </View>
            <Text style={styles.title}>
              {singular ? "Looks like a duplicate" : "Possible duplicates"}
            </Text>
            <Text style={styles.subtitle}>
              {singular
                ? `You already logged ${formatPence(onlyMatch!.amountPence)} as a manual earning around the same time. Link them and we'll count it once on your tax.`
                : `Found ${matches.length} earnings that might match this invoice. Link the right one so it isn't counted twice.`}
            </Text>
          </View>

          {/* Invoice context strip */}
          <View style={styles.invoiceStrip}>
            <Text style={styles.invoiceStripLabel}>This invoice</Text>
            <View style={styles.invoiceStripRow}>
              <Text style={styles.invoiceStripCompany} numberOfLines={1}>
                {invoice.company}
              </Text>
              <Text style={styles.invoiceStripAmount}>
                {formatPence(invoice.amountPence)}
              </Text>
            </View>
            {invoice.paidAt && (
              <Text style={styles.invoiceStripDate}>Paid {formatDate(invoice.paidAt)}</Text>
            )}
          </View>

          {/* Matches */}
          <ScrollView
            style={styles.matchList}
            contentContainerStyle={styles.matchListContent}
          >
            {matches.map((match) => {
              const isLinking = linkingId === match.id;
              const daysCopy =
                match.daysFromAnchor === 0
                  ? "same day"
                  : match.daysFromAnchor > 0
                    ? `${match.daysFromAnchor} ${match.daysFromAnchor === 1 ? "day" : "days"} after`
                    : `${Math.abs(match.daysFromAnchor)} ${Math.abs(match.daysFromAnchor) === 1 ? "day" : "days"} before`;

              return (
                <View key={match.id} style={styles.matchRow}>
                  <View style={styles.matchInfo}>
                    <View style={styles.matchTopLine}>
                      <Text style={styles.matchPlatform}>{platformLabel(match.platform)}</Text>
                      <Text style={styles.matchAmount}>{formatPence(match.amountPence)}</Text>
                    </View>
                    <Text style={styles.matchMeta}>
                      Logged {formatDate(match.periodStart)} · {daysCopy}
                    </Text>
                    {match.notes && (
                      <Text style={styles.matchNotes} numberOfLines={2}>
                        {match.notes}
                      </Text>
                    )}
                  </View>
                  <Pressable
                    style={[
                      styles.linkButton,
                      isLinking && styles.linkButtonBusy,
                    ]}
                    onPress={() => handleLink(match.id)}
                    disabled={linkingId !== null}
                    accessibilityRole="button"
                    accessibilityLabel={`Link this earning of ${formatPence(match.amountPence)} to the invoice`}
                  >
                    {isLinking ? (
                      <ActivityIndicator size="small" color="#000" />
                    ) : (
                      <>
                        <Ionicons name="link" size={14} color="#000" />
                        <Text style={styles.linkButtonText}>Link</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>

          {errorText && <Text style={styles.errorText}>{errorText}</Text>}

          {/* Keep both / Done */}
          <View style={styles.footer}>
            <Pressable
              style={styles.keepBothButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Keep both as separate income — don't link"
            >
              <Text style={styles.keepBothText}>Keep both</Text>
            </Pressable>
            <Text style={styles.footerHint}>
              No link? Both will be counted as separate income.
            </Text>
          </View>
        </Pressable>
      </Pressable>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: BG,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 28,
    maxHeight: "82%",
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignSelf: "center",
    marginBottom: 12,
  },
  header: {
    marginBottom: 14,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(245,166,35,0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  title: {
    color: TEXT_1,
    fontSize: 18,
    fontFamily: fonts.bold,
    marginBottom: 6,
  },
  subtitle: {
    color: TEXT_2,
    fontSize: 13.5,
    lineHeight: 19,
    fontFamily: fonts.regular,
  },
  invoiceStrip: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  invoiceStripLabel: {
    color: TEXT_3,
    fontSize: 10,
    fontFamily: fonts.semibold,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  invoiceStripRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
  },
  invoiceStripCompany: {
    flex: 1,
    color: TEXT_1,
    fontSize: 15,
    fontFamily: fonts.semibold,
  },
  invoiceStripAmount: {
    color: TEXT_1,
    fontSize: 16,
    fontFamily: fonts.bold,
    fontVariant: ["tabular-nums"],
  },
  invoiceStripDate: {
    color: TEXT_3,
    fontSize: 11,
    fontFamily: fonts.regular,
    marginTop: 2,
  },
  matchList: {
    flexShrink: 1,
  },
  matchListContent: {
    gap: 10,
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  matchInfo: {
    flex: 1,
  },
  matchTopLine: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 2,
  },
  matchPlatform: {
    color: TEXT_1,
    fontSize: 14,
    fontFamily: fonts.semibold,
    textTransform: "capitalize",
  },
  matchAmount: {
    color: TEXT_1,
    fontSize: 15,
    fontFamily: fonts.bold,
    fontVariant: ["tabular-nums"],
  },
  matchMeta: {
    color: TEXT_3,
    fontSize: 11.5,
    fontFamily: fonts.regular,
  },
  matchNotes: {
    color: TEXT_2,
    fontSize: 11.5,
    fontFamily: fonts.regular,
    marginTop: 4,
    fontStyle: "italic",
  },
  linkButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: AMBER,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    minWidth: 70,
    justifyContent: "center",
  },
  linkButtonBusy: {
    opacity: 0.65,
  },
  linkButtonText: {
    color: "#000",
    fontSize: 13,
    fontFamily: fonts.semibold,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 12.5,
    fontFamily: fonts.regular,
    marginTop: 10,
    textAlign: "center",
  },
  footer: {
    marginTop: 18,
    alignItems: "center",
  },
  keepBothButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  keepBothText: {
    color: TEXT_2,
    fontSize: 14,
    fontFamily: fonts.semibold,
  },
  footerHint: {
    color: TEXT_3,
    fontSize: 11,
    fontFamily: fonts.regular,
    marginTop: 2,
    textAlign: "center",
  },
});
