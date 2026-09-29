# September blog digest — REWRITTEN 13 Sep 2026

**Endpoint:** `POST /admin/email/send-custom` — ✅ **VERIFIED to exist** 13 Sep at
`apps/api/src/routes/admin/index.ts:1922`, under the `/admin` prefix, and already
called by the admin comms page (`apps/web/src/app/dashboard/admin/comms/page.tsx:402`).
**Status:** ✅ **SENT 13 Sep 2026, 21:11–21:14 BST** on Anthony's "Send it".
Event `email.digest_sent` `2e85279b-0708-4857-a0d5-ec7ee7f6c179`.

| enumerated | 1,094 |
| processed without error | 1,093 |
| failed | 1 |
| **actually delivered** | **~1,040** |
| duration | 3 min 11 s |

⚠️ **"1,093" is NOT the delivered count** and must not be reported as one. The counter
increments when `sendCustomEmail` does not throw, and consent suppression does not
throw — it returns quietly. Delivery is bounded by `marketingEmailsEnabled`, which was
1,041 at the time of checking, minus the one hard failure.

The single failure was `testuser@example.com` (Resend 422, "Invalid `to` field"), a seed
row created 26 Aug, not a real person. Nothing to chase.

📉 The consent ceiling moved **1,042 → 1,041 during the send**: someone unsubscribed
from this very email via the one-click header. Expected, and the mechanism working.

## Why this was rewritten

The previous draft was written **29 Aug** and presented the three 28 August posts as
"what we wrote this month". Three more have published since, so sending it now would
have led with three-week-old posts and omitted the newest three:

| 10 Sep | What's new in version 1.3.10 |
| 7 Sep  | What a thousand drivers taught us |
| 1 Sep  | What's new in version 1.3.9 |

The old version is at `/tmp/digest-prev.md` for this session only.

## Send parameters (read from the handler, not assumed)

- `audience: "all"` → the where-clause is **empty**, so it enumerates every user.
  Consent is applied per recipient inside `sendCustomEmail` via `gated`.
- **`gated: true` — leave it true.** It defaults true. False would mail the 52 people
  who opted out.
- `dryRun: true` supported. ⚠️ The count it returns is the **enumeration**, not the
  delivered count: a dry run over `all` reports ~1,094, not the 1,042 who will receive it.
- `audience: "test"` + `testEmail` ignores consent and audience and sends one copy.

**Audience, checked 13 Sep:** 1,094 users, **1,042 opted in**, 52 opted out.

⚠️ **41 of those 52 unsubscribed in the last 30 days**, 43 of all opt-outs via the
one-click header. The list is actively shedding people, so this send should earn its
place. It is the first digest since the 28 Aug tester email.

## Two checks run 13 Sep

✅ **All seven links return 200** on the live site.

🔴 **A fabricated description was caught and removed.** My first pass described "What a
thousand drivers taught us" as being about "patterns in how they drive". It is not —
the post is about the first thousand members recording 54,000 journeys and three
quarters of a million miles, and about almost everything hard happening AFTER the
driving stops. **Every description below is now taken from that post's own `excerpt`
field in `apps/web/src/data/posts.ts`, not paraphrased from its title.** Do not write
these from memory: it is our own writing and getting it wrong in front of 1,042 people
is worse than saying nothing.

## Checklist

1. Preview via `POST /admin/email/preview-custom`.
2. `audience: "test"`, `testEmail: anthonygair@icloud.com`. Read it on a phone.
3. `audience: "all"`, `gated: true`, `dryRun: true` → expect ~1,094 enumerated.
4. Real send. **Synchronous, several minutes — it looks like it failed. NEVER retry.**
   Confirm from the API log line for the custom send.

---

Subject: A month of updates, and a thousand drivers
Eyebrow: MileClear updates
Title: What we wrote this month
Preheader: Two releases, what a thousand drivers taught us, and Android is in beta.

Six posts went up on mileclear.com/updates over the past few weeks. Here are the ones worth your time.

What a thousand drivers taught us. Our thousandth member signed up this month. Between them, the first thousand have recorded 54,000 journeys and three quarters of a million miles, and taught us that almost everything hard about a mileage tracker happens after the driving stops.
https://mileclear.com/updates/what-a-thousand-drivers-taught-us

What's new in version 1.3.10. The lock-screen counter that was never really there, a trip list that took two seconds to open, drives that sort themselves with a one-tap undo, and the CarPlay tile finally drawn properly.
https://mileclear.com/updates/whats-new-in-version-1-3-10

What's new in version 1.3.9. A release about the edges of a journey: the stop in the middle that used to weld two drives into one, the first few hundred metres before the app noticed you were moving, and the hop too short to save.
https://mileclear.com/updates/whats-new-in-version-1-3-9

What makes a journey end. Deciding a drive has started is easy. Deciding it has finished is the hard part, and getting it wrong welds a whole afternoon of visits into one enormous trip. How we now tell a stop from a traffic queue.
https://mileclear.com/updates/what-makes-a-journey-end

MileClear on Android: what is in the closed beta. Same account, same trips, and the same background tracking engine as the iPhone app. What works today, what does not yet, and why a port of a mileage tracker is harder than it sounds. Google needs twelve testers opted in for fourteen days before it can go public, so if you know anyone with an Android phone, reply with their Google account email and we will send them the link. Testers get Pro free.
https://mileclear.com/updates/mileclear-on-android-closed-beta

Milesheet: the company side of MileClear. If your staff claim mileage from you, the monthly routine is usually a spreadsheet, a stack of guesses, and nobody being sure. Milesheet is the manager's half: drivers record as normal, you approve a month in one screen, and payroll gets one file.
https://mileclear.com/updates/milesheet-mileage-claims-for-employers

If you missed it, Making Tax Digital reaches self-employed drivers with more than £50,000 of income from April 2026, and that threshold is on turnover, not profit.
https://mileclear.com/updates/making-tax-digital-self-employed-drivers
