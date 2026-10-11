# First-run tutorial: mockups (11 Oct 2026)

390 x 844 pt, dark theme from `apps/mobile/lib/theme.ts`, Plus Jakarta Sans from `apps/mobile/assets/fonts`. Each is an SVG plus a 2x PNG (780 x 1688) rendered with headless Chrome. Demo values only: a new gig driver near Sunderland, mid-October, first trip 12.4 miles (12.4 x 55p = £6.82). The drawing code is in `mockups/src/` (`node src/gen-a.mjs <dir>` writes the SVGs, `node src/render.mjs <dir>` makes the PNGs).

Status line wording is shortened in places to fit one line; the app's real wording is in `AUDIT.md` section 2.

## Direction A: "Set up and go" (recommended)
- `mockups/a-1-how-it-works` - Step 1 of 5: recording is automatic, starts at 15 mph, a stop of 4 minutes or more ends a trip, you sort each trip.
- `mockups/a-2-you-drive-for` - Step 2: the five "You drive for" answers (as in Settings) and Car or van / Motorbike.
- `mockups/a-3-location` - Step 3: why Always, and what the iPhone's two prompts will look like. Exit: "I'd rather add trips myself".
- `mockups/a-4-location-not-always` - Step 3b: only when the phone ends on While Using. Open Settings, or Use Start Trip only.
- `mockups/a-5-check` - Step 4: a live check of location, motion, Background App Refresh and notifications, and the real Home status line.
- `mockups/a-6-your-app` - Step 5: the four tabs in this driver's words, "Your first job", where to replay.
- `mockups/a-7-home-after` - Home straight after: green status line, "Your first trip", one Start Trip (Start Shift appears after the first trip). Nothing added to Home.
- `mockups/a-8-whats-new-existing` - Existing drivers: one What's new sheet, once.

## Direction B: "Show me when I get there" (coach marks)
- `mockups/b-1-home-status` - First open of Home: the status line lit up, 1 of 3.
- `mockups/b-2-home-first-trip` - The first trip lands: the Business / Personal choice lit up.
- `mockups/b-3-trips-split` - First split trip on Trips: why a shop stop makes two trips, and how to merge.
- `mockups/b-4-tax` - First open of Tax: the claim card, 55p then 25p, "We don't send anything to HMRC for you".
- `mockups/b-5-home-not-always` - Location refused: the only mark shown is the fix (a "just me" driver in Personal mode, so Insights instead of Tax).

## Direction C: "Getting started" (checklist)
- `mockups/c-1-home-getting-started` - Home for a new gig driver: Getting started, 2 of 6, in the hero's place, with Show me on the next item.
- `mockups/c-2-show-me-sort` - The Show me sheet for "Sort your first trip".
- `mockups/c-3-help-take-the-tour` - Help opens with Take the tour, the checklist progress, new drivers' six questions and EmSee. (The Help part is borrowed into the recommendation.)
- `mockups/c-4-home-all-done` - All six done: the card shows once and leaves.
