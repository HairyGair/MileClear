import ActivityKit
import AppIntents
import Foundation

// MARK: - End Trip Intent
//
// LiveActivityIntent runs in the widget extension process, NOT the main app.
// This is the key difference versus a plain AppIntent: the perform() method
// executes the instant the user taps the button, with no app launch delay.
// The user sees the Live Activity flip to "Saving trip..." immediately.
//
// After flipping the phase, we do NOT directly trigger finalization here -
// the main app owns the SQLite database, OSRM client, API client, and
// classification engine. Those would all need to be duplicated into the
// widget extension process, which is not feasible.
//
// Instead, the main app polls the Live Activity phase at three points:
//   1. App startup (useEffect on mount in _layout.tsx)
//   2. AppState -> active transition (user opens the app)
//   3. Every background location task callback (detection.ts)
//
// If any of those sees phase == "saving" with auto_recording_active == 1,
// it runs finalizeAutoTrip() which flips the phase to "ended".
//
// In practice, the background location task keeps firing for the first
// few minutes after the user parks (iOS drip-feeds GPS callbacks), so the
// finalize typically runs within seconds of the intent tap - well before
// the user even picks the phone up.

@available(iOS 17.2, *)
struct EndTripIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "End Trip"
    static var description: IntentDescription = IntentDescription("Ends the current MileClear auto trip and saves it.")

    func perform() async throws -> some IntentResult {
        // Transition any live MileClear activity to the saving phase so the
        // lock screen shows "Saving trip..." instantly.
        for activity in Activity<MileClearAttributes>.activities {
            var state = activity.content.state
            // Only transition active -> saving. Don't overwrite an
            // already-ended state if the app raced ahead of us.
            if state.phase == "active" {
                state.phase = "saving"
                state.endDate = Date()
                // Keep the activity alive for up to 2 minutes while we wait
                // for the main app to flip it to "ended".
                let staleDate = Date().addingTimeInterval(120)
                let content = ActivityContent(state: state, staleDate: staleDate)
                await activity.update(content)
            }
        }
        return .result()
    }
}

// MARK: - Cancel Trip Intent
//
// Runs in the widget extension process when the user taps "Not Driving".
// Dismisses the Live Activity immediately. The main app will see
// auto_recording_active still set next time it runs and will clear it via
// the existing checkStaleAutoRecording / cancelAutoRecording flows.

@available(iOS 17.2, *)
struct CancelTripIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Not Driving"
    static var description: IntentDescription = IntentDescription("Dismisses the current MileClear driving detection.")

    func perform() async throws -> some IntentResult {
        // End all activities immediately - no summary view needed.
        for activity in Activity<MileClearAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
        return .result()
    }
}

// MARK: - Classify at the kerb
//
// The tax-relevant decision is "was that business or personal", and the best
// moment to ask is the one where the driver has just parked and still
// remembers. Until now the ended Live Activity offered "Classify Trip", which
// opens the app - so the decision was deferred, and unclassified trips are the
// single biggest tax risk in the data.
//
// These follow the EndTripIntent contract exactly: the widget process can only
// touch the activity's own state, so they record the CHOICE in `phase` and let
// the main app apply it at its next poll (detection.ts background task,
// app launch, or foreground). `phase` is chosen deliberately over a new field
// because getLiveActivityPhase() already crosses the bridge and is already
// polled at all three points - no new native method, no new plumbing.

@available(iOS 17.2, *)
private func recordClassification(_ value: String) async {
    for activity in Activity<MileClearAttributes>.activities {
        var state = activity.content.state
        // Only a finished trip can be classified, and only once.
        guard state.phase == "ended", state.needsClassification else { continue }
        state.phase = value
        state.needsClassification = false
        // Keep it on screen briefly so the tap visibly registers; the app
        // ends the activity once it has applied the classification.
        let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(120))
        await activity.update(content)
    }
}

@available(iOS 17.2, *)
struct ClassifyBusinessIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Business"
    static var description = IntentDescription("Marks the trip you just finished as a business journey.")

    func perform() async throws -> some IntentResult {
        await recordClassification("classified_business")
        return .result()
    }
}

@available(iOS 17.2, *)
struct ClassifyPersonalIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Personal"
    static var description = IntentDescription("Marks the trip you just finished as personal.")

    func perform() async throws -> some IntentResult {
        await recordClassification("classified_personal")
        return .result()
    }
}

// MARK: - Add a hop that was too short to record
//
// Drives under about a third of a mile are dropped on purpose (the phantom-trip
// floor), which from the driver's seat looks identical to the app failing: three
// of Denise Sweeney's Cove Bay hops on 22 Aug produced nothing and no
// explanation, and 34% of all 0.3-0.5 mile trips fleet-wide are typed in by
// hand. The activity is already on screen when this happens, so it can say so
// and offer the one-tap alternative rather than vanishing.

@available(iOS 17.2, *)
struct AddShortTripIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Add it"
    static var description = IntentDescription("Adds the short hop that was too brief to record automatically.")

    func perform() async throws -> some IntentResult {
        for activity in Activity<MileClearAttributes>.activities {
            var state = activity.content.state
            guard state.phase == "too_short" else { continue }
            state.phase = "too_short_add"
            let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(120))
            await activity.update(content)
        }
        return .result()
    }
}
