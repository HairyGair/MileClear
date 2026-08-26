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

        // HMRC mileage deduction earned by the trip so far, in pence.
        // Rendered in the frozen "Trip Complete" summary phase so the
        // user sees the tax saving the moment they park. Nil while
        // active / for personal trips with no deduction. JS computes
        // via calculateHmrcDeduction so the figure honours vehicle
        // type + 10k tier crossover.
        var hmrcDeductionPence: Int? = nil

        // ── Explicit wire format (build 85 date hedge, 25 Aug 2026) ─────
        // Push payloads carry dates as Unix epoch SECONDS. Swift's default
        // Codable reads a bare number as timeIntervalSinceReferenceDate
        // (2001), a 31-year error: our payload decoded to 2057 under the
        // default. Whether ActivityKit overrides the strategy is
        // undocumented, so the format is now explicit in both directions
        // and the question is moot. Encoding matches decoding, so local
        // activities (serialized between app and widget with this same
        // Codable) round-trip unchanged. decodeIfPresent + defaults also
        // makes the long-standing "defaulted so older states still decode"
        // comments actually true - synthesized Codable never did that.
        private enum CodingKeys: String, CodingKey {
            case distanceMiles, speedMph, tripCount, startDate, phase
            case endDate, needsClassification, dailyTotalMiles
            case milestoneText, earningsTodayPence, hmrcDeductionPence
        }

        init(
            distanceMiles: Double,
            speedMph: Double,
            tripCount: Int,
            startDate: Date,
            phase: String = "active",
            endDate: Date? = nil,
            needsClassification: Bool = false,
            dailyTotalMiles: Double = 0,
            milestoneText: String? = nil,
            earningsTodayPence: Int? = nil,
            hmrcDeductionPence: Int? = nil
        ) {
            self.distanceMiles = distanceMiles
            self.speedMph = speedMph
            self.tripCount = tripCount
            self.startDate = startDate
            self.phase = phase
            self.endDate = endDate
            self.needsClassification = needsClassification
            self.dailyTotalMiles = dailyTotalMiles
            self.milestoneText = milestoneText
            self.earningsTodayPence = earningsTodayPence
            self.hmrcDeductionPence = hmrcDeductionPence
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            distanceMiles = try c.decodeIfPresent(Double.self, forKey: .distanceMiles) ?? 0
            speedMph = try c.decodeIfPresent(Double.self, forKey: .speedMph) ?? 0
            tripCount = try c.decodeIfPresent(Int.self, forKey: .tripCount) ?? 0
            let startEpoch = try c.decode(Double.self, forKey: .startDate)
            startDate = Date(timeIntervalSince1970: startEpoch)
            phase = try c.decodeIfPresent(String.self, forKey: .phase) ?? "active"
            if let endEpoch = try c.decodeIfPresent(Double.self, forKey: .endDate) {
                endDate = Date(timeIntervalSince1970: endEpoch)
            } else {
                endDate = nil
            }
            needsClassification = try c.decodeIfPresent(Bool.self, forKey: .needsClassification) ?? false
            dailyTotalMiles = try c.decodeIfPresent(Double.self, forKey: .dailyTotalMiles) ?? 0
            milestoneText = try c.decodeIfPresent(String.self, forKey: .milestoneText)
            earningsTodayPence = try c.decodeIfPresent(Int.self, forKey: .earningsTodayPence)
            hmrcDeductionPence = try c.decodeIfPresent(Int.self, forKey: .hmrcDeductionPence)
        }

        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(distanceMiles, forKey: .distanceMiles)
            try c.encode(speedMph, forKey: .speedMph)
            try c.encode(tripCount, forKey: .tripCount)
            try c.encode(startDate.timeIntervalSince1970, forKey: .startDate)
            try c.encode(phase, forKey: .phase)
            try c.encodeIfPresent(endDate?.timeIntervalSince1970, forKey: .endDate)
            try c.encode(needsClassification, forKey: .needsClassification)
            try c.encode(dailyTotalMiles, forKey: .dailyTotalMiles)
            try c.encodeIfPresent(milestoneText, forKey: .milestoneText)
            try c.encodeIfPresent(earningsTodayPence, forKey: .earningsTodayPence)
            try c.encodeIfPresent(hmrcDeductionPence, forKey: .hmrcDeductionPence)
        }
    }

    var activityType: String // "trip" or "shift"
    var startedAt: Date
    var vehicleName: String
    var isBusinessMode: Bool

    // Optional context label set at activity start — e.g. "From Home"
    // for a geofence-detected trip departing a saved location. Renders
    // below the header as the trip's origin badge. Fixed for the
    // activity's lifetime (attrs are immutable in iOS Live Activities).
    // Empty string = no badge shown (matches the existing vehicleName
    // empty-check convention).
    var tripContextLabel: String = ""

    // Same explicit wire format as ContentState, same reasons.
    private enum CodingKeys: String, CodingKey {
        case activityType, startedAt, vehicleName, isBusinessMode, tripContextLabel
    }

    init(
        activityType: String,
        startedAt: Date,
        vehicleName: String,
        isBusinessMode: Bool,
        tripContextLabel: String = ""
    ) {
        self.activityType = activityType
        self.startedAt = startedAt
        self.vehicleName = vehicleName
        self.isBusinessMode = isBusinessMode
        self.tripContextLabel = tripContextLabel
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        activityType = try c.decodeIfPresent(String.self, forKey: .activityType) ?? "trip"
        startedAt = Date(timeIntervalSince1970: try c.decode(Double.self, forKey: .startedAt))
        vehicleName = try c.decodeIfPresent(String.self, forKey: .vehicleName) ?? ""
        isBusinessMode = try c.decodeIfPresent(Bool.self, forKey: .isBusinessMode) ?? true
        tripContextLabel = try c.decodeIfPresent(String.self, forKey: .tripContextLabel) ?? ""
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(activityType, forKey: .activityType)
        try c.encode(startedAt.timeIntervalSince1970, forKey: .startedAt)
        try c.encode(vehicleName, forKey: .vehicleName)
        try c.encode(isBusinessMode, forKey: .isBusinessMode)
        try c.encode(tripContextLabel, forKey: .tripContextLabel)
    }
}
