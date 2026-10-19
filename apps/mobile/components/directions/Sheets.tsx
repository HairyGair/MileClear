// Bottom sheets for Directions (DESIGN 2.2, 2.3, 2.4, 2.5, 2.8): preview,
// errors, End, "can't find a new route", arrived, and the one-time note
// before the first use. Solid panels, 56 pt buttons.

import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Linking, Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NavigationRoute } from "@mileclear/shared";
import { colors, fonts, fontScaleCap, nav, radii, spacing } from "../../lib/theme";
import { arrivalClock, dataDateWords, durationWords, milesShort } from "../../lib/navigation/phrases";
import { previewErrorCopy, type ErrorAction } from "../../lib/navigation/errorCopy";
import type { PreviewError } from "../../lib/navigation/useGuidanceTypes";

export const MAPS_NAME: "Apple Maps" | "Google Maps" = Platform.OS === "ios" ? "Apple Maps" : "Google Maps";

function Primary({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.primary, (pressed || disabled) && { opacity: disabled ? 0.5 : 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Text style={s.primaryText}>{title}</Text>
    </Pressable>
  );
}

function TextButton({ title, onPress, tone }: { title: string; onPress: () => void; tone?: "red" | "amber" }) {
  return (
    <TouchableOpacity onPress={onPress} style={s.textBtn} accessibilityRole="button" accessibilityLabel={title}>
      <Text style={[s.textBtnText, tone === "red" && { color: colors.red }, tone === "amber" && { color: colors.amber }]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

function ReportLink({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={s.report} accessibilityRole="link" accessibilityLabel="Report a problem with Directions">
      <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.text3} />
      <Text style={s.reportText}>Report a problem with Directions</Text>
    </TouchableOpacity>
  );
}

export function PreviewSheet(props: {
  bottomInset: number;
  destinationLabel: string | null;
  phase: "locating" | "routing" | "preview";
  route: NavigationRoute | null;
  error: PreviewError | null;
  alreadyThere: boolean;
  fromPicker: boolean;
  showFirstTimeLine: boolean;
  voiceNote: string | null;
  onStart: () => void;
  onRetry: () => void;
  onChooseElse: () => void;
  onOpenMaps: () => void;
  onClose: () => void;
  onReport: () => void;
  /** The sheet's height, so the map can fit the route above it. */
  onHeight?: (h: number) => void;
}) {
  const [about, setAbout] = useState(false);
  const [retryReady, setRetryReady] = useState(true);
  useEffect(() => {
    if (props.error !== "TOO_MANY_REQUESTS") return;
    setRetryReady(false);
    const t = setTimeout(() => setRetryReady(true), 10_000);
    return () => clearTimeout(t);
  }, [props.error]);

  const r = props.route;
  let body: ReactNode;
  if (props.error) {
    const copy = previewErrorCopy(props.error, MAPS_NAME);
    const act = (a: ErrorAction, i: number) => {
      const first = i === 0;
      const map: Record<ErrorAction, { title: string; on: () => void }> = {
        try_again: { title: "Try again", on: props.onRetry },
        open_maps: { title: `Open in ${MAPS_NAME}`, on: props.onOpenMaps },
        choose_else: { title: "Choose somewhere else", on: props.onChooseElse },
        ok: { title: "OK", on: props.onClose },
        open_settings: { title: "Open Settings", on: () => void Linking.openSettings() },
      };
      const m = map[a];
      return first ? (
        <Primary key={a} title={m.title} onPress={m.on} disabled={a === "try_again" && !retryReady} />
      ) : (
        <TextButton key={a} title={m.title} onPress={m.on} />
      );
    };
    body = (
      <>
        <View style={s.errTop}>
          <Ionicons name="warning-outline" size={22} color={colors.amber} />
          <Text style={s.title}>{copy.title}</Text>
        </View>
        {copy.body && <Text style={s.body}>{copy.body}</Text>}
        {copy.actions.map(act)}
      </>
    );
  } else if (props.alreadyThere) {
    body = (
      <>
        <Text style={s.title}>You're already there.</Text>
        <Primary title="Done" onPress={props.onClose} />
      </>
    );
  } else if (props.phase !== "preview" || !r) {
    body = (
      <View style={s.busy}>
        <ActivityIndicator color={colors.amber} />
        <Text style={s.body}>{props.phase === "locating" ? "Finding where you are" : "Finding a route"}</Text>
      </View>
    );
  } else {
    const arrive = arrivalClock(new Date(Date.now() + r.durationSeconds * 1000));
    body = (
      <>
        <View style={s.stats}>
          <Text style={s.big} maxFontSizeMultiplier={fontScaleCap.display}>
            {durationWords(r.durationSeconds)}
          </Text>
          <Text style={s.fig}>{milesShort(r.distanceMeters)}</Text>
          <Text style={s.fig}>Arrive about {arrive}</Text>
        </View>
        <TouchableOpacity style={s.honest} onPress={() => setAbout(true)} accessibilityRole="button">
          <Ionicons name="information-circle-outline" size={16} color={colors.text3} />
          <Text style={s.caption}>No live traffic. Times assume clear roads.</Text>
        </TouchableOpacity>
        {props.voiceNote && <Text style={s.caption}>{props.voiceNote}</Text>}
        <Primary title="Start" onPress={props.onStart} />
        {props.fromPicker && <TextButton title="Choose somewhere else" onPress={props.onChooseElse} />}
        {props.showFirstTimeLine && (
          <Text style={s.caption}>Your trip records on its own as usual. Directions only show the way.</Text>
        )}
      </>
    );
  }

  return (
    <View
      style={[s.sheet, { paddingBottom: props.bottomInset + spacing.lg }]}
      onLayout={(e) => props.onHeight?.(Math.round(e.nativeEvent.layout.height))}
    >
      {props.destinationLabel && (
        <Text style={s.dest} numberOfLines={2} maxFontSizeMultiplier={fontScaleCap.heading}>
          {props.destinationLabel}
        </Text>
      )}
      {body}
      <ReportLink onPress={props.onReport} />
      <Modal visible={about} transparent animationType="fade" onRequestClose={() => setAbout(false)}>
        <View style={s.dim}>
          <View style={[s.sheet, s.modalSheet, { paddingBottom: props.bottomInset + spacing.lg }]}>
            <Text style={s.title}>About these directions</Text>
            <Text style={s.body}>
              Directions use OpenStreetMap road data from {r ? dataDateWords(r.dataDate) : "recently"}. They don't know about
              traffic, roadworks or closures. Always follow road signs and what you can see.
            </Text>
            <Primary title="OK" onPress={() => setAbout(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** "End directions?" Dismisses itself as "Keep going" after 8 s. */
export function EndSheet({ visible, bottomInset, onEnd, onKeep }: { visible: boolean; bottomInset: number; onEnd: () => void; onKeep: () => void }) {
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(onKeep, 8_000);
    return () => clearTimeout(t);
  }, [visible, onKeep]);
  if (!visible) return null;
  return (
    <View style={s.dimFill}>
      <View style={[s.sheet, { paddingBottom: bottomInset + spacing.lg }]}>
        <Text style={s.title}>End directions?</Text>
        <Text style={s.body}>Your trip keeps recording.</Text>
        <Pressable onPress={onEnd} style={s.secondary} accessibilityRole="button" accessibilityLabel="End directions">
          <Text style={[s.primaryText, { color: colors.red }]}>End directions</Text>
        </Pressable>
        <Primary title="Keep going" onPress={onKeep} />
      </View>
    </View>
  );
}

/** Three failed reroutes while stopped (DESIGN 2.4). */
export function StuckSheet(props: { visible: boolean; bottomInset: number; onOpenMaps: () => void; onKeepTrying: () => void; onEnd: () => void }) {
  if (!props.visible) return null;
  return (
    <View style={s.dimFill}>
      <View style={[s.sheet, { paddingBottom: props.bottomInset + spacing.lg }]}>
        <Text style={s.title}>Directions can't find a new route</Text>
        <Primary title={`Open in ${MAPS_NAME}`} onPress={props.onOpenMaps} />
        <TextButton title="Keep trying" onPress={props.onKeepTrying} />
        <TextButton title="End directions" onPress={props.onEnd} tone="red" />
      </View>
    </View>
  );
}

export function ArrivedSheet(props: { bottomInset: number; summary: string | null; onDone: () => void; onReport: () => void }) {
  return (
    <View style={[s.sheet, { paddingBottom: props.bottomInset + spacing.lg }]}>
      {props.summary && <Text style={s.fig}>{props.summary}</Text>}
      <Text style={s.body}>MileClear saves your trip when you stop, as usual.</Text>
      <Primary title="Done" onPress={props.onDone} />
      <ReportLink onPress={props.onReport} />
    </View>
  );
}

/** Before the first use: Directions are a test, and the road comes first. */
export function FirstUseNote({ visible, bottomInset, onOk }: { visible: boolean; bottomInset: number; onOk: () => void }) {
  if (!visible) return null;
  return (
    <View style={s.dimFill}>
      <View style={[s.sheet, { paddingBottom: bottomInset + spacing.lg }]}>
        <Text style={s.title}>Before you start</Text>
        <Text style={s.body}>
          Directions is new and still being tested. Follow road signs, and tell us anything that goes wrong.
        </Text>
        <Text style={s.body}>Keep your eyes on the road. Directions can be wrong.</Text>
        <Primary title="OK" onPress={onOk} />
      </View>
    </View>
  );
}

/** The crash fallback (DESIGN 2.9). */
export function StoppedSheet(props: { bottomInset: number; onOpenMaps: () => void; onEnd: () => void }) {
  return (
    <View style={s.dimFill}>
      <View style={[s.sheet, { paddingBottom: props.bottomInset + spacing.lg }]}>
        <Text style={s.title}>Directions stopped</Text>
        <Text style={s.body}>Something went wrong. Your trip still records.</Text>
        <Primary title={`Open in ${MAPS_NAME}`} onPress={props.onOpenMaps} />
        <TextButton title="End" onPress={props.onEnd} tone="red" />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    borderTopWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.xl,
    gap: spacing.md,
  },
  modalSheet: { position: "relative" },
  dim: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay },
  dimFill: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  dest: { fontFamily: fonts.bold, fontSize: 22, color: colors.text1 },
  title: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 20, color: colors.text1 },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.text2 },
  caption: { flexShrink: 1, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.text3 },
  errTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  busy: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.lg },
  stats: { flexDirection: "row", alignItems: "baseline", gap: spacing.lg, flexWrap: "wrap" },
  big: { fontFamily: fonts.bold, fontSize: 28, color: colors.text1 },
  fig: { fontFamily: fonts.semibold, fontSize: 18, color: colors.text1 },
  honest: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 32 },
  primary: {
    minHeight: nav.control,
    borderRadius: radii.md,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { fontFamily: fonts.bold, fontSize: 17, color: colors.bg },
  secondary: {
    minHeight: nav.control,
    borderRadius: radii.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  textBtn: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  textBtnText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text2 },
  report: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 40 },
  reportText: { fontFamily: fonts.medium, fontSize: 13, color: colors.text3 },
});
