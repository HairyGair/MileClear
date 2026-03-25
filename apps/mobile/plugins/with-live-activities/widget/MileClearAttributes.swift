import ActivityKit
import Foundation

@available(iOS 16.1, *)
struct MileClearAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var distanceMiles: Double
        var speedMph: Double
        var tripCount: Int
        var startDate: Date
    }

    var activityType: String // "trip" or "shift"
    var startedAt: Date
    var vehicleName: String
    var isBusinessMode: Bool
}
