import Foundation
import React

/// Native module that writes the access token to App Group UserDefaults so
/// that Siri App Intents can authenticate with the MileClear API without
/// the app being open.
@objc(SiriModule)
class SiriModule: NSObject {

    @objc static func requiresMainQueueSetup() -> Bool { false }

    private let appGroupId = "group.com.mileclear.app"

    // MARK: setAccessToken

    @objc func setAccessToken(
        _ token: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        let defaults = UserDefaults(suiteName: appGroupId)
        defaults?.set(token, forKey: "mc_access_token")
        resolve(true)
    }

    // MARK: clearAccessToken

    @objc func clearAccessToken(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        let defaults = UserDefaults(suiteName: appGroupId)
        defaults?.removeObject(forKey: "mc_access_token")
        resolve(true)
    }
}
