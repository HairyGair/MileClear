import AppIntents

// MARK: - MileClearShortcuts

// AppShortcutsProvider requires iOS 16.4+.
// The @available guard ensures older devices simply skip registration.
@available(iOS 16.4, *)
struct MileClearShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartShiftIntent(),
            phrases: [
                "Start my shift in \(.applicationName)",
                "Start tracking in \(.applicationName)"
            ],
            shortTitle: "Start Shift",
            systemImageName: "car.fill"
        )
        AppShortcut(
            intent: TodaysMilesIntent(),
            phrases: [
                "How many miles today in \(.applicationName)",
                "Today's miles in \(.applicationName)"
            ],
            shortTitle: "Today's Miles",
            systemImageName: "speedometer"
        )
        AppShortcut(
            intent: LogExpenseIntent(),
            phrases: [
                "Log expense in \(.applicationName)",
                "Log parking in \(.applicationName)"
            ],
            shortTitle: "Log Expense",
            systemImageName: "sterlingsign.circle"
        )
        AppShortcut(
            intent: WeeklyGoalIntent(),
            phrases: [
                "Weekly goal in \(.applicationName)",
                "How's my goal in \(.applicationName)"
            ],
            shortTitle: "Weekly Goal",
            systemImageName: "target"
        )
    }
}
