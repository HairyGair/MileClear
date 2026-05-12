// AppModal — single canonical Modal wrapper for the app.
//
// Three things this enforces that the raw react-native Modal doesn't
// gate by default and that we hit on every iPad rejection cycle:
//
//   1. `presentationStyle="overFullScreen"` — the iPad-safe presentation
//      mode. The "Got it" button on the Work Mode Explainer (Apple
//      rejection, build 60) was unresponsive on iPadOS 26.4.2 because
//      the default presentation broke hit-testing. The fix that
//      shipped in build 61 set this on each Modal individually; this
//      wrapper makes it structural.
//   2. `statusBarTranslucent` — keeps Android status bar from pushing
//      the modal content down on the off-chance MileClear ever ships
//      Android. Harmless on iOS.
//   3. `animationType="slide"` — sliding from below is the iOS-native
//      modal idiom (Mail, Messages, Calendar all use it). Fade and
//      none read as "older" or "lighter weight".
//
// Anything else (`visible`, `onRequestClose`, children) passes through.
//
// Don't add a backdrop, close button, or content wrapper here — modal
// content varies too widely (full-screen forms, bottom sheets, alerts,
// scorecards). Callers build their own inner View / chrome.

import { Modal } from "react-native";
import type { ComponentProps, ReactNode } from "react";

type ModalProps = ComponentProps<typeof Modal>;

interface AppModalProps {
  visible: boolean;
  onRequestClose?: () => void;
  /** Override the default slide-from-below if a fade is more appropriate
   *  (e.g. confirm dialogs that should feel lighter). Default: slide. */
  animationType?: "slide" | "fade" | "none";
  /** Set to true to make the modal background transparent so a custom
   *  backdrop in `children` shows through. Defaults to true because
   *  most MileClear modals render their own dark overlay. */
  transparent?: boolean;
  children: ReactNode;
  /** Escape hatch — pass any other props through to the underlying
   *  react-native Modal. Use sparingly; the whole point of this
   *  wrapper is to standardise behaviour. */
  rest?: Partial<ModalProps>;
}

export function AppModal({
  visible,
  onRequestClose,
  animationType = "slide",
  transparent = true,
  children,
  rest,
}: AppModalProps) {
  return (
    <Modal
      visible={visible}
      onRequestClose={onRequestClose}
      animationType={animationType}
      transparent={transparent}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      {...rest}
    >
      {children}
    </Modal>
  );
}
