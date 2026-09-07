import ActivityKit
import Foundation

/// Listens for the push-to-start token from the moment the app launches.
///
/// Why this exists (7 Sep 2026). A push-to-start push is the only way to put a
/// Live Activity on screen for a drive that begins with MileClear in the
/// background, and it needs a per-device token that iOS hands over exactly
/// once, through `Activity.pushToStartTokenUpdates`. That sequence does not
/// replay: whatever it emits before something is iterating it is gone.
///
/// Until now the iteration began on the first JS call to `getPushToStartToken`,
/// which happens after the React Native bridge is up, the user is
/// authenticated and the foreground handler runs — many seconds after launch,
/// and never at all for a launch that the user abandons. Apple has an open bug
/// for precisely this shape (FB21158660, reported across iOS 18.0.1 to 26.2),
/// where the token is issued during launch and discarded because nobody is
/// listening yet. The device then holds a token the server has never seen, and
/// every push we send goes to the old one: APNs still answers 200 and nothing
/// appears.
///
/// So the listener is attached from `+load` in LiveActivityBridge.m by way of
/// `UIApplicationDidFinishLaunchingNotification`, which is the earliest point
/// ActivityKit is usable, and the `Task` is held for the life of the process
/// rather than tied to a screen. The class is named explicitly for the
/// Objective-C runtime so the bridge can find it with `NSClassFromString`
/// without importing the generated Swift header, whose name changes with the
/// project.
@objc(LiveActivityTokenBootstrap)
public final class LiveActivityTokenBootstrap: NSObject {
    /// The newest token iOS has issued, or nil before the first one arrives.
    /// Guarded by a serial queue rather than a lock: the writer runs inside an
    /// async `for await`, where NSLock is unavailable (an error in Swift 6).
    private static let queue = DispatchQueue(label: "com.mileclear.la.token")
    private static var token: String?
    private static var observing = false
    /// Retained for the life of the process. A cancelled task stops the
    /// sequence, and a stopped sequence means a rotated token is never seen.
    private static var observerTask: Task<Void, Never>?

    /// Latest token, or nil. Safe from any thread.
    @objc public static var latestToken: String? {
        queue.sync { token }
    }

    /// Begin observing. Idempotent: safe to call from launch and again from JS.
    @objc public static func start() {
        guard #available(iOS 17.2, *) else { return }
        let alreadyObserving = queue.sync { () -> Bool in
            if observing { return true }
            observing = true
            return false
        }
        if alreadyObserving { return }

        observerTask = Task.detached(priority: .utility) {
            for await tokenData in Activity<MileClearAttributes>.pushToStartTokenUpdates {
                let hex = tokenData.map { String(format: "%02x", $0) }.joined()
                queue.sync { token = hex }
                NSLog("[LiveActivity] push-to-start token updated (%d chars)", hex.count)
            }
        }
    }
}
