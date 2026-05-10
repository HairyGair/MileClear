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

        // ── Live Activity richness (10 May 2026) ────────────────────
        // Each is optional / defaulted so older serialized states from
        // activities running at update time still decode cleanly.

        // Total business+personal miles the user has driven today across
        // all trips, including this one in progress. Powers the "X.X mi
        // today" subtitle on the lock screen — context for the per-trip
        // distance shown above. 0 when not yet computed.
        var dailyTotalMiles: Double = 0

        // Milestone proximity message — e.g. "5.4 mi to 10K Club" or
        // "100 miles tonight!". JS computes from the user's lifetime
        // mileage + the next achievement threshold. Shown when within
        // ~50mi of a milestone; nil otherwise.
        var milestoneText: String? = nil

        // Today's earnings tally in pence, summed from manual + CSV +
        // open-banking sources. Shown only on shift activities for gig
        // drivers — gives at-a-glance progress toward a daily goal.
        // 0 when no earnings logged today; nil when hidden.
        var earningsTodayPence: Int? = nil
    }

    var activityType: String // "trip" or "shift"
    var startedAt: Date
    var vehicleName: String
    var isBusinessMode: Bool
}
