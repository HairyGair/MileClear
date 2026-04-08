import ActivityKit
import Foundation

@available(iOS 16.1, *)
struct MileClearAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var distanceMiles: Double
        var speedMph: Double
        var tripCount: Int
        var startDate: Date

        // Phase of the activity. "active" is the normal in-progress state.
        // "saving" is shown immediately when the user taps End Trip, while
        // the main app finishes geocoding + classification + save. "ended"
        // is the final summary state shown for a short window after save.
        // Defaulted so existing serialized ContentStates (from running
        // activities at app update time) still decode.
        var phase: String = "active"

        // When the trip ended. Used to freeze the timer in the ended state
        // instead of showing a live-counting one. Null while active/saving.
        var endDate: Date? = nil

        // Whether the finalized trip still needs a business/personal
        // classification decision. Drives the "Classify Trip" CTA in the
        // ended-phase lock screen view.
        var needsClassification: Bool = false
    }

    var activityType: String // "trip" or "shift"
    var startedAt: Date
    var vehicleName: String
    var isBusinessMode: Bool
}
