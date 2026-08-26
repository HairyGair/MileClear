# What to test — 1.3.8 (build 84)

Nine commits, none of them in build 83, and six touch capture or sync. Build 83
was field-proven by a month of daily use; **this is the part that has never been
driven.** Items 1 to 3 are the ones worth a real drive; the rest are quick.

## 1. A multi-stop drive with at least one short hop  ⭐ the headline

Three separate fixes land on the same path, so one drive tests all of them.

Drive somewhere, stop for 10 minutes, drive a **short hop (under a mile)**, stop
again, then drive home.

Expect: **a trip for every leg, including the short one.** Before this build the
short hop could be discarded as stray GPS while the legs either side were kept.

Then open the longest trip and check the map draws the **whole** route, not half
of it, and that Split Trip can find the stops.

**If a leg is missing, or a route line stops partway, stop and say so — that is
the fix failing, and it is the reason for the build.**

## 2. Start Trip, then abandon it

Tap **Start Trip**, drive for 10 minutes, and **do not tap I've Arrived.**
Background the app and leave it alone.

Expect: the drive eventually becomes a trip on its own. Before this build the
recorded route was deleted about three hours after the tap.

## 3. Start Trip with the app killed mid-drive

Tap **Start Trip**, drive a few minutes, **force-quit the app** (swipe it away),
keep driving, then reopen it near the end and tap **I've Arrived**.

Expect: an amber card saying **"Part of this trip was estimated"** with the
minutes and miles it filled in, and a total that looks like the distance you
actually drove — not just the last stretch.

If routing is unavailable it should say **"Part of this trip was not recorded"**
and ask you to correct the mileage instead. Either message is a pass; silence is
a fail.

## 4. The missing-trip report

Finish a drive and, before the trip appears, tap **Missing a trip you made?** and
send.

Expect: a short "Checking your trips" pause, then **"A trip just finished
saving"** naming the drive and asking whether that was the one. Answering yes
closes the form without filing a report.

## 5. Journey boundary setting

**Settings → Tracking → "End a journey after"**. Five choices, 5 minutes to an
hour, default 30. Change it, force-quit, reopen, confirm it stuck.

## 6. A second person on the same phone

Sign out, sign in as `demo@mileclear.com`, and confirm **none of your trips,
shifts or saved places are visible**. Sign back in as yourself and confirm your
own data is intact.

⚠️ This one wipes the local database of the signed-out account, so do it last,
and only once your own trips have synced (check Sync status shows nothing
pending first).

## 7. Nothing to stage, just watch

A brief server outage during a save used to delete the user's row rather than
retry. Nothing to do here, but if an earning, fuel entry, shift or saved place
ever vanishes after a save, that is the regression to report.

---

**Server-side, already deployed (no app involvement):** National Insurance
Numbers are no longer written to the event log by the HMRC client, and the 114
historical rows have been scrubbed.
