import ExpoModulesCore
import AVFoundation

// Detects when the phone connects to / disconnects from car audio (CarPlay or a
// Bluetooth car stereo) by observing AVAudioSession route changes. Connecting to
// the car is the earliest, most reliable signal that a drive is starting — it
// beats CoreMotion and geofence latency, which is what loses short trips.
//
// Note: route-change notifications are delivered while the app is running. Full
// background coverage may need an active audio session; this module is the
// foreground/connected-fast-path trigger we iterate on.
public class CarAudioModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CarAudio")

    Events("onCarConnected", "onCarDisconnected")

    // Synchronous check of the current output route.
    Function("isConnectedToCar") { () -> Bool in
      return CarAudioModule.routeIsCar(AVAudioSession.sharedInstance().currentRoute)
    }

    // Register the route-change observer only while JS is listening.
    OnStartObserving {
      NotificationCenter.default.addObserver(
        self,
        selector: #selector(self.handleRouteChange(_:)),
        name: AVAudioSession.routeChangeNotification,
        object: nil
      )
    }

    OnStopObserving {
      NotificationCenter.default.removeObserver(
        self,
        name: AVAudioSession.routeChangeNotification,
        object: nil
      )
    }
  }

  @objc
  private func handleRouteChange(_ notification: Notification) {
    // Only a device arriving or leaving says anything about the car. Our own
    // audio session changing (a Directions voice prompt switching category
    // or activating, 1.4.0) also posts a route change; acting on that could
    // fire onCarConnected and wake trip tracking. Ignore every other reason.
    guard let info = notification.userInfo,
          let raw = info[AVAudioSessionRouteChangeReasonKey] as? UInt,
          let reason = AVAudioSession.RouteChangeReason(rawValue: raw),
          reason == .newDeviceAvailable || reason == .oldDeviceUnavailable else {
      return
    }
    let isCar = CarAudioModule.routeIsCar(AVAudioSession.sharedInstance().currentRoute)
    if isCar {
      self.sendEvent("onCarConnected", [:])
    } else {
      self.sendEvent("onCarDisconnected", [:])
    }
  }

  private static func routeIsCar(_ route: AVAudioSessionRouteDescription) -> Bool {
    for output in route.outputs {
      switch output.portType {
      case .carAudio, .bluetoothA2DP, .bluetoothHFP:
        return true
      default:
        continue
      }
    }
    return false
  }
}
