# App Store submission: MileClear 1.3.10 (build 89)

Cut 8 Sep 2026 at f04d3ee, TestFlight since 8 Sep. Public App Store is 1.3.9 (build 87). Paste-ready copy for App Store Connect. No platform other than iOS is mentioned anywhere below (1.3.9 was rejected under 2.3.10 for an Android reference).

## Promotional Text (170 char limit)

Recommended (social proof + free-first; "1,000+" verified against the admin Users count of 1,035 on 9 Sep 2026):

```
1,000+ UK drivers track every mile free with MileClear - automatic trip detection, no monthly caps, and your HMRC mileage figure ready for Self Assessment.
```

(155 characters)

Variant (Live Activity-led, matches this release):

```
Your drive on the lock screen from the first mile to the last. Automatic trip detection, no caps, and your HMRC figure ready for Self Assessment. Free for UK drivers.
```

(166 characters)

Variant (hands-off):

```
Drive. MileClear records the trip, sorts the regular ones for you, and keeps your HMRC mileage figure ready. Free for UK drivers, no monthly caps.
```

(146 characters)

---

## What's New in This Version (4000 char limit)

```
Your drive stays on the lock screen
- The Live Activity and Dynamic Island now stay up for the whole of a detected drive, with the distance ticking over as you go. Previously it could appear and then vanish part-way through, or sit at zero miles.
- It also works after a restart or a force-quit, without opening the app first.
- Turning the Live Activity off in Settings now turns off all of it, including the one that starts when a drive is detected.

CarPlay
- The MileClear tile on the CarPlay dashboard shows the MileClear mark, the distance so far and what the drive is doing, each reading replacing the last.

Regular routes sort themselves
- A route you have classified the same way three or more times now arrives already classified, marked "auto" with an Undo. Undo it and that route goes back to being suggested rather than sorted. A route you have sorted both ways is never sorted for you.
- Fewer prompts: a sorted trip gets a plain "Trip recorded" notification with no buttons, and the "Trips to classify" reminder comes at most weekly.

Trips
- The trip list loads in well under a second. It used to take two to three.
- Every trip card carries a map of the route.
- If recording began part-way through a drive, the app says so and offers to extend the trip back to where you set off.
- Stopped mid-shift? When a trip ends at a drop or a wait, "Still on a job" keeps the next leg as part of the same trip.
- A stop part-way through a journey no longer inflates the miles of the drives either side of it.

Saved places
- With ten or more trips and fewer than two saved places, the app offers once to save your two most-visited places by name. Trips to and from saved places start and end cleanly.

Also
- A trip edited after being deleted elsewhere no longer leaves a stuck sync warning.
- Allowing notifications during onboarding now registers the phone for reminders straight away.

If a drive ever goes missing, report it from the app (Profile > Report a missing trip). The diagnostic that comes with it is what these fixes were built from.
```

(~2,050 characters)

Not claimed above, deliberately: nothing that needs a phone running iOS 17 or earlier (the widget minimum is iOS 18; those phones simply see no Live Activity).

---

## Mandatory subscription-disclosure block (App Description body)

Both 1.1.2 and 1.1.3 were rejected on 3.1.2(c) without this. It must be in the public App Description, not Notes for Reviewer:

```
Subscription terms:
MileClear Pro is £4.99/month or £44.99/year, auto-renewing. Subscriptions automatically renew unless cancelled at least 24 hours before the end of the current period. You can manage and cancel subscriptions in your iTunes & App Store account settings after purchase.
Privacy Policy: https://mileclear.com/privacy
Terms of Use (EULA): https://mileclear.com/terms
```

## Notes for Reviewer

```
Demo account: demo@mileclear.com (password as previously supplied). The account already holds trips, a vehicle and a tax summary.

Automatic trip detection, the Live Activity, the Dynamic Island and the CarPlay tile all need a real drive on a physical iPhone and cannot be exercised on the simulator. Everything else (trip list, classification, saved places, tax figures, exports) can be reviewed from the demo account without driving.
```

## Before submitting

- Demo account reseeded 8 Sep 2026 (script `apps/api/scripts/reseed-demo.ts`); within the 30-day window, no reseed needed.
- Release notes label: flip 1.3.10 to "Pending Review" at submission, then "Latest" on approval with 1.3.9 moving to "App Store".
- Known unverified: the CarPlay tile was type-checked and run on the simulator only; nobody with CarPlay has confirmed it on a real head unit yet. The wording above describes what it is built to do.
