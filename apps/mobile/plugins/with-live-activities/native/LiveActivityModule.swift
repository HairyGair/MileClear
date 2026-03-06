import Foundation
import React

@objc(LiveActivityModule)
class LiveActivityModule: NSObject {

    @objc static func requiresMainQueueSetup() -> Bool { false }

    // MARK: - isSupported

    @objc func isSupported(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        if #available(iOS 16.2, *) {
            resolve(ActivityAuthorizationInfo().areActivitiesEnabled)
        } else {
            resolve(false)
        }
    }

    // MARK: - startActivity

    @objc func startActivity(
        _ params: NSDictionary,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.2, *) else {
            reject("UNSUPPORTED", "Live Activities require iOS 16.2+", nil)
            return
        }

        let activityType = params["activityType"] as? String ?? "trip"
        let vehicleName = params["vehicleName"] as? String ?? ""
        let isBusinessMode = params["isBusinessMode"] as? Bool ?? true

        let attributes = MileClearAttributes(
            activityType: activityType,
            startedAt: Date(),
            vehicleName: vehicleName,
            isBusinessMode: isBusinessMode
        )

        let initialState = MileClearAttributes.ContentState(
            elapsedSeconds: 0,
            distanceMiles: 0,
            speedMph: 0,
            tripCount: 0
        )

        do {
            let content = ActivityContent(state: initialState, staleDate: nil)
            let activity = try Activity.request(
                attributes: attributes,
                content: content,
                pushType: nil
            )
            resolve(activity.id)
        } catch {
            reject("START_FAILED", error.localizedDescription, error)
        }
    }

    // MARK: - updateActivity

    @objc func updateActivity(
        _ params: NSDictionary,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.2, *) else {
            resolve(false)
            return
        }

        let activityId = params["activityId"] as? String
        let state = MileClearAttributes.ContentState(
            elapsedSeconds: params["elapsedSeconds"] as? Int ?? 0,
            distanceMiles: params["distanceMiles"] as? Double ?? 0,
            speedMph: params["speedMph"] as? Double ?? 0,
            tripCount: params["tripCount"] as? Int ?? 0
        )

        let content = ActivityContent(state: state, staleDate: nil)

        Task {
            // Find the activity by ID, or update all MileClear activities
            for activity in Activity<MileClearAttributes>.activities {
                if activityId == nil || activity.id == activityId {
                    await activity.update(content)
                }
            }
            resolve(true)
        }
    }

    // MARK: - endActivity

    @objc func endActivity(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.2, *) else {
            resolve(false)
            return
        }

        Task {
            for activity in Activity<MileClearAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            resolve(true)
        }
    }
}
