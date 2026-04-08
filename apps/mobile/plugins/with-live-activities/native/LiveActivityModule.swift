import ActivityKit
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
            distanceMiles: 0,
            speedMph: 0,
            tripCount: 0,
            startDate: Date()
        )

        // End any existing activities first to prevent duplicates
        // (concurrent background callbacks can each start one)
        let existingActivities = Activity<MileClearAttributes>.activities
        if !existingActivities.isEmpty {
            Task {
                for activity in existingActivities {
                    await activity.end(nil, dismissalPolicy: .immediate)
                }
            }
        }

        do {
            let staleDate = Date().addingTimeInterval(480) // 8 min stale timeout (background GPS updates can be sparse)
            let content = ActivityContent(state: initialState, staleDate: staleDate)
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

        // Reconstruct the original start date from the timestamp (ms since epoch)
        let startDateMs = params["startDateMs"] as? Double ?? Date().timeIntervalSince1970 * 1000
        let startDate = Date(timeIntervalSince1970: startDateMs / 1000)

        let phase = params["phase"] as? String ?? "active"
        let needsClassification = params["needsClassification"] as? Bool ?? false

        // endDate is optional - only present for saving/ended phases where the
        // timer should freeze. Passed as ms since epoch, or null to keep the
        // live-counting timer behavior from the active phase.
        var endDate: Date? = nil
        if let endDateMs = params["endDateMs"] as? Double, endDateMs > 0 {
            endDate = Date(timeIntervalSince1970: endDateMs / 1000)
        }

        let state = MileClearAttributes.ContentState(
            distanceMiles: params["distanceMiles"] as? Double ?? 0,
            speedMph: params["speedMph"] as? Double ?? 0,
            tripCount: params["tripCount"] as? Int ?? 0,
            startDate: startDate,
            phase: phase,
            endDate: endDate,
            needsClassification: needsClassification
        )

        // For ended/saving states, give iOS a shorter stale window so the
        // summary view has time to be visible without holding the live
        // activity open indefinitely. Active state uses the original 8min.
        let staleInterval: TimeInterval = phase == "active" ? 480 : 300
        let staleDate = Date().addingTimeInterval(staleInterval)
        let content = ActivityContent(state: state, staleDate: staleDate)

        Task {
            for activity in Activity<MileClearAttributes>.activities {
                if activityId == nil || activity.id == activityId {
                    await activity.update(content)
                }
            }
            resolve(true)
        }
    }

    // MARK: - endActivity (immediate dismiss)

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

    // MARK: - endActivityWithSummary (show final state briefly)

    @objc func endActivityWithSummary(
        _ params: NSDictionary,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.2, *) else {
            resolve(false)
            return
        }

        let startDateMs = params["startDateMs"] as? Double ?? Date().timeIntervalSince1970 * 1000
        let startDate = Date(timeIntervalSince1970: startDateMs / 1000)

        // Ended phase freezes the timer at endDate (defaulting to now if
        // the caller did not specify one - e.g. for legacy callers).
        var endDate = Date()
        if let endDateMs = params["endDateMs"] as? Double, endDateMs > 0 {
            endDate = Date(timeIntervalSince1970: endDateMs / 1000)
        }

        let needsClassification = params["needsClassification"] as? Bool ?? false

        let finalState = MileClearAttributes.ContentState(
            distanceMiles: params["distanceMiles"] as? Double ?? 0,
            speedMph: 0,
            tripCount: params["tripCount"] as? Int ?? 0,
            startDate: startDate,
            phase: "ended",
            endDate: endDate,
            needsClassification: needsClassification
        )

        let finalContent = ActivityContent(
            state: finalState,
            staleDate: Date().addingTimeInterval(300) // Visible for up to 5 min
        )

        Task {
            for activity in Activity<MileClearAttributes>.activities {
                await activity.end(finalContent, dismissalPolicy: .default)
            }
            resolve(true)
        }
    }

    // MARK: - getActiveActivityId

    @objc func getActiveActivityId(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        if #available(iOS 16.2, *) {
            let activities = Activity<MileClearAttributes>.activities
            resolve(activities.first?.id)
        } else {
            resolve(nil)
        }
    }

    // MARK: - getLiveActivityPhase
    //
    // Returns the phase of the current Live Activity, or nil if none is
    // running. Used by the main app on startup / foreground to detect
    // when an App Intent (EndTripIntent) has flipped the activity to
    // "saving" and the main app now needs to finalize the trip.

    @objc func getLiveActivityPhase(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        if #available(iOS 16.2, *) {
            if let activity = Activity<MileClearAttributes>.activities.first {
                resolve(activity.content.state.phase)
            } else {
                resolve(nil)
            }
        } else {
            resolve(nil)
        }
    }
}
