# What to test — 1.3.7 (build 83)

Build 83 exists for one reason: HMRC's Fraud Headers team rejected our
submissions because `Gov-Client-User-Agent` carried `device-model=Unknown`.
The fix reports the real hardware model. Everything else is carried over
from build 82.

**The whole point of this build is the HMRC evidence run, and it cannot be
done on a simulator.** A simulator reports its host architecture (`arm64`,
`x86_64`) as the model, which would fail HMRC's check exactly as before.

## 1. HMRC evidence run (the reason for the build)

Do this on **two or more real iPhones, signed in as different users**. HMRC
asked for this explicitly: "make submissions using different hardware and
users so we can see the fraud prevention headers have been implemented
correctly."

On each device:

1. Update to build 83 in TestFlight and confirm the version reads 1.3.7 (83).
2. Connect the HMRC account (Settings > Making Tax Digital) and complete an
   MTD submission end to end.
3. Nothing to check in the UI for this - the evidence is server side.

Then confirm from the server that the headers went out correctly. The
`hmrc.api_call` events should show a real model per device, for example
`iPhone15,2`, and **never** the string `Unknown`.

⚠️ Do **not** make any MTD call from a device still on build 82 or earlier
between now and HMRC's re-review. One unfixed submission poisons the sample.

## 2. Timing for the re-review request

The last bad submissions were 17 July. HMRC review a rolling 30 days, so the
bad sample ages out around **17 August 2026**. Make the fresh submissions
now, then ask John Morris for re-review on or after that date, so the window
they inspect contains only corrected traffic.

## 3. Regression check (should be unaffected, but confirm)

expo-device is a new native dependency, so it is worth one pass over the
basics to confirm the binary is healthy:

1. **Cold launch** - app opens, no crash. (This is the check that matters
   most after adding any native module.)
2. **Trip capture** - drive, confirm a trip records and syncs.
3. **Multileg** - the build 82 multi-stop drive test, if not already done.

## 4. Android

The Android half of the fix needs no new native module and is already on the
`android` branch's merge list. Nothing to test here for HMRC purposes yet.
