# What to Test - 1.3.7 (build 81)

Supersedes build 80 (never submitted). Carries everything from 1.3.5 plus the
quick-trip lock fix (build 80) and the multileg-deferral data-loss fix (new).

## New in this build

### Multileg deferral fix (the headline - real data loss in the field)

A day of multi-stop driving with the app suspended throughout accumulated as
one queue. On next app open, the queue was split into legs but only the OLDEST
leg was saved - the follow-up pass silently died, the boot self-heal couldn't
rescue it, and the NEXT drive's recording start deleted the queue. A driver
lost a full afternoon (3 legs, 818 GPS points) on 29 Jul.

Now: the wake processes ALL legs in one pass (drain loop), a restart finishes
the job if interrupted (boot rescue repaired), and a new recording open
finalizes a waiting queue instead of clearing it.

**Test (the important one, needs a real multi-stop drive):**
1. Drive somewhere, stop for 30+ min WITHOUT opening the app, drive again,
   stop again. Ideally 3+ legs across a few hours, phone left alone.
2. Open the app: EVERY leg should appear as its own trip within a minute -
   not just the first one.
3. Repeat, but after the multi-leg day do NOT open the app until after the
   next day's first drive - all the previous day's legs must still appear.
4. Watch diagnostics for `deferred_buffer_rescued_on_open` (the new rescue
   event) and repeated `finalize_multileg_split` entries (the drain loop).

### Quick-trip lock fix (from build 80, still needs its on-device pass)

1. Start Trip → drive → Arrived → save. Background the app, drive again
   WITHOUT starting a trip - the drive must auto-detect.
2. Start Trip, background the app ~45 min stationary. If the trip auto-saves,
   later drives must still auto-detect.
3. Manual trip added mid-shift must not affect the shift's tracking.

### HMRC fraud-prevention header restored

Invisible - confirm sign-in and sync behave normally.

## Carried from 1.3.5 (never publicly shipped until this train)

- Split Trip on a multi-stop recorded trip
- Cold-launch stability
- MTD signpost link to the Personal Tax Account

## Regression sweep

- Everyday auto-detection with the app closed
- Shift start → trips → end → scorecard
- Offline drive → sync on reconnect
