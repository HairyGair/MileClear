# Android OEM battery guide: how to measure it

Guide: `apps/mobile/app/oem-battery-guide.tsx` (OPPO, realme, OnePlus, Motorola, HONOR, Huawei, vivo).
Baseline (30 days to 1 Nov 2026, drivers with a 5+ day run): silent-day share median Motorola 32%, OnePlus 33%, HONOR 36%, OPPO 58%, realme 67%; Samsung/Google/Xiaomi about 7%. Samples are 2-8 drivers per maker.

## Events (app_events, via POST /user/event)

| Type | Metadata | When |
|---|---|---|
| `oem_battery_guide.shown` | `maker`, `step: "intro"` | Screen opened |
| `oem_battery_guide.opened_settings` | `maker`, `step`, `opened: vendor/stock/app` | Open settings tapped |
| `oem_battery_guide.verified` | `maker`, `ignoringOptimizations: true/false/null` | Driver came back from settings |
| `oem_battery_guide.done` | `maker`, `step` | Done tapped |

The old `battery_opt_nudge.*` events still fire. The row tap logs `battery_opt_nudge.tapped` with `screen: "oem_guide"` for these makers. `battery_opt_nudge.resolved` fires if stock Unrestricted flips on.

## Cohorts

- Completed: users with an `oem_battery_guide.done` event. T0 = that event's createdAt (first one per user).
- Not completed: users on the same makers with `battery_opt_nudge.shown` or a dump with that maker, but no `.done`. T0 = the date of the completed cohort's median T0 (or each user's first `battery_opt_nudge.shown`), so both cohorts use a comparable "after" window.
- Optional strong subset: completed with `.verified` `ignoringOptimizations: true`.

## Measure

Per maker and cohort, over the 14 days before T0 and the 14 days after T0:

silent-day share = silent driving days / driving-active days

- Driving-active day: a day on which the user had a native engine signal (`trip.signal_start`) or any trip, same definition as `tmp-silent.mjs` (1 Nov report).
- Silent day: a driving-active day with no Trip row (endedAt that day) and no `trip.recording_dropped` explaining it.
- Only users with at least 5 driving-active days in each 14-day window.

Report, per maker and pooled: median per-driver share before and after for each cohort, and the difference of differences (completed after-minus-before, minus not-completed after-minus-before). Also report n drivers per cell; with 2-8 drivers per maker, pooled results are the only ones that mean anything. Also report the share of `.shown` users who reach `.done`, and the share of `.verified` with `ignoringOptimizations: true`.

Run no earlier than 14 days after the OTA reaches 100% (the after window needs a full 14 days for the first completers).

## What cannot be measured

Auto launch, Allow background activity, Manage automatically and the recents lock are not readable from the app. Only the stock Unrestricted setting is verified. A driver can tap Done without changing anything, so the `.verified` subset is the cleaner comparison.
