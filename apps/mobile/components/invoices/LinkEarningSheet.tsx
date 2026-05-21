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

import { useEffect, useState } from "react";
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
import {
  linkInvoiceToEarnings,
  type Invoice,
  type PotentialEarningMatch,
} from "../../lib/api/invoices";
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
  // Local copy of the candidate list — we mutate it as the user links
  // rows so each successful link removes that row from view, letting
  // the user roll up multiple earnings into one invoice (Laura's 7
  // daily £57.14 → 1 invoice case). The selected set tracks rows the
  // user has linked in this session for an undo or final summary.
  const [pendingMatches, setPendingMatches] = useState<PotentialEarningMatch[]>(matches);
  const [linkedSoFar, setLinkedSoFar] = useState<PotentialEarningMatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    // Reset when the sheet pops with a fresh invoice.
    if (visible) {
      setPendingMatches(matches);
      setLinkedSoFar([]);
      setErrorText(null);
    }
  }, [visible, matches]);

  const handleLink = async (earning: PotentialEarningMatch) => {
    if (!invoice) return;
    setBusy(true);
    setErrorText(null);
    try {
      await linkInvoiceToEarnings(invoice.id, [earning.id]);
      setPendingMatches((prev) => prev.filter((m) => m.id !== earning.id));
      setLinkedSoFar((prev) => [...prev, earning]);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : "Couldn't link them. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleLinkAll = async () => {
    if (!invoice || pendingMatches.length === 0) return;
    setBusy(true);
    setErrorText(null);
    try {
      await linkInvoiceToEarnings(
        invoice.id,
        pendingMatches.map((m) => m.id)
      );
      setLinkedSoFar((prev) => [...prev, ...pendingMatches]);
      setPendingMatches([]);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : "Couldn't link them. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleDone = () => {
    if (linkedSoFar.length > 0) {
      onResolved();
    } else {
      onClose();
    }
  };

  if (!invoice) return null;

  const singular = matches.length === 1;
  const onlyMatch = singular ? matches[0] : null;
  const linkedTotalPence = linkedSoFar.reduce((sum, m) => sum + m.amountPence, 0);
  const allDone = pendingMatches.length === 0 && linkedSoFar.length > 0;

  return (
    <AppModal visible={visible} animationType="slide" onRequestClose={handleDone}>
      <Pressable style={styles.scrim} onPress={handleDone}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="link-outline" size={20} color={AMBER} />
            </View>
            <Text style={styles.title}>
              {allDone
                ? "Linked"
                : singular
                  ? "Looks like a duplicate"
                  : "Possible duplicates"}
            </Text>
            <Text style={styles.subtitle}>
              {allDone
                ? `Linked ${linkedSoFar.length} ${linkedSoFar.length === 1 ? "earning" : "earnings"} (${formatPence(linkedTotalPence)}) to this invoice. We'll count the invoice once on your tax.`
                : singular
                  ? `You already logged ${formatPence(onlyMatch!.amountPence)} as a manual earning around the same time. Link them and we'll count it once.`
                  : `Found ${pendingMatches.length} earnings that might match this invoice. Link the ones that are the same money so they aren't counted twice. ${matches.length > 1 ? "Tap each, or Link all if every row matches." : ""}`}
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
            {linkedSoFar.length > 0 && (
              <Text style={styles.invoiceStripLinked}>
                <Ionicons name="link" size={11} color={GREEN} /> Linked{" "}
                {linkedSoFar.length} {linkedSoFar.length === 1 ? "earning" : "earnings"} ·{" "}
                {formatPence(linkedTotalPence)}
              </Text>
            )}
          </View>

          {/* Link-all shortcut — only useful when there's more than one
              candidate left. Saves Laura tapping Link 7 times. */}
          {pendingMatches.length > 1 && (
            <Pressable
              style={styles.linkAllButton}
              onPress={handleLinkAll}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Link all ${pendingMatches.length} candidate earnings to this invoice`}
            >
              {busy ? (
                <ActivityIndicator size="small" color={AMBER} />
              ) : (
                <>
                  <Ionicons name="link" size={14} color={AMBER} />
                  <Text style={styles.linkAllText}>
                    Link all {pendingMatches.length} (
                    {formatPence(pendingMatches.reduce((s, m) => s + m.amountPence, 0))})
                  </Text>
                </>
              )}
            </Pressable>
          )}

          {/* Matches */}
          {pendingMatches.length > 0 && (
            <ScrollView
              style={styles.matchList}
              contentContainerStyle={styles.matchListContent}
            >
              {pendingMatches.map((match) => {
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
                      style={[styles.linkButton, busy && styles.linkButtonBusy]}
                      onPress={() => handleLink(match)}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={`Link this earning of ${formatPence(match.amountPence)} to the invoice`}
                    >
                      <Ionicons name="link" size={14} color="#000" />
                      <Text style={styles.linkButtonText}>Link</Text>
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {errorText && <Text style={styles.errorText}>{errorText}</Text>}

          {/* Footer */}
          <View style={styles.footer}>
            <Pressable
              style={[styles.keepBothButton, allDone && styles.keepBothButtonPrimary]}
              onPress={handleDone}
              accessibilityRole="button"
              accessibilityLabel={
                allDone
                  ? "Done — close"
                  : linkedSoFar.length > 0
                    ? "Done — keep the rest as separate income"
                    : "Keep all as separate income — don't link"
              }
            >
              <Text
                style={[
                  styles.keepBothText,
                  allDone && styles.keepBothTextPrimary,
                ]}
              >
                {allDone
                  ? "Done"
                  : linkedSoFar.length > 0
                    ? "Done"
                    : "Keep all separate"}
              </Text>
            </Pressable>
            {!allDone && (
              <Text style={styles.footerHint}>
                Unlinked earnings stay as their own income on your tax.
              </Text>
            )}
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
  invoiceStripLinked: {
    color: GREEN,
    fontSize: 11.5,
    fontFamily: fonts.semibold,
    marginTop: 6,
  },
  linkAllButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(245,166,35,0.12)",
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.28)",
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  linkAllText: {
    color: AMBER,
    fontSize: 13,
    fontFamily: fonts.semibold,
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
  keepBothButtonPrimary: {
    backgroundColor: AMBER,
    borderRadius: 12,
    paddingHorizontal: 32,
  },
  keepBothText: {
    color: TEXT_2,
    fontSize: 14,
    fontFamily: fonts.semibold,
  },
  keepBothTextPrimary: {
    color: "#000",
    fontSize: 14.5,
  },
  footerHint: {
    color: TEXT_3,
    fontSize: 11,
    fontFamily: fonts.regular,
    marginTop: 2,
    textAlign: "center",
  },
});
