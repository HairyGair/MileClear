// More > Your accountant (Accountant mode phase 1, SPEC-UX 2.2,
// SPEC-VISUAL 6.2 to 6.6).
//
// Sharing with an accountant's practice: who can see what, what they've
// asked for, every look and download, and Stop sharing. Free for every
// driver (no Pro gate). Below it, the accountant's fee (Laura Joyce, May
// 2026), which feeds the weekly put-by in the payment plan.

import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SettingsGroup } from "../components/settings/SettingsGroup";
import { SettingsRow } from "../components/settings/SettingsRow";
import { ContextualHelp } from "../components/ContextualHelp";
import { Button } from "../components/Button";
import { PracticeMark } from "../components/practice/PracticeMark";
import { PracticeChip } from "../components/practice/OutlineChip";
import { ShareScopeRows } from "../components/practice/ShareScopeRows";
import { updateProfile } from "../lib/api/user";
import { isApiError } from "../lib/api/apiError";
import {
  fetchPracticeLinks,
  fetchPracticeLog,
  inviteAccountant,
  keepSharing,
  markPracticeRequestDone,
  replyToPracticeRequest,
  stopSharing,
  updatePracticeScopes,
  type AccessLogItem,
  type DriverPracticeLink,
  type DriverPracticeRequest,
  type PracticeLinksOverview,
  type ShareScopes,
} from "../lib/api/practice";
import {
  logWhen,
  longDate,
  requestActionLabel,
  requestRoute,
  scopeSummary,
  shortDay,
} from "../lib/practice/logic";
import { takePracticeFlash } from "../lib/practice/flash";
import { useUser } from "../lib/user/context";
import { haptic } from "../lib/haptics";
import { colors, fonts, fontScaleCap, radii, spacing } from "../lib/theme";

const LIVE_STATES = new Set(["sharing", "paused", "waiting_for_practice"]);

export default function YourAccountantScreen() {
  const { refreshUser } = useUser();
  const [data, setData] = useState<PracticeLinksOverview | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [extraLog, setExtraLog] = useState<AccessLogItem[]>([]);
  const [logDone, setLogDone] = useState(false);
  const [logLoading, setLogLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await fetchPracticeLinks();
      setData(d);
      setLoadError(false);
      setExtraLog([]);
      setLogDone(d.log.length < 10);
    } catch {
      setLoadError(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const f = takePracticeFlash();
      if (f) setFlash(f);
      void load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const seeMoreLog = useCallback(async () => {
    if (!data) return;
    const all = [...data.log, ...extraLog];
    const last = all[all.length - 1];
    if (!last) return;
    setLogLoading(true);
    try {
      const more = await fetchPracticeLog(last.at);
      setExtraLog((prev) => [...prev, ...more]);
      if (more.length < 50) setLogDone(true);
    } catch {
      Alert.alert("Couldn't load", "Pull down to try again.");
    } finally {
      setLogLoading(false);
    }
  }, [data, extraLog]);

  if (!data) {
    return (
      <View style={s.root}>
        {loadError ? (
          <View style={s.center}>
            <Text style={s.muted}>Couldn&apos;t load. Pull down to try again.</Text>
            <View style={{ marginTop: spacing.lg }}>
              <Button title="Try again" variant="secondary" onPress={load} />
            </View>
          </View>
        ) : (
          <View style={s.center}>
            <ActivityIndicator color={colors.text2} />
          </View>
        )}
      </View>
    );
  }

  const live = data.links.filter((l) => LIVE_STATES.has(l.state));
  const sharing = data.links.filter((l) => l.state === "sharing");
  const asking = data.links.filter((l) => l.state === "asking");
  const finished = data.links.filter((l) => l.state === "ended" || l.state === "stopped");
  const log = [...data.log, ...extraLog];

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text2} />}
    >
      {flash ? (
        <View style={s.flash} accessibilityLiveRegion="polite">
          <Ionicons name="checkmark-circle" size={20} color={colors.green} accessible={false} />
          <Text style={s.flashText} maxFontSizeMultiplier={fontScaleCap.body}>
            {flash}
          </Text>
          <Pressable onPress={() => setFlash(null)} hitSlop={10} accessibilityLabel="Dismiss">
            <Ionicons name="close" size={18} color={colors.text3} />
          </Pressable>
        </View>
      ) : null}

      {asking.map((l) => (
        <AskCard key={l.id} link={l} />
      ))}

      {live.map((l) => (
        <LinkedCard key={l.id} link={l} isEmployee={data.isEmployee} onChanged={load} />
      ))}

      {live.length === 0 ? (
        <>
          {finished.map((l) => (
            <EndedCard key={l.id} link={l} />
          ))}
          <InviteCard onDone={load} />
        </>
      ) : null}

      {data.requests.length > 0 ? (
        <View style={{ marginTop: spacing.lg }}>
          {data.requests.map((r) => (
            <RequestCard key={r.id} request={r} onChanged={load} />
          ))}
        </View>
      ) : null}

      {sharing.length > 0 || log.length > 0 ? (
        <SettingsGroup title="What they've looked at">
          {log.length === 0 ? (
            <View style={s.logRow}>
              <Text style={s.muted} maxFontSizeMultiplier={fontScaleCap.body}>
                They haven&apos;t looked yet.
              </Text>
            </View>
          ) : (
            log.map((item) => <LogRow key={item.id} item={item} />)
          )}
        </SettingsGroup>
      ) : null}
      {log.length >= 10 && !logDone ? (
        <TouchableOpacity onPress={seeMoreLog} style={s.seeAll} accessibilityRole="button" disabled={logLoading}>
          {logLoading ? (
            <ActivityIndicator color={colors.text2} />
          ) : (
            <Text style={s.seeAllText} maxFontSizeMultiplier={fontScaleCap.body}>
              See all
            </Text>
          )}
        </TouchableOpacity>
      ) : null}

      <FeeSection overview={data} sharingWith={sharing[0] ?? null} onSaved={refreshUser} />

      {live.map((l) => (
        <View key={`stop-${l.id}`}>
          <SettingsGroup>
            <SettingsRow
              icon="close"
              label={l.state === "waiting_for_practice" ? `Cancel your request to ${l.practice.name}` : `Stop sharing with ${l.practice.name}`}
              destructive
              onPress={() => confirmStop(l, load)}
            />
          </SettingsGroup>
          <Text style={s.groupFooter} maxFontSizeMultiplier={fontScaleCap.body}>
            They won&apos;t see anything new. Anything they&apos;ve already downloaded stays with them.
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

function confirmStop(l: DriverPracticeLink, reload: () => Promise<void>) {
  const firm = l.practice.name;
  Alert.alert(
    `Stop sharing with ${firm}?`,
    "They won't see anything new from now on. Anything they've already downloaded stays with them.",
    [
      { text: "Keep sharing", style: "cancel" },
      {
        text: "Stop sharing",
        style: "destructive",
        onPress: async () => {
          try {
            await stopSharing(l.id);
            haptic("success");
            await reload();
          } catch {
            Alert.alert("Couldn't stop sharing", "Check your connection and try again.");
          }
        },
      },
    ]
  );
}

// ── Cards ─────────────────────────────────────────────────────────────

function AskCard({ link }: { link: DriverPracticeLink }) {
  return (
    <TouchableOpacity
      style={[s.card, s.warmCard, { marginBottom: spacing.md }]}
      activeOpacity={0.8}
      onPress={() => router.push(`/practice-consent?linkId=${link.id}&from=accountant` as never)}
      accessibilityRole="button"
      accessibilityLabel={`${link.practice.name} would like to see your records. Open to answer.`}
    >
      <View style={s.cardTop}>
        <PracticeMark practice={link.practice} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle} maxFontSizeMultiplier={fontScaleCap.heading}>
            {link.practice.name} would like to see your records
          </Text>
          <Text style={s.cardSub} maxFontSizeMultiplier={fontScaleCap.body}>
            Nothing is shared until you say yes.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.text3} />
      </View>
    </TouchableOpacity>
  );
}

function LinkedCard({
  link,
  isEmployee,
  onChanged,
}: {
  link: DriverPracticeLink;
  isEmployee: boolean;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [scopes, setScopes] = useState<ShareScopes>({
    shareEarnings: link.shareEarnings,
    shareExpenses: link.shareExpenses,
    sharePersonalTrips: link.sharePersonalTrips,
  });
  const [saving, setSaving] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const firm = link.practice.name;
  const sub = [link.practice.contactName, link.practice.professionalBody].filter(Boolean).join(" · ");

  const save = async () => {
    setSaving(true);
    try {
      await updatePracticeScopes(link.id, scopes);
      setEditing(false);
      await onChanged();
    } catch {
      Alert.alert("Couldn't save", "Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const renew = async () => {
    setRenewing(true);
    try {
      await keepSharing(link.id);
      haptic("success");
      await onChanged();
    } catch {
      Alert.alert("Couldn't keep sharing", "Check your connection and try again.");
    } finally {
      setRenewing(false);
    }
  };

  return (
    <View style={{ marginBottom: spacing.md }}>
      {link.state === "sharing" && link.renewalDue ? (
        <View style={[s.card, s.warmCard, { marginBottom: spacing.md }]}>
          <Text style={s.cardTitle} maxFontSizeMultiplier={fontScaleCap.heading}>
            Keep sharing with {firm}?
          </Text>
          <Text style={[s.cardSub, { marginTop: 4 }]} maxFontSizeMultiplier={fontScaleCap.body}>
            Sharing ends on {shortDay(link.endsAt)}. Keep it going for another year.
          </Text>
          <View style={s.actionRow}>
            <Button title="Keep sharing" onPress={renew} loading={renewing} size="sm" />
            <Pressable
              onPress={() =>
                Alert.alert(
                  `Stop on ${shortDay(link.endsAt)}`,
                  `Sharing with ${firm} ends on ${shortDay(link.endsAt)}. You don't need to do anything.`
                )
              }
              style={s.textBtn}
              accessibilityRole="button"
            >
              <Text style={s.textBtnText}>Stop on {shortDay(link.endsAt)}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={s.card}>
        <View style={s.cardTop}>
          <PracticeMark practice={link.practice} size={48} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.cardTitle} maxFontSizeMultiplier={fontScaleCap.heading}>
              {firm}
            </Text>
            {sub ? (
              <Text style={s.cardSub} maxFontSizeMultiplier={fontScaleCap.body}>
                {sub}
              </Text>
            ) : null}
            {!link.practice.checked && !link.awaitingSignup ? (
              <PracticeChip label="Not checked yet" tone="outline" icon="help-circle-outline" />
            ) : null}
          </View>
        </View>

        <View style={s.stateRow}>
          {link.state === "sharing" ? (
            <>
              <PracticeChip label="Sharing" tone="green" icon="checkmark" />
              <Text style={s.stateText} maxFontSizeMultiplier={fontScaleCap.body}>
                Until {longDate(link.endsAt)}
              </Text>
            </>
          ) : link.state === "paused" ? (
            <>
              <PracticeChip label="Paused" />
              <Text style={s.stateText} maxFontSizeMultiplier={fontScaleCap.body}>
                {firm}&apos;s account is paused. Nothing is being shared.
              </Text>
            </>
          ) : (
            <>
              <PracticeChip label="Waiting" icon="time-outline" />
              <Text style={s.stateText} maxFontSizeMultiplier={fontScaleCap.body}>
                {link.awaitingSignup
                  ? "We've emailed them an invite to MileClear. It's free for accountants."
                  : `We've asked ${firm} to accept you. Nothing is shared until they do.`}
              </Text>
            </>
          )}
        </View>

        <View style={s.hair} />
        <TouchableOpacity
          style={s.inlineRow}
          onPress={() => setEditing((e) => !e)}
          accessibilityRole="button"
          accessibilityState={{ expanded: editing }}
        >
          <Text style={s.inlineLabel} maxFontSizeMultiplier={fontScaleCap.body}>
            What they can see
          </Text>
          <Text style={s.inlineValue} maxFontSizeMultiplier={fontScaleCap.body}>
            {scopeSummary(link)}
          </Text>
          <Ionicons name={editing ? "chevron-up" : "chevron-forward"} size={16} color={colors.text3} />
        </TouchableOpacity>
        {editing ? (
          <View style={{ marginTop: spacing.sm }}>
            <ShareScopeRows scopes={scopes} onChange={setScopes} isEmployee={isEmployee} />
            <View style={{ marginTop: spacing.md }}>
              <Button title="Save" onPress={save} loading={saving} size="sm" variant="secondary" />
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function EndedCard({ link }: { link: DriverPracticeLink }) {
  const firm = link.practice.name;
  const title =
    link.state === "stopped"
      ? `You stopped sharing with ${firm} on ${shortDay(link.endedAt)}.`
      : `Sharing with ${firm} ended on ${shortDay(link.endedAt)}.`;
  return (
    <View style={[s.card, { marginBottom: spacing.md }]}>
      <View style={s.cardTop}>
        <PracticeMark practice={link.practice} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={[s.cardTitle, { fontSize: 15 }]} maxFontSizeMultiplier={fontScaleCap.body}>
            {title}
          </Text>
          <Text style={s.cardSub} maxFontSizeMultiplier={fontScaleCap.body}>
            They can&apos;t see anything new.
          </Text>
        </View>
        {link.practice.id ? (
          <Pressable
            onPress={() => router.push(`/practice-consent?linkId=${link.id}&from=accountant` as never)}
            style={s.textBtn}
            accessibilityRole="button"
          >
            <Text style={[s.textBtnText, { color: colors.amber }]}>Share again</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function InviteCard({ onDone }: { onDone: () => Promise<void> }) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const send = async () => {
    const v = value.trim();
    if (!v) return;
    setSending(true);
    setResult(null);
    try {
      const r = await inviteAccountant(v);
      switch (r.outcome) {
        case "asked_practice":
          setResult(`${r.practiceName} uses MileClear. We've asked them to accept you.`);
          break;
        case "emailed_accountant":
          setResult("We've emailed them an invite to MileClear. It's free for accountants.");
          break;
        case "already_sharing":
          setResult(`You're already sharing with ${r.practiceName}.`);
          break;
        case "practice_asked_you":
          router.push(`/practice-consent?linkId=${r.linkId}&from=accountant` as never);
          break;
      }
      setValue("");
      await onDone();
    } catch (err) {
      setResult(isApiError(err) ? err.message : "Couldn't send. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ marginTop: spacing.sm }}>
      <View style={[s.card, { alignItems: "center" }]}>
        <View style={s.emptyIcon}>
          <Ionicons name="people-outline" size={24} color={colors.text2} accessible={false} />
        </View>
        <Text style={[s.cardTitle, { fontSize: 16, textAlign: "center" }]} maxFontSizeMultiplier={fontScaleCap.heading}>
          Share your records with your accountant
        </Text>
        <Text style={[s.cardSub, { textAlign: "center", marginTop: 6 }]} maxFontSizeMultiplier={fontScaleCap.body}>
          Your accountant sees your business trips, earnings and expenses. Read only. You can stop any time.
        </Text>
        <TextInput
          style={s.input}
          value={value}
          onChangeText={setValue}
          placeholder="Their email or practice code"
          placeholderTextColor={colors.text3}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          maxLength={255}
          returnKeyType="send"
          onSubmitEditing={send}
          accessibilityLabel="Their email or practice code"
        />
        <View style={{ alignSelf: "stretch" }}>
          <Button title="Send" onPress={send} loading={sending} disabled={!value.trim()} fullWidth />
        </View>
        {result ? (
          <Text style={[s.cardSub, { marginTop: spacing.md, textAlign: "center" }]} accessibilityLiveRegion="polite">
            {result}
          </Text>
        ) : null}
      </View>
      <Text style={s.groupFooter} maxFontSizeMultiplier={fontScaleCap.body}>
        Free for every driver. Your accountant gets a free practice account if they don&apos;t have one.
      </Text>
    </View>
  );
}

function RequestCard({ request, onChanged }: { request: DriverPracticeRequest; onChanged: () => Promise<void> }) {
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const done = request.status === "done";

  if (done) {
    return (
      <View style={[s.card, { marginBottom: spacing.md }]}>
        <View style={s.reqHead}>
          <Ionicons name="checkmark-circle" size={20} color={colors.green} accessible={false} />
          <Text style={[s.cardTitle, { fontSize: 15, flex: 1 }]} maxFontSizeMultiplier={fontScaleCap.body}>
            Done. {request.practiceName} can see it.
          </Text>
        </View>
      </View>
    );
  }

  const route = requestRoute(request.type);
  const sendReply = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      await replyToPracticeRequest(request.id, t);
      setReplying(false);
      setText("");
      await onChanged();
    } catch {
      Alert.alert("Couldn't send", "Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };
  const markDone = async () => {
    setBusy(true);
    try {
      await markPracticeRequestDone(request.id);
      haptic("success");
      await onChanged();
    } catch {
      Alert.alert("Couldn't update", "Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={s.label} maxFontSizeMultiplier={fontScaleCap.heading}>
        Asked by {request.practiceName}
      </Text>
      <View style={[s.card, s.warmCard]}>
        <View style={s.reqHead}>
          <Ionicons name="document-text-outline" size={20} color={colors.amber} accessible={false} />
          <Text style={[s.cardTitle, { fontSize: 16, flex: 1 }]} maxFontSizeMultiplier={fontScaleCap.heading}>
            {request.title}
          </Text>
        </View>
        {request.note || request.dueDate ? (
          <Text style={s.note} maxFontSizeMultiplier={fontScaleCap.body}>
            {request.note ? `"${request.note}"` : ""}
            {request.dueDate ? `${request.note ? "  " : ""}Due ${shortDay(request.dueDate)}` : ""}
          </Text>
        ) : null}
        {request.driverReply ? (
          <Text style={[s.cardSub, { marginTop: 6 }]} maxFontSizeMultiplier={fontScaleCap.body}>
            You replied: &quot;{request.driverReply}&quot;
          </Text>
        ) : null}

        {replying ? (
          <View style={{ marginTop: spacing.md }}>
            <TextInput
              style={s.input}
              value={text}
              onChangeText={(t) => setText(t.replace(/\n/g, " "))}
              placeholder="One line back to them"
              placeholderTextColor={colors.text3}
              maxLength={200}
              autoFocus
              returnKeyType="send"
              onSubmitEditing={sendReply}
              accessibilityLabel="Reply"
            />
            <View style={s.actionRow}>
              <Button title="Send" onPress={sendReply} loading={busy} size="sm" disabled={!text.trim()} />
              <Pressable onPress={() => setReplying(false)} style={s.textBtn} accessibilityRole="button">
                <Text style={s.textBtnText}>Cancel</Text>
              </Pressable>
              <Text style={s.counter}>{text.length} of 200</Text>
            </View>
          </View>
        ) : (
          <View style={s.actionRow}>
            {route ? (
              <Button
                title={requestActionLabel(request.type)}
                onPress={() => router.push(route as never)}
                size="sm"
              />
            ) : null}
            <Pressable onPress={() => setReplying(true)} style={s.textBtn} accessibilityRole="button">
              <Text style={s.textBtnText}>Reply</Text>
            </Pressable>
            <Pressable onPress={markDone} style={s.textBtn} accessibilityRole="button" disabled={busy}>
              <Text style={s.textBtnText}>Done</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const LOG_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  exported_csv: "download-outline",
  exported_pdf: "download-outline",
  exported_summary: "download-outline",
  sent_request: "paper-plane-outline",
  started_sharing: "checkmark-outline",
  kept_sharing: "refresh-outline",
  changed_sharing: "options-outline",
  stopped_sharing: "close-outline",
};

function LogRow({ item, border }: { item: AccessLogItem; border?: boolean }) {
  return (
    <View style={[s.logRow, border && s.logBorder]} accessible accessibilityLabel={`${item.sentence}. ${logWhen(item.at)}`}>
      <View style={s.logIcon}>
        <Ionicons name={LOG_ICON[item.action] ?? "eye-outline"} size={17} color={colors.text2} accessible={false} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.logText} maxFontSizeMultiplier={fontScaleCap.body}>
          {item.sentence}
        </Text>
        <Text style={s.logWhen} maxFontSizeMultiplier={fontScaleCap.body}>
          {logWhen(item.at)}
        </Text>
      </View>
    </View>
  );
}

// ── Fee (kept from the May 2026 screen) ───────────────────────────────

function FeeSection({
  overview,
  sharingWith,
  onSaved,
}: {
  overview: PracticeLinksOverview;
  sharingWith: DriverPracticeLink | null;
  onSaved: () => Promise<void> | void;
}) {
  const [name, setName] = useState(overview.fee.accountantName ?? "");
  const [contact, setContact] = useState(overview.fee.accountantContact ?? "");
  const [feePounds, setFeePounds] = useState(
    overview.fee.accountantAnnualFeePence ? (overview.fee.accountantAnnualFeePence / 100).toFixed(2) : ""
  );
  const [saving, setSaving] = useState(false);

  const feeNumber = feePounds.trim() ? parseFloat(feePounds.trim()) : 0;
  const weeklyHint =
    isFinite(feeNumber) && feeNumber > 0 ? `That's about £${(feeNumber / 52).toFixed(2)} added to your weekly put-by.` : null;

  const save = async () => {
    if (feePounds.trim() && (!isFinite(feeNumber) || feeNumber < 0)) {
      Alert.alert("Check the fee", "Enter a number, for example 240.00.");
      return;
    }
    setSaving(true);
    try {
      const feePence = feeNumber > 0 ? Math.round(feeNumber * 100) : null;
      await updateProfile(
        sharingWith
          ? { accountantAnnualFeePence: feePence }
          : {
              accountantName: name.trim() || null,
              accountantContact: contact.trim() || null,
              accountantAnnualFeePence: feePence,
            }
      );
      await onSaved();
      haptic("success");
      Alert.alert("Saved", weeklyHint ?? "Your accountant's details are saved.");
    } catch (err) {
      Alert.alert("Couldn't save", err instanceof Error ? err.message : "Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ marginTop: spacing.sm }}>
      <View style={s.feeIntro}>
        <Text style={s.feeTitle} maxFontSizeMultiplier={fontScaleCap.heading}>
          Your accountant&apos;s fee
        </Text>
        <ContextualHelp topicId="accountant" size={16} />
      </View>
      <Text style={s.cardSub} maxFontSizeMultiplier={fontScaleCap.body}>
        Add their yearly fee and MileClear spreads it across your weekly put-by in the payment plan.
      </Text>
      <SettingsGroup>
        <View style={s.field}>
          <Text style={s.fieldLabel}>Name</Text>
          {sharingWith ? (
            <Text style={s.readOnly}>{sharingWith.practice.name}</Text>
          ) : (
            <TextInput
              style={s.fieldInput}
              value={name}
              onChangeText={setName}
              placeholder="For example, Jane at Smith & Co"
              placeholderTextColor={colors.text3}
              maxLength={120}
              autoCapitalize="words"
            />
          )}
        </View>
        <View style={s.field}>
          <Text style={s.fieldLabel}>Contact</Text>
          {sharingWith ? (
            <Text style={s.readOnly}>{sharingWith.practice.contactName ?? "Not given"}</Text>
          ) : (
            <TextInput
              style={s.fieldInput}
              value={contact}
              onChangeText={setContact}
              placeholder="Email or phone (optional)"
              placeholderTextColor={colors.text3}
              maxLength={255}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          )}
        </View>
        <View style={s.field}>
          <Text style={s.fieldLabel}>Annual fee (£)</Text>
          <TextInput
            style={s.fieldInput}
            value={feePounds}
            onChangeText={setFeePounds}
            placeholder="For example, 240.00"
            placeholderTextColor={colors.text3}
            keyboardType="decimal-pad"
            maxLength={12}
          />
          {weeklyHint ? <Text style={s.hint}>{weeklyHint}</Text> : null}
        </View>
      </SettingsGroup>
      <View style={{ marginTop: spacing.md }}>
        <Button title="Save fee" variant="secondary" onPress={save} loading={saving} fullWidth />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, paddingHorizontal: 16, paddingBottom: spacing.xxxl },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  muted: { fontSize: 14, fontFamily: fonts.regular, color: colors.text2 },
  flash: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  flashText: { flex: 1, fontSize: 14, fontFamily: fonts.medium, color: colors.text1, lineHeight: 19 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.lg,
  },
  warmCard: { borderColor: colors.amberGlow },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  cardTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.text1 },
  cardSub: { fontSize: 13, fontFamily: fonts.regular, color: colors.text2, lineHeight: 18 },
  stateRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.md, flexWrap: "wrap" },
  stateText: { flex: 1, fontSize: 13, fontFamily: fonts.medium, color: colors.text2, lineHeight: 18 },
  hair: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline, marginTop: spacing.md },
  inlineRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingTop: spacing.sm },
  inlineLabel: { flex: 1, fontSize: 15, fontFamily: fonts.medium, color: colors.text1 },
  inlineValue: { fontSize: 14, fontFamily: fonts.regular, color: colors.text2 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md, flexWrap: "wrap" },
  textBtn: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
  textBtnText: { fontSize: 15, fontFamily: fonts.semibold, color: colors.text2 },
  label: { fontSize: 13, fontFamily: fonts.semibold, color: colors.text2, marginBottom: 8, marginLeft: 4 },
  reqHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  note: { fontSize: 14, fontFamily: fonts.regular, color: colors.text1, marginTop: 8, lineHeight: 20 },
  counter: { marginLeft: "auto", fontSize: 12, fontFamily: fonts.regular, color: colors.text3 },
  input: {
    alignSelf: "stretch",
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    color: colors.text1,
    fontFamily: fonts.regular,
    fontSize: 15,
    marginVertical: spacing.md,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  groupFooter: { fontSize: 13, fontFamily: fonts.regular, color: colors.text2, marginTop: 8, marginHorizontal: 4, lineHeight: 18 },
  logRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10, minHeight: 52 },
  logBorder: { borderBottomWidth: 1, borderBottomColor: colors.surfaceBorder },
  logIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  logText: { fontSize: 15, fontFamily: fonts.medium, color: colors.text1, lineHeight: 20 },
  logWhen: { fontSize: 13, fontFamily: fonts.regular, color: colors.text2, marginTop: 2 },
  seeAll: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 4 },
  seeAllText: { fontSize: 15, fontFamily: fonts.semibold, color: colors.amber },
  feeIntro: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.xl, marginBottom: 4, marginLeft: 4 },
  feeTitle: { fontSize: 16, fontFamily: fonts.semibold, color: colors.text1 },
  field: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  fieldLabel: { fontSize: 12, fontFamily: fonts.semibold, color: colors.text2, marginBottom: 6 },
  fieldInput: { fontSize: 15, fontFamily: fonts.regular, color: colors.text1, paddingVertical: 8 },
  readOnly: { fontSize: 15, fontFamily: fonts.regular, color: colors.text2, paddingVertical: 8 },
  hint: { fontSize: 12, fontFamily: fonts.regular, color: colors.amber, marginTop: 6 },
});
