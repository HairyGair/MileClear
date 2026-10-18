// Spoken prompts (expo-speech: AVSpeechSynthesizer on iOS, TextToSpeech on
// Android), British English.
//
// Ducking music: on iOS each utterance uses useApplicationAudioSession:
// false. Apple's docs for AVSpeechSynthesizer.usesApplicationAudioSession:
// "If false, the system creates a separate audio session to automatically
// manage speech, interruptions, and mixing and ducking the speech with other
// audio sources." So music or a podcast dips while a prompt is spoken and
// comes back after, and we never hold the app's own audio session (which
// would keep other audio ducked, or stop it, for the whole drive).
//
// Locked screen: speaking from the background needs the `audio`
// UIBackgroundModes entry (app.json). The app is already kept running in the
// background by the location engine while driving; the audio mode is what
// lets it start sound there. Both need a new native build; on a binary
// without expo-speech this module is a silent no-op, never a crash.
//
// Android: expo-speech does not ask for audio focus, so music is not ducked
// there in v1: the prompt plays over it.

import { Platform } from "react-native";

type SpeechModule = {
  speak: (text: string, options?: Record<string, unknown>) => void;
  stop: () => Promise<void>;
};

let speech: SpeechModule | null | undefined;

function load(): SpeechModule | null {
  if (speech !== undefined) return speech;
  try {
    // Lazy: requireNativeModule throws at import on a binary without it.
    speech = require("expo-speech") as SpeechModule;
  } catch {
    speech = null;
  }
  return speech;
}

export function voiceAvailable(): boolean {
  return load() !== null;
}

/** Say a prompt. Queued behind anything still being said. Never throws. */
export function say(text: string): void {
  const s = load();
  if (!s || !text) return;
  try {
    s.speak(text, {
      language: "en-GB",
      ...(Platform.OS === "ios" ? { useApplicationAudioSession: false } : {}),
    });
  } catch {
    // a missed prompt, never a crash
  }
}

/** Stop anything being said (mute, End, leaving the screen). */
export function hush(): void {
  const s = load();
  if (!s) return;
  s.stop().catch(() => {});
}
