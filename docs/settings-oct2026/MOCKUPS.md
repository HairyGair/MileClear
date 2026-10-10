# Settings redesign: mockups (10 Oct 2026)

Phone size 390 x 844 pt, dark theme from `apps/mobile/lib/theme.ts`, Plus Jakarta Sans. Each mockup is an SVG plus a 2x PNG (rendered with headless Chrome and the app's own font files, since `rsvg-convert` is not installed). Demo values only: the demo account ("Demo", demo@mileclear.com, Toyota Prius hybrid), a gig driver who also drives for an employer, on Pro. Layouts are explained in `PROPOSALS.md`.

Visual rules carried over from Home: green tick means done, red means broken and always comes with a word ("Fix"), no amber icons (amber is kept for switches that are on and for "Add" actions), sentence-case group names, one card per group.

## Direction A: "Check-up first" (recommended)

- `mockups/a-settings` - The Settings page, first screen: "Is MileClear working?" (recording, last trip, notifications, uploads, all ticked), then "You and your car" (account, car, what you drive for, plan).
- `mockups/a-settings-problem` - Same page when something is wrong: "Trips aren't recording · Fix" and "Notifications blocked · Fix" in red. Nothing else moves.
- `mockups/a-settings-full` - The whole page scrolled out (390 x 2010): how MileClear works for you (recording options, notifications, saved places, work hours, Home screen, app lock switch), your records, help, Log out and version.
- `mockups/a-recording` - Sub-screen "Recording" (was Tracking & Locations): the status line, what your phone allows (four ticks), then your choices.
- `mockups/a-notifications` - Sub-screen "Notifications" when the phone blocks them: a red strip with "Open phone settings" first, switches dimmed, groups named by reason (about your trips, tax and money, your car and fuel).

## Direction B: "Five jobs"

- `mockups/b-settings` - The Settings page: five big rows (Recording, Notifications, You your car and your plan, Work and tax, Help privacy and your data), each with a live sentence.
- `mockups/b-you` - Sub-screen "You, your car and plan": account, your cars with MOT date, your plan with Manage or cancel and Restore, Home shortcuts, Delete account.

## Direction C: "You page, check-up and search"

- `mockups/c-you` - The "You" page that replaces Profile and Settings: name and plan, a check-up that lists the problem first, a search box with suggestions, your car and work, settings by area.
- `mockups/c-search` - Searching "cancel": each result says where it lives (You, Home, the Tax tab gear).
