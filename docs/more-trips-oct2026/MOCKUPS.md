# More and Trips: mockups (11 Oct 2026)

Phone size 390 x 844 pt, dark theme from `apps/mobile/lib/theme.ts`, Plus Jakarta Sans and the app's own icon font (Ionicons). Each mockup is an SVG plus a 2x PNG. They are drawn by `mockups/build_more.py` and `mockups/build_trips.py` (shared parts in `mockups/lib.py`) and turned into PNGs by `mockups/render.sh` with headless Chrome, loading the app's font files (`rsvg-convert` is not installed). The SVGs name the fonts but don't embed them, so open the PNGs to see them as intended.

Demo values only: "Demo", Toyota Prius hybrid, Pro renewing 3 Nov, 3 saved places, a gig driver who also drives for an employer. Place names are the demo account's. No real driver.

Visual rules carried over from Home and Settings: sentence-case group names, one card per group, grey icons with no tiles, green tick means done, red means broken and always comes with "Fix" or "Retry", amber only for the one action, "Business chosen", routes and counts.

Today's screens for comparison: `screens/before/` (see `AUDIT.md`).

## More, Direction A: "Jobs with live sentences" (recommended)

- `mockups/a-more` - Gig driver on Pro, Work mode, first screen: name card with plan, "Your car" (cars, fuel, odometer, saved places, road alerts), "Your work".
- `mockups/a-more-full` - The whole page scrolled out (390 x 1786), gig driver: car, work, money (Earnings, Expenses, Invoices, one Bank row), progress (Insights, Badges), tools (Ticket defender, Ask EmSee), help and settings, version. No Log out.
- `mockups/a-more-problem` - A free driver whose recording is broken: Home's red strip "Trips aren't recording · Fix" under the name card; the plan line says "Free plan · see what Pro adds". Nothing else moves.
- `mockups/a-more-employee` - Employee in their own car: Work hours and Invite your manager; money is Expenses only.
- `mockups/a-more-company` - Company-car driver (team "Acme Ltd"): no money group; Work hours and Expenses under "Your work".
- `mockups/a-more-justme` - "Just me" driver, free, Personal mode (tab bar Home, Trips, Insights, More): "Your records" with Records and "Drive for work?", no money or work rows.

## More, Direction B: "Slim shortcuts"

- `mockups/b-more` - Name card, then car, money and work rows with no sentences, and one "Settings and help" row. Saved places, Work hours, Help and Invite a friend leave More.

## More, Direction C: "Car and money cards"

- `mockups/c-more` - Gig driver: a "Your car" card (car, MOT, odometer, fuel this month) and a "Your money in October" card (£412.60 earned, costs, receipts, unpaid invoice), then four rows.
- `mockups/c-more-company` - Company-car driver: the car card only, then Expenses and three rows.

## Trips, recommended refresh: "Same list, new clothes"

- `mockups/trips-list` - All trips: "We may have missed 2 drives · Check" strip, the slate switch (All · To sort 1 · Business · Personal), sentence-case day headers with the day's miles and the odometer line, rows led by the route with Home's small route drawing. Shows an unsorted trip with the Business / Personal control and the new labels: "Started with Start Trip", "Part 1 of 2 · split at a 20 min stop", "Saved later, when your phone woke up".
- `mockups/trips-to-sort` - To sort: "Drives we may have missed" with a quiet "Add trip" and "Not a trip", then "Business or personal?", then "Missing a trip? Tell us".
- `mockups/trip-detail` - Trip detail, top: map, when, from and to, 12.4 miles, "Recorded automatically · saved to your account", Business or personal?, then Which app, Purpose and Note as three rows (no chip walls), Edit trip.
- `mockups/trip-detail-bottom` - Trip detail, scrolled: the amber "The distance may be off · Check" strip (only when it applies), "Fix this trip" and "Use this trip" groups, Delete trip as red text.

## Trips, bolder option (not recommended now)

- `mockups/trips-list-days` - One card per day with the trips as rows inside, the odometer at the foot of each day, and a "This week" card at the top. No thumbnails.

## Rebuilding the mockups

```
cd docs/more-trips-oct2026/mockups
python3 build_more.py && python3 build_trips.py && ./render.sh
```
