# What to Test - 1.3.6 (build 80)

Carries everything from 1.3.5 (build 79, never released publicly) plus the
quick-trip lock fix and the restored HMRC local-IPs header.

## New in this build

### Quick-trip lock fix (the headline)

A "Start Trip" that ended up saved by the automatic recorder could leave a
stuck tracking lock behind. The stuck lock silently suppressed ALL automatic
drive detection afterwards - the app looked healthy but never captured
another drive on its own. This build releases the lock on every save path,
prevents the two recorders running on one journey in the first place, and
self-heals a stuck lock within 3 hours instead of 18.

**Test:**
1. Tap Start Trip on the dashboard map, drive (or simulate), tap Arrived,
   save. Then background the app, drive again WITHOUT starting a trip - the
   drive should be auto-detected and captured.
2. Tap Start Trip, then background the app and leave it for ~45 minutes with
   the phone stationary. If the trip auto-saves, subsequent drives must still
   auto-detect (this was the broken case).
3. Add a manual trip (Trips tab, +) while a shift is running - the shift's
   live tracking must be unaffected.
4. Open a missed-journey suggestion and save it - normal behaviour, no
   effect on any active recording.

### HMRC fraud-prevention header restored

The device's local IP is again attached to API requests (needed for HMRC
Making Tax Digital compliance). Invisible to users - just confirm nothing
about sign-in / sync misbehaves.

## Carried from 1.3.5 (also needs coverage - it never shipped)

- **Split Trip**: long trip with a mid-journey stop → trip detail → Split
  Trip → check both halves look right.
- **Boot keep-alive revert**: general launch stability - app opens cleanly
  from cold, no crash on launch.
- **MTD signpost**: Self Assessment area shows the Personal Tax Account link.

## Regression sweep

- Auto drive detection with the app closed (the everyday path)
- Shift start → drives captured → shift end → scorecard
- Sync: aeroplane mode drive → trips appear once back online
