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
        let tripContextLabel = params["tripContextLabel"] as? String ?? ""

        let attributes = MileClearAttributes(
            activityType: activityType,
            startedAt: Date(),
            vehicleName: vehicleName,
            isBusinessMode: isBusinessMode,
            tripContextLabel: tripContextLabel
        )

        let initialState = MileClearAttributes.ContentState(
            distanceMiles: 0,
            speedMph: 0,
            tripCount: 0,
            startDate: Date()
        )

        // An activity already on screen is handed straight back, and the
        // JS side adopts it (see lib/liveActivity/startRule.ts).
        //
        // This used to end every existing activity BEFORE requesting a new
        // one. In the background the request then failed ("Target is not
        // foreground"), so a second start inside one drive DESTROYED the
        // activity the server had just put up by push-to-start and left the
        // driver with a dark Dynamic Island for the rest of the journey.
        // 478 of 483 presence probes during an open recording found nothing
        // (7 Sep 2026). Never end an activity we are not certain to replace.
        let existingActivities = Activity<MileClearAttributes>.activities
        if let existing = existingActivities.first {
            resolve(existing.id)
            return
        }

        do {
            let staleDate = Date().addingTimeInterval(480) // 8 min stale timeout (background GPS updates can be sparse)
            let content = ActivityContent(state: initialState, staleDate: staleDate)
            let activity = try Activity.request(
                attributes: attributes,
                content: content,
                pushType: nil
            )
            // Only now that a replacement exists is it safe to clear any
            // duplicates a concurrent background callback may have created.
            let stale = existingActivities.filter { $0.id != activity.id }
            if !stale.isEmpty {
                Task {
                    for old in stale {
                        await old.end(nil, dismissalPolicy: .immediate)
                    }
                }
            }
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

        // Optional richness fields. Each is nil-safe so older JS callers
        // continue to work — defaults match the ContentState defaults.
        let dailyTotalMiles = params["dailyTotalMiles"] as? Double ?? 0
        let milestoneText = params["milestoneText"] as? String
        let earningsTodayPence = params["earningsTodayPence"] as? Int
        let hmrcDeductionPence = params["hmrcDeductionPence"] as? Int

        let state = MileClearAttributes.ContentState(
            distanceMiles: params["distanceMiles"] as? Double ?? 0,
            speedMph: params["speedMph"] as? Double ?? 0,
            tripCount: params["tripCount"] as? Int ?? 0,
            startDate: startDate,
            phase: phase,
            endDate: endDate,
            needsClassification: needsClassification,
            dailyTotalMiles: dailyTotalMiles,
            milestoneText: milestoneText,
            earningsTodayPence: earningsTodayPence,
            hmrcDeductionPence: hmrcDeductionPence
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
        let hmrcDeductionPence = params["hmrcDeductionPence"] as? Int

        let finalState = MileClearAttributes.ContentState(
            distanceMiles: params["distanceMiles"] as? Double ?? 0,
            speedMph: 0,
            tripCount: params["tripCount"] as? Int ?? 0,
            startDate: startDate,
            phase: "ended",
            endDate: endDate,
            needsClassification: needsClassification,
            hmrcDeductionPence: hmrcDeductionPence
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

    // MARK: - markClassified
    //
    // Clear the needsClassification flag on any running Live Activity
    // (active or ended state) once the user has classified the trip.
    // Removes the "Classify Trip" CTA from the lock screen summary.

    @objc func markClassified(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.2, *) else {
            resolve(false)
            return
        }
        Task {
            for activity in Activity<MileClearAttributes>.activities {
                let currentState = activity.content.state
                let updatedState = MileClearAttributes.ContentState(
                    distanceMiles: currentState.distanceMiles,
                    speedMph: currentState.speedMph,
                    tripCount: currentState.tripCount,
                    startDate: currentState.startDate,
                    phase: currentState.phase,
                    endDate: currentState.endDate,
                    needsClassification: false,
                    dailyTotalMiles: currentState.dailyTotalMiles,
                    milestoneText: currentState.milestoneText,
                    earningsTodayPence: currentState.earningsTodayPence,
                    hmrcDeductionPence: currentState.hmrcDeductionPence
                )
                let content = ActivityContent(state: updatedState, staleDate: nil)
                await activity.update(content)
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

    // MARK: - Pending kerbside decision (App Group)
    //
    // A LiveActivityIntent tap ("Business", "Personal", "Not Driving") is
    // recorded by the widget process in App Group UserDefaults, because the
    // activity it used to be recorded on is gone by the time the app looks.
    // The app reads it here, applies it, then clears it - read and clear are
    // separate so a failed apply keeps the driver's tap for the next poll.

    @objc func getPendingLiveActivityDecision(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        resolve(LiveActivityDecisionStore.pending())
    }

    @objc func clearPendingLiveActivityDecision(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        LiveActivityDecisionStore.clear()
        resolve(true)
    }

    // MARK: - Push-to-start token (iOS 17.2+)
    //
    // iOS refuses Activity.request() from the background ("Target is not
    // foreground"), so the ONLY way to start a Live Activity on a
    // background-detected drive is a remote APNs push-to-start. That push
    // targets a per-device push-to-start token, observed here and surfaced to
    // JS, which POSTs it to /notifications/la-token. The token can rotate, so
    // an observer keeps the latest value and JS re-reads it on launch/foreground.

    // The observer itself lives in LiveActivityTokenBootstrap and is attached
    // at app launch, not on the first call from JS. iOS emits the token once,
    // during launch, and the sequence does not replay — see that file.

    // Returns the device's current push-to-start token (hex), or nil on
    // iOS < 17.2 or before the system has issued one. Starts the observer on
    // first call. Waits briefly for the first emission if none cached yet.
    @objc func getPushToStartToken(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 17.2, *) else {
            resolve(nil)
            return
        }
        // Idempotent: launch normally got here first, but a process that
        // somehow missed it still starts observing rather than returning nil.
        LiveActivityTokenBootstrap.start()
        if let token = LiveActivityTokenBootstrap.latestToken {
            resolve(token)
            return
        }
        DispatchQueue.global().asyncAfter(deadline: .now() + 2.0) {
            resolve(LiveActivityTokenBootstrap.latestToken)
        }
    }
}
