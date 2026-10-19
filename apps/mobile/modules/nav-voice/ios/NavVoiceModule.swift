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
  /// The category still has to go back (the session would not deactivate yet).
  private var restorePending = false
  /// Bumped by each startGuidance, so a late restore never undoes a new one.
  private var generation = 0

  public func definition() -> ModuleDefinition {
    Name("NavVoice")

    Events("onInterruption")

    Function("isCallActive") { () -> Bool in
      return self.callActive()
    }

    // Every session call runs on the main queue, so prepared / saved /
    // restorePending / generation are only ever touched from one thread
    // (the retries below are scheduled on it too).

    // Guidance starts: remember the category, set ours once.
    AsyncFunction("startGuidance") { () -> Bool in
      return self.prepare()
    }.runOnQueue(.main)

    // Guidance ends: deactivate (retrying while speech stops), then put the
    // category back as it was. JS stops speech before calling this.
    AsyncFunction("endGuidance") { (promise: Promise) in
      self.restore { promise.resolve(nil) }
    }.runOnQueue(.main)

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
    }.runOnQueue(.main)

    // Release after the prompt: other audio comes back up. Retries while
    // busy (speech still stopping), up to about 1.5 s. A restore left
    // pending by an end of guidance that could not deactivate is finished
    // here too.
    AsyncFunction("endPrompt") { (promise: Promise) in
      if self.restorePending && !self.prepared {
        self.restore { promise.resolve(nil) }
        return
      }
      self.deactivate(attempts: 5) { _ in promise.resolve(nil) }
    }.runOnQueue(.main)

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
    // A new guidance cancels a restore still waiting to deactivate; the
    // category saved before the first guidance is kept, never our own.
    generation += 1
    restorePending = false
    let session = AVAudioSession.sharedInstance()
    if saved == nil {
      saved = (session.category, session.mode, session.categoryOptions)
    }
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

  /// Deactivate with notifyOthersOnDeactivation, so music and podcasts come
  /// back. Deactivating can fail ("busy") while speech is still stopping, so
  /// retry every 300 ms, at most `attempts` times. Calls `done(true)` once it
  /// succeeded, `done(false)` if it never did.
  private func deactivate(attempts: Int, done: @escaping (Bool) -> Void) {
    do {
      try AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
      done(true)
    } catch {
      if attempts <= 1 {
        done(false)
        return
      }
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
        self?.deactivate(attempts: attempts - 1, done: done)
      }
    }
  }

  /// Guidance ends. The category goes back as it was ONLY after the session
  /// has really deactivated: switching a still-active session to the saved
  /// category (often soloAmbient) would leave other apps' audio stopped
  /// (final review, 19 Oct 2026). If it never deactivates, the restore stays
  /// pending and the next end (prompt or guidance) tries again.
  private func restore(done: @escaping () -> Void) {
    guard prepared || restorePending else {
      done()
      return
    }
    prepared = false
    restorePending = true
    let gen = generation
    deactivate(attempts: 10) { [weak self] ok in
      guard let self = self else { return done() }
      // A new guidance started meanwhile: leave its session alone.
      guard gen == self.generation else { return done() }
      if ok {
        if let (category, mode, options) = self.saved {
          try? AVAudioSession.sharedInstance().setCategory(category, mode: mode, options: options)
        }
        self.saved = nil
        self.restorePending = false
      }
      done()
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
