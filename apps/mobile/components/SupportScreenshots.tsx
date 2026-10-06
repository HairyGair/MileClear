import { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { SupportAttachmentRef } from "@mileclear/shared";
import { getSupportAttachmentUri } from "../lib/api/support";
import { MAX_SCREENSHOTS, pickScreenshot, type PickedScreenshot } from "../lib/supportScreenshots";
import { colors, fonts } from "../lib/theme";

const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const BORDER = "rgba(255,255,255,0.08)";
const THUMB = 72;

/** Full-screen view of one image; tap anywhere to close. */
function FullImage({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  return (
    <Modal visible={!!uri} transparent animationType="fade" presentationStyle="overFullScreen" onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity
        style={s.fullBackdrop}
        activeOpacity={1}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close screenshot"
      >
        {uri ? <Image source={{ uri }} style={s.fullImage} resizeMode="contain" /> : null}
      </TouchableOpacity>
    </Modal>
  );
}

/** Thumbnails + "Add screenshot" for a message being written. */
export function ScreenshotPicker({
  shots,
  onChange,
  disabled,
}: {
  shots: PickedScreenshot[];
  onChange: (next: PickedScreenshot[]) => void;
  disabled?: boolean;
}) {
  const [viewing, setViewing] = useState<string | null>(null);

  const add = async () => {
    if (shots.length >= MAX_SCREENSHOTS) return;
    const shot = await pickScreenshot();
    if (shot) onChange([...shots, shot]);
  };

  return (
    <View style={s.row}>
      {shots.map((shot, i) => (
        <View key={shot.uri + i} style={s.thumbWrap}>
          <TouchableOpacity
            onPress={() => setViewing(shot.uri)}
            accessibilityRole="imagebutton"
            accessibilityLabel={`Screenshot ${i + 1}, tap to view`}
          >
            <Image source={{ uri: shot.uri }} style={s.thumb} />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.remove}
            onPress={() => onChange(shots.filter((_, j) => j !== i))}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`Remove screenshot ${i + 1}`}
            hitSlop={8}
          >
            <Ionicons name="close" size={12} color="#fff" />
          </TouchableOpacity>
        </View>
      ))}
      {shots.length < MAX_SCREENSHOTS && (
        <TouchableOpacity
          style={[s.thumb, s.addTile]}
          onPress={add}
          disabled={disabled}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Add a screenshot"
        >
          <Ionicons name="image-outline" size={20} color={AMBER} />
          <Text style={s.addText}>Add</Text>
        </TouchableOpacity>
      )}
      <FullImage uri={viewing} onClose={() => setViewing(null)} />
    </View>
  );
}

/** One sent screenshot, downloaded to the cache on first view. */
function AttachmentThumb({ att, onOpen }: { att: SupportAttachmentRef; onOpen: (uri: string) => void }) {
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    getSupportAttachmentUri(att.id, att.mime)
      .then((u) => alive && setUri(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [att.id, att.mime]);

  return (
    <TouchableOpacity
      onPress={() => uri && onOpen(uri)}
      disabled={!uri}
      accessibilityRole="imagebutton"
      accessibilityLabel="Screenshot, tap to view"
    >
      {uri ? (
        <Image source={{ uri }} style={s.thumb} />
      ) : (
        <View style={[s.thumb, s.placeholder]}>
          {failed ? (
            <Ionicons name="image-outline" size={18} color={TEXT_3} />
          ) : (
            <ActivityIndicator size="small" color={TEXT_2} accessibilityLabel="Loading screenshot" />
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

/** Thumbnails for screenshots already sent in a conversation. */
export function AttachmentThumbs({ attachments }: { attachments: SupportAttachmentRef[] }) {
  const [viewing, setViewing] = useState<string | null>(null);
  if (attachments.length === 0) return null;
  return (
    <View style={[s.row, s.sentRow]}>
      {attachments.map((a) => (
        <AttachmentThumb key={a.id} att={a} onOpen={setViewing} />
      ))}
      <FullImage uri={viewing} onClose={() => setViewing(null)} />
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sentRow: { marginTop: 8 },
  thumbWrap: { position: "relative" },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 10,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
  },
  placeholder: { alignItems: "center", justifyContent: "center" },
  addTile: { alignItems: "center", justifyContent: "center", gap: 2, borderStyle: "dashed", borderColor: AMBER + "60" },
  addText: { fontSize: 11, fontFamily: fonts.medium, color: AMBER },
  remove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
  },
  fullBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  fullImage: { width: "100%", height: "90%" },
});
