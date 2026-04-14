import AppIntents
import Foundation

// MARK: - StartShiftIntent

@available(iOS 16.0, *)
struct StartShiftIntent: AppIntent {
    static var title: LocalizedStringResource = "Start Shift"
    static var description = IntentDescription("Start tracking your shift in MileClear")

    // GPS tracking requires the app to be in the foreground
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult & ProvidesDialog {
        return .result(dialog: "Starting your shift in MileClear")
    }
}

// MARK: - TodaysMilesIntent

@available(iOS 16.0, *)
struct TodaysMilesIntent: AppIntent {
    static var title: LocalizedStringResource = "Today's Miles"
    static var description = IntentDescription("Check how many miles you've driven today")
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let client = SiriApiClient.shared
        guard let stats = await client.fetchTodaysStats() else {
            return .result(dialog: "Open MileClear to log in first")
        }
        let miles = String(format: "%.1f", stats.todayMiles)
        let trips = stats.todayTrips
        let tripWord = trips == 1 ? "trip" : "trips"
        return .result(dialog: "You've driven \(miles) miles across \(trips) \(tripWord) today")
    }
}

// MARK: - LogExpenseIntent

@available(iOS 16.0, *)
struct LogExpenseIntent: AppIntent {
    static var title: LocalizedStringResource = "Log Expense"
    static var description = IntentDescription("Log a business expense in MileClear")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Amount in pounds")
    var amount: Double

    @Parameter(title: "Description")
    var expenseDescription: String?

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let client = SiriApiClient.shared
        let pence = Int(amount * 100)
        let success = await client.logExpense(amountPence: pence, description: expenseDescription)
        if success {
            let formatted = String(format: "\u{00A3}%.2f", amount)
            return .result(dialog: "Logged \(formatted) expense")
        } else {
            return .result(dialog: "Could not log the expense. Open MileClear to log in first")
        }
    }
}

// MARK: - WeeklyGoalIntent

@available(iOS 16.0, *)
struct WeeklyGoalIntent: AppIntent {
    static var title: LocalizedStringResource = "Weekly Goal Progress"
    static var description = IntentDescription("Check your weekly earnings goal progress")
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let client = SiriApiClient.shared
        guard let progress = await client.fetchWeeklyProgress() else {
            return .result(dialog: "Open MileClear to log in first")
        }
        if progress.goalPence <= 0 {
            return .result(dialog: "You haven't set a weekly earnings goal yet. Open MileClear to set one")
        }
        let pct = min(100, Int((Double(progress.currentPence) / Double(progress.goalPence)) * 100))
        let earned = String(format: "\u{00A3}%.2f", Double(progress.currentPence) / 100.0)
        let goal = String(format: "\u{00A3}%.2f", Double(progress.goalPence) / 100.0)
        return .result(dialog: "You're at \(pct)% of your weekly goal. \(earned) of \(goal)")
    }
}
