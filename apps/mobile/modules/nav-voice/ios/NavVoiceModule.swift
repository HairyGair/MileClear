import ExpoModulesCore
import AVFoundation
import CallKit

// The audio session for spoken directions (1.4.0, docs/navigation-1.4.0/PLAN.md F4).
//
// expo-speech speaks; this decides how the speech mixes with everything else:
//   - category .playback, so the ring/silent switch does not mute directions
//     (they are media, like any sat nav);
//   - mode .voicePrompt, the mode Apple made for navigation prompts;
//   - .duckOthers: music dips while a prompt is spoken;
//   - .interruptSpokenAudioAndMixWithOthers: podcasts and audiobooks pause for
//     the prompt and resume after it.
// The session is active only while a prompt is spoken (beginPrompt / endPrompt).
// Deactivating with .notifyOthersOnDeactivation brings music back up and lets a
// paused podcast carry on. Holding the session for the whole drive would keep
// music ducked the entire time.
//
// No prompt during a phone call: beginPrompt returns false while CallKit sees
// a call that has not ended (cellular, FaceTime, and VoIP apps that use CallKit).
// Interruptions (a call arriving mid-prompt, Siri) are sent to JS as events.
//
// Nothing here touches location or trip recording.
public class NavVoiceModule: Module {
  private let callObserver = CXCallObserver()
  private var observing = false

  public func definition() -> ModuleDefinition {
    Name("NavVoice")

    Events("onInterruption")

    Function("isCallActive") { () -> Bool in
      return self.callActive()
    }

    // Activate the session for one prompt. False: do not speak now (a call,
    // or the session could not be activated).
    AsyncFunction("beginPrompt") { () -> Bool in
      if self.callActive() { return false }
      let session = AVAudioSession.sharedInstance()
      do {
        try session.setCategory(
          .playback,
          mode: .voicePrompt,
          options: [.duckOthers, .interruptSpokenAudioAndMixWithOthers]
        )
        try session.setActive(true)
        return true
      } catch {
        return false
      }
    }

    // Release after the prompt: other audio comes back up.
    AsyncFunction("endPrompt") { () -> Void in
      do {
        try AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
      } catch {
        // Busy (something still playing through us). The next endPrompt retries.
      }
    }

    OnStartObserving {
      if self.observing { return }
      self.observing = true
      NotificationCenter.default.addObserver(
        self,
        selector: #selector(self.handleInterruption(_:)),
        name: AVAudioSession.interruptionNotification,
        object: AVAudioSession.sharedInstance()
      )
    }

    OnStopObserving {
      if !self.observing { return }
      self.observing = false
      NotificationCenter.default.removeObserver(
        self,
        name: AVAudioSession.interruptionNotification,
        object: AVAudioSession.sharedInstance()
      )
    }
  }

  private func callActive() -> Bool {
    return callObserver.calls.contains { !$0.hasEnded }
  }

  @objc
  private func handleInterruption(_ notification: Notification) {
    guard let info = notification.userInfo,
          let raw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: raw) else {
      return
    }
    sendEvent("onInterruption", ["began": type == .began])
  }
}
