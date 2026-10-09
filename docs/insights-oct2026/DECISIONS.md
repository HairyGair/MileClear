# Insights redesign: Anthony's decisions (9 Oct 2026)

- **A. "vs last week" comparison: stays Pro.** Anthony: "we're losing things to keep behind the paywall". The free summary card shows this week's figures only; the comparison with last week (sentence clause, arrows, percentages) shows for Pro, and free drivers see a quiet "Compare with last week with Pro" line. Do not move anything else to free in this release.
- **B. Personal streak counts weeks** ("weeks in a row with a trip recorded"). Work mode keeps the daily streak.
- **C. Free platform ranking preview: yes.** Free drivers see the order (1, 2, 3, platform names) without £ figures, with "See pay per mile with Pro". Pro sees the figures.
- **D. Drop "Today" from Insights.** Periods are Week | Month | Tax year.
- **E. Remove Recent Journeys from Insights.** (It stays on Home and Trips.)
- **F. Work mode: plainer hero card, no dial.** Personal mode keeps the avatar dial from SPEC-VISUAL.md; Work mode's summary card is the same card without the dial (headline number, sentence, three figures).

Still required whatever was decided (from AUDIT-UX.md / PROPOSALS.md):
- One number per fact: each figure comes from one calculation and appears once (claim, cost per mile, best platform, miles vs last week).
- Date-only earnings must not be counted at midnight (golden hours, best earning days); hide "best hours" until fixed.
- Badge icons drawn (no emoji "?" boxes); rename the 250 mi milestone so it no longer clashes with the "Road Warrior" badge; Personal mode never says "deduction", "trips/shift" or shows a Business column; Weekly Goal card either lets you set a goal or isn't shown.
