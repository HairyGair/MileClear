# What to test — 1.2.0 build 63

Copy this into the TestFlight **"What to Test"** field (4000 char limit).
Stays well under at ~3,700 chars. Plain text — ASC doesn't render markdown.

---

Biggest release we've shipped. HMRC quarterly submissions, road-snapped trip maps, invoice tracker, PAYE-aware tax estimate. Six things to focus on:

1. HMRC quarterly submissions (Pro). Settings → Work & Tax → MTD ITSA → Connect to HMRC. Complete OAuth, enter NINO (test: AA000003D), confirm trade, tap an obligation → Review submission. Check the breakdown looks right. DO NOT actually submit — sandbox only. Test Disconnect afterwards. Report anything weird in the preview.

2. Manual trip routing. Add a manual trip with both endpoints set — distance card should say "Route distance via road" or "...cached". Add the SAME route as a second trip — distance must be identical. Trip detail map should show road-snapped route, not a straight line. If you see "Couldn't calculate route" often, tell us.

3. Auto-classify learning. Add 3 trips between the same two addresses tagged the same way. On the 4th, classification + platform should pre-fill automatically with a "Auto-classified based on N similar trips" toast. Override still works.

4. Invoice tracker. Settings → Work & Tax → Invoices → "+". Add one. Mark it paid → flips green. Wait 30 days OR back-date sentAt → status flips to Overdue. Free tier: try a 4th invoice this month → paywall fires with "See Pro" button. Tax Readiness should reflect paid invoices in gross income (cash basis).

5. PAYE tax-paid offset (Employee or Both work types only). Settings → Work & Tax → PAYE Employment → Tax already deducted. Enter £3000 — Tax Readiness "estimated tax" should drop by that amount. Clear it, figure should return to the gross liability. This is Laura's fix — salaried side-giggers please test this carefully.

6. Trip confidence + Recheck. Open any trip — distance card now has a coloured pill (High/Medium/Low) with tap-to-expand reasons. Trips list shows small dots on lower-confidence rows. Settings → Data & Exports → Recheck suspicious trips → either "All clear" or surfaces a fix prompt.

Polish items that should just work (shout if not): Live Activity now shows TODAY/NEXT/EARNED context line on lock screen during a trip. One-tap "Recalculate distance" button on trip detail. Post-save "Trip saved" review overlay for manual trips. Trip-merge suggestion when two trips are within 15 min and 1km (typical of fuel stops). Heartbeat alerts if bg location/refresh is turned off. Data-quality banner on dashboard summarising any historical corrections we made for you.

Demo account if you don't want your own: demo@mileclear.com / MileClear2026!

Report bugs via Profile → Suggestions → Submit, or DM in the Facebook group. Urgent issues: support@mileclear.com.

Known: EAS Update OTA is disabled on this build (config fixed for next one), so urgent JS bugs mean a build 64 not a hot-patch. Expo doctor reports 4 package "mismatches" — three are pre-existing harmless pins; one (Reanimated 3 vs 4) is intentional. Not user-visible.

Thanks — this one's big. Cheers.
