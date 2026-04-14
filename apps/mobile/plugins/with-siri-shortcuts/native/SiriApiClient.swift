import Foundation

// MARK: - Response models

struct TodaysStats: Decodable {
    let todayMiles: Double
    let todayTrips: Int
}

struct WeeklyProgress: Decodable {
    let currentPence: Int
    let goalPence: Int
}

// MARK: - SiriApiClient

/// Lightweight HTTP client used exclusively by Siri App Intents.
///
/// Reads the access token from App Group UserDefaults (written by the main
/// app via SiriModule) so that intents can authenticate without the app open.
class SiriApiClient {
    static let shared = SiriApiClient()

    private let apiBaseUrl = "https://api.mileclear.com"
    private let appGroupId = "group.com.mileclear.app"

    private var accessToken: String? {
        let defaults = UserDefaults(suiteName: appGroupId)
        return defaults?.string(forKey: "mc_access_token")
    }

    // MARK: fetchTodaysStats

    func fetchTodaysStats() async -> TodaysStats? {
        guard let token = accessToken else { return nil }
        guard let url = URL(string: "\(apiBaseUrl)/gamification/stats") else { return nil }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                return nil
            }
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let dataObj = json["data"] as? [String: Any] else {
                return nil
            }
            let todayMiles = dataObj["todayMiles"] as? Double ?? 0
            let todayTrips = dataObj["todayTrips"] as? Int ?? 0
            return TodaysStats(todayMiles: todayMiles, todayTrips: todayTrips)
        } catch {
            return nil
        }
    }

    // MARK: fetchWeeklyProgress

    func fetchWeeklyProgress() async -> WeeklyProgress? {
        guard let token = accessToken else { return nil }
        guard let url = URL(string: "\(apiBaseUrl)/user/weekly-progress") else { return nil }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                return nil
            }
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let dataObj = json["data"] as? [String: Any] else {
                return nil
            }
            // currentWeekEarningsPence from the API maps to currentPence here
            let currentPence = dataObj["currentWeekEarningsPence"] as? Int ?? 0
            let goalPence = dataObj["goalPence"] as? Int ?? 0
            return WeeklyProgress(currentPence: currentPence, goalPence: goalPence)
        } catch {
            return nil
        }
    }

    // MARK: logExpense

    func logExpense(amountPence: Int, description: String?) async -> Bool {
        guard let token = accessToken else { return false }
        guard let url = URL(string: "\(apiBaseUrl)/expenses") else { return false }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let today = ISO8601DateFormatter().string(from: Date()).prefix(10)
        var body: [String: Any] = [
            "amountPence": amountPence,
            "category": "other",
            "date": String(today),
        ]
        if let desc = description { body["description"] = desc }

        guard let bodyData = try? JSONSerialization.data(withJSONObject: body) else {
            return false
        }
        request.httpBody = bodyData

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            return (response as? HTTPURLResponse)?.statusCode == 201
        } catch {
            return false
        }
    }
}
