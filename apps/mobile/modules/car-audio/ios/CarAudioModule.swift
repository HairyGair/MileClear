import ExpoModulesCore
import AVFoundation

// Detects when the phone connects to / disconnects from car audio (CarPlay or a
// Bluetooth car stereo) by observing AVAudioSession route changes. Connecting to
// the car is the earliest, most reliable signal that a drive is starting — it
// beats CoreMotion and geofence latency, which is what loses short trips.
//
// It also reads which car it is: the output's portName is the name the car
// gives itself over Bluetooth (e.g. "MY FORD") and uid is stable per device.
// No Bluetooth permission is involved; this is the audio route the system
// already chose (docs/car-bluetooth-plan-oct2026.md).
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
      return CarAudioModule.carOutput(AVAudioSession.sharedInstance().currentRoute) != nil
    }

    // The car output the phone is on now, or nil. Same shape as the
    // onCarConnected payload: { name, id, kind }.
    Function("currentCarAudio") { () -> [String: Any]? in
      guard let output = CarAudioModule.carOutput(AVAudioSession.sharedInstance().currentRoute) else {
        return nil
      }
      return CarAudioModule.payload(output)
    }

    // Every car output on the route now, best first; currentCarAudio is the
    // first. JS drops nameless ones and duplicates.
    Function("currentCarAudioOutputs") { () -> [[String: Any]] in
      return CarAudioModule.carOutputs(AVAudioSession.sharedInstance().currentRoute).map {
        CarAudioModule.payload($0)
      }
    }

    // Lets JS tell this binary from one with the old module (no names).
    Function("hasOutputsApi") { () -> Bool in
      return true
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
    if let output = CarAudioModule.carOutput(AVAudioSession.sharedInstance().currentRoute) {
      self.sendEvent("onCarConnected", CarAudioModule.payload(output))
    } else {
      self.sendEvent("onCarDisconnected", [:])
    }
  }

  // Every car output on the route, best first: CarPlay (unambiguously a car),
  // then Bluetooth music, then Bluetooth calls. A route normally has a single
  // output, so the order only matters in rare multi-output routes.
  private static func carOutputs(_ route: AVAudioSessionRouteDescription) -> [AVAudioSessionPortDescription] {
    let ranked: [AVAudioSession.Port] = [.carAudio, .bluetoothA2DP, .bluetoothHFP]
    var result: [AVAudioSessionPortDescription] = []
    for type in ranked {
      result.append(contentsOf: route.outputs.filter { $0.portType == type })
    }
    return result
  }

  private static func carOutput(_ route: AVAudioSessionRouteDescription) -> AVAudioSessionPortDescription? {
    return carOutputs(route).first
  }

  private static func payload(_ output: AVAudioSessionPortDescription) -> [String: Any] {
    let name = output.portName.trimmingCharacters(in: .whitespacesAndNewlines)
    return [
      // JS drops a payload with an empty name (contract: never empty).
      "name": name,
      "id": stableId(output.uid) ?? NSNull(),
      "kind": output.portType == .carAudio ? "carplay" : "bluetooth",
    ]
  }

  // Bluetooth uids look like "00:11:22:33:44:55-tacl" (music) and
  // "00:11:22:33:44:55-tsco" (calls): the same car with two suffixes. Keep
  // only the last two bytes, masked as "XX:XX:XX:XX:44:55" exactly as
  // Android gives it, so both profiles and both phones give one id and the
  // full address never leaves the phone's native layer. Anything that is not
  // an address (CarPlay) is passed through unchanged.
  private static func stableId(_ uid: String) -> String? {
    let trimmed = uid.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return nil }
    let mac = "^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}"
    guard let range = trimmed.range(of: mac, options: .regularExpression) else {
      // Not an address uid, but mask any address inside it all the same.
      return trimmed.replacingOccurrences(
        of: "(?:[0-9A-Fa-f]{2}[:-]){4}([0-9A-Fa-f]{2})[:-]([0-9A-Fa-f]{2})",
        with: "XX:XX:XX:XX:$1:$2",
        options: .regularExpression
      )
    }
    let address = String(trimmed[range]).uppercased().replacingOccurrences(of: "-", with: ":")
    let tail = String(address.suffix(5))
    if tail == "00:00" { return nil }
    return "XX:XX:XX:XX:" + tail
  }
}
