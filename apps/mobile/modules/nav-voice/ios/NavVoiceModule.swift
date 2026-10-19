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
// The category is set ONCE when guidance starts (startGuidance) and put back
// as it was when guidance ends (endGuidance), so a prompt never changes it:
// every category change posts a route change, which modules/car-audio could
// otherwise read as the car connecting. The session is active only while a
// prompt is spoken (beginPrompt / endPrompt).
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
  private var prepared = false
  private var saved: (AVAudioSession.Category, AVAudioSession.Mode, AVAudioSession.CategoryOptions)?

  public func definition() -> ModuleDefinition {
    Name("NavVoice")

    Events("onInterruption")

    Function("isCallActive") { () -> Bool in
      return self.callActive()
    }

    // Guidance starts: remember the category, set ours once.
    AsyncFunction("startGuidance") { () -> Bool in
      return self.prepare()
    }

    // Guidance ends: put the category back as it was.
    AsyncFunction("endGuidance") { () -> Void in
      self.restore()
    }

    // Activate the session for one prompt. False: do not speak now (a call,
    // or the session could not be activated). Never changes the category
    // once guidance has started.
    AsyncFunction("beginPrompt") { () -> Bool in
      if self.callActive() { return false }
      if !self.prepared && !self.prepare() { return false }
      do {
        try AVAudioSession.sharedInstance().setActive(true)
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

  private func prepare() -> Bool {
    if prepared { return true }
    let session = AVAudioSession.sharedInstance()
    saved = (session.category, session.mode, session.categoryOptions)
    do {
      try session.setCategory(
        .playback,
        mode: .voicePrompt,
        options: [.duckOthers, .interruptSpokenAudioAndMixWithOthers]
      )
      prepared = true
      return true
    } catch {
      saved = nil
      return false
    }
  }

  private func restore() {
    guard prepared else { return }
    prepared = false
    let session = AVAudioSession.sharedInstance()
    try? session.setActive(false, options: [.notifyOthersOnDeactivation])
    if let (category, mode, options) = saved {
      try? session.setCategory(category, mode: mode, options: options)
    }
    saved = nil
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
