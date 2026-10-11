# Quarterly updates: test again on HMRC's test service (Oct 2026)

For Anthony. About 30 minutes. This is item B2 on the launch checklist: walk the
whole journey once with today's app before the production credentials arrive.
Nothing here reaches your real tax account.

You have to do the sign-in part yourself, because it's HMRC's own page.

## Before you start

- **A real phone, not a simulator.** HMRC needs the phone's model in every
  call, and the server refuses a simulator ("This version of the app can't
  report your device details").
- **The latest build** from TestFlight (iPhone) or Play testing (Android).
- **Pro on the account you use.** The demo account is fine (it has Pro). If you
  use your own, make sure it's Pro.
- **You drive for** must be "Deliveries or gig work" or "Gig work and an
  employer". Employees don't see quarterly updates at all.
- Some earnings, expenses and business trips this tax year (since 6 April 2026),
  so the figures aren't all zero. The demo account has these.

## 1. Make an HMRC test user

1. Go to the HMRC Developer Hub, sign in, then open **Create test user**:
   https://developer.service.hmrc.gov.uk/api-test-user
2. Choose **Individual** and create one.
3. Write down what it gives you: **user ID**, **password**, **National Insurance
   number** and **MTD Income Tax ID**. Keep them out of anything public (this
   repo is public).

## 2. Find the screen

On the phone: **Tax tab > Your tax details > If you work for yourself >
Quarterly updates (test version)**.

The same screen is also at **More > Settings > You drive for**, then the same row.

**Check:** the screen says "Quarterly updates are a test version" at the top,
and, before you connect, a new card **"Do I need to send quarterly updates?"**
gives a plain answer from the account's earnings (for the demo account, most
likely "You don't need to yet") and lists the £50,000 / £30,000 / £20,000 limits.

## 3. Connect

1. Tap **Continue**. HMRC's sign-in page opens.
2. Sign in with the **test user ID and password** from step 1 (not your own
   Government Gateway). Agree to the access.
3. You come back to the app.

**Check:** the top says "Connected to HMRC's test service", with an amber dot.

If HMRC skips the sign-in and connects you as an earlier test user, close the
app fully and try again: the sign-in uses a private browser session, so this
shouldn't happen. If it does, note it.

## 4. National Insurance number

1. Tap **Enter NINO**, type the test user's NINO, tap **Save NINO**.

**Check:** you land on choosing your trade.

## 5. Trade

1. Pick the self-employment trade and confirm it.

**Check:** the screen moves on to your quarters.

If it says **"No self-employment trade on file"**, the test user has no business
at HMRC yet. That needs HMRC's test support service, which is an API call, not a
web page. Stop here and send me the test user's NINO in a private message; I'll
add a trade and you carry on from step 5.

## 6. Quarters (obligations)

**Check:**
- At least one open quarter shows, with its dates and "Due ..." date
  (for 2026-27: 6 Apr to 5 Jul due 7 Aug, 6 Jul to 5 Oct due 7 Nov, and so on).
- The coloured badge says how many days are left or late.
- "All caught up" only shows if HMRC really has nothing open. "Couldn't load
  your updates" means HMRC didn't answer; pull down to try again.

## 7. Preview and send

1. Tap the earliest open quarter.

**Check the figures on Review update:**
- Income matches the account's earnings from 6 April to the end of that quarter
  (updates are running totals from 6 April, not one quarter on its own).
- Mileage uses 55p a mile for the first 10,000 business miles (2026-27).
- Fuel and insurance are **not** counted on top of mileage.

2. Tap **Send test update**.

**Check:** "Test update complete", then a test tax calculation appears within
about 30 seconds.

## 8. Correct it (amend)

1. Change something small in that quarter in MileClear (add a £10 earning, or
   mark a personal trip as business).
2. Go back to Quarterly updates. If the quarter is still listed, open it and send
   again; otherwise send the next quarter.

**Check:** the new figures include the change, and it goes through.

## 9. History

1. On Quarterly updates, tap **See update history**.

**Check:** the update you sent and the calculation are listed under the right tax year.

## 10. Admin check (after the branch is deployed)

Open **mileclear.com/dashboard/admin/hmrc** (Operations > HMRC submissions).

**Check:** each send from steps 7 and 8 is there, marked **Test**, with **OK**
and a correlation id. No NINO anywhere on the page.

## If something fails

Write down, for each failure:

1. Which step, and what you tapped.
2. The exact message on screen (a screenshot is best).
3. The time (to the minute).
4. Phone model and app version (shown at the bottom of the More tab).

Then send that to me. With the time I can find the call on the server
(hmrc.api_error and hmrc.submission events carry HMRC's error code and
correlation id) and, once deployed, it shows on the admin page too. Don't
post the test user's NINO, user ID or password anywhere public.

## When it all passes

Write one line in `docs/hmrc-mtd-launch-checklist.md` under B2: the date, the
app version, and "passed". That, plus the admin page rows, is the evidence for
HMRC if they ask how the journey was tested.
