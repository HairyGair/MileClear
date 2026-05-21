// Tax tip of the day — content bank + selection logic.
//
// 65 hand-written tips covering the topics UK self-employed drivers
// actually search for: allowable expenses, deadlines, SA walkthroughs,
// money-saving "did you know"s, common mistakes, and how to get more
// out of MileClear itself.
//
// Each tip has a `season` window if it's time-sensitive (e.g. a "31
// January is coming" reminder shouldn't fire in July). Seasonless tips
// are always eligible.
//
// Phase 1C of the Discord roadmap (21 May 2026).

export type TaxTipCategory =
  | "expenses"
  | "deadlines"
  | "self-assessment"
  | "did-you-know"
  | "mistakes"
  | "mileclear";

export interface TaxTip {
  /** Stable slug — never reuse, even after edits. Used for dedup
   *  against the AppEvent log so a wording tweak doesn't trigger a
   *  repost. */
  id: string;
  title: string;
  body: string;
  category: TaxTipCategory;
  /** Optional season window. Month/day inclusive — e.g. { fromMonth: 12,
   *  fromDay: 1, toMonth: 1, toDay: 31 } restricts the tip to early
   *  December through end of January. Wraps over year-end correctly. */
  season?: { fromMonth: number; fromDay: number; toMonth: number; toDay: number };
}

export const TAX_TIPS: TaxTip[] = [
  // ── Allowable expenses ────────────────────────────────────────────
  {
    id: "exp-parking",
    title: "💡 Parking + tolls are deductible",
    body:
      "Every paid parking session and toll on a business trip is an allowable expense. Save the receipt — even a photo is fine for HMRC.",
    category: "expenses",
  },
  {
    id: "exp-phone-bill",
    title: "💡 Claim the business portion of your phone bill",
    body:
      "If you use your phone for delivery apps, customer calls, or navigation, the business-use percentage of your monthly bill is deductible. A typical driver claims 50-70%.",
    category: "expenses",
  },
  {
    id: "exp-accountant-fees",
    title: "💡 Accountancy fees are an allowable expense",
    body:
      "Anything you pay an accountant for preparing your self-assessment, bookkeeping, or VAT returns goes on your tax return as a business expense. Saves you money on the bill that hired them.",
    category: "expenses",
  },
  {
    id: "exp-vehicle-cleaning",
    title: "💡 Vehicle cleaning is deductible (when it's a business cost)",
    body:
      "If you clean your car/van for customers (rideshare standards, food-delivery hygiene), the cost is allowable. Personal monthly washes aren't — but the 5x a week valets for Uber Premium absolutely are.",
    category: "expenses",
  },
  {
    id: "exp-trade-subs",
    title: "💡 Trade subscriptions are deductible",
    body:
      "Driver Net, Professional Drivers GB membership, dashcam cloud plans — anything you pay to do your work better is an allowable expense.",
    category: "expenses",
  },
  {
    id: "exp-public-liability",
    title: "💡 Hire & reward + public liability insurance is deductible",
    body:
      "The premium increase above your personal car insurance because of business use is fully claimable. So is dedicated taxi insurance, courier cover, or public liability.",
    category: "expenses",
  },
  {
    id: "exp-small-equipment",
    title: "💡 Small equipment (under £200) is straightforward",
    body:
      "Phone mounts, dashcams, USB chargers, delivery bags — anything under £200 is a normal allowable expense. No depreciation schedule needed.",
    category: "expenses",
  },
  {
    id: "exp-software-subs",
    title: "💡 App + software subscriptions count too",
    body:
      "MileClear Pro, Google Maps Premium, a cloud-storage plan for your receipts — every monthly business subscription is deductible.",
    category: "expenses",
  },
  {
    id: "exp-ppe",
    title: "💡 PPE + driver kit is allowable",
    body:
      "Helmets, hi-vis vests, panniers, thermal gear, gloves — anything specifically for the work counts. Even a winter jacket if it's only worn for delivery shifts.",
    category: "expenses",
  },
  {
    id: "exp-stationery",
    title: "💡 Don't forget stationery + admin costs",
    body:
      "Printer ink for invoices, A4 paper, envelopes, stamps to send things to HMRC — small but they add up. Worth £20-£50 over a year for most drivers.",
    category: "expenses",
  },
  {
    id: "exp-roadside-assistance",
    title: "💡 RAC, AA, Green Flag — business portion is deductible",
    body:
      "If you'd lose work without your vehicle, your breakdown cover is at least partly a business expense. Most drivers claim a high percentage.",
    category: "expenses",
  },
  {
    id: "exp-marketing",
    title: "💡 Marketing + advertising is allowable",
    body:
      "Vehicle signage, business cards for repeat customers, Facebook ads if you take private hire — all deductible. Even a website domain if you run one.",
    category: "expenses",
  },
  {
    id: "exp-bank-charges",
    title: "💡 Business bank fees? Deductible",
    body:
      "If you have a separate business account, the monthly fee is fully claimable. Transaction fees on platform-payout deposits too.",
    category: "expenses",
  },
  {
    id: "exp-home-office",
    title: "💡 Working from home flat rate: £6/week",
    body:
      "Use part of home for admin (logging shifts, doing your books, customer comms)? HMRC's simplified flat rate is £6/week × number of weeks worked. £312/year for full-timers.",
    category: "expenses",
  },
  {
    id: "exp-courses",
    title: "💡 Training that's relevant to your work is deductible",
    body:
      "First aid courses, advanced driving qualifications, food-hygiene certificates for delivery — all allowable. New skills that change your career aren't.",
    category: "expenses",
  },

  // ── Deadlines ─────────────────────────────────────────────────────
  {
    id: "deadline-sa-jan31",
    title: "🚨 31 January Self Assessment deadline",
    body:
      "Online tax returns for the previous tax year (e.g. 2024-25 income) are due 31 January 2026. Late filing = £100 minimum, escalating fast. MileClear's Self Assessment wizard preps your numbers in minutes.",
    category: "deadlines",
    season: { fromMonth: 12, fromDay: 1, toMonth: 1, toDay: 31 },
  },
  {
    id: "deadline-paper-sa-oct31",
    title: "📅 31 October — paper SA deadline",
    body:
      "Paper Self Assessment returns are due by 31 October. Filing online buys you 3 more months (until 31 January). Almost no driver should still be on paper.",
    category: "deadlines",
    season: { fromMonth: 10, fromDay: 1, toMonth: 10, toDay: 31 },
  },
  {
    id: "deadline-tax-year-end",
    title: "📅 5 April is the UK tax year end",
    body:
      "The UK tax year runs 6 April to 5 April. Anything earned by 23:59 on 5 April goes in this year's return. Time to firm up your records before the year shuts.",
    category: "deadlines",
    season: { fromMonth: 3, fromDay: 25, toMonth: 4, toDay: 10 },
  },
  {
    id: "deadline-new-tax-year",
    title: "🆕 New tax year started 6 April",
    body:
      "Fresh tax year, fresh £12,570 personal allowance, fresh 10,000-mile AMAP threshold. Use the new year well — every business mile from today is at 45p (cars/vans) up to 10k.",
    category: "deadlines",
    season: { fromMonth: 4, fromDay: 6, toMonth: 4, toDay: 30 },
  },
  {
    id: "deadline-jul31-payment",
    title: "🚨 31 July — second payment on account",
    body:
      "If your last tax bill was over £1,000 you owe a second payment on account by 31 July. Catches a lot of drivers out. Check your HMRC account now.",
    category: "deadlines",
    season: { fromMonth: 7, fromDay: 1, toMonth: 7, toDay: 31 },
  },
  {
    id: "deadline-register-oct5",
    title: "📋 5 October — register for Self Assessment",
    body:
      "Started self-employed work in the current tax year? Register with HMRC by 5 October of the following tax year. Miss it and you're looking at penalties before you've even filed.",
    category: "deadlines",
    season: { fromMonth: 9, fromDay: 15, toMonth: 10, toDay: 5 },
  },
  {
    id: "deadline-mtd-itsa",
    title: "📅 MTD ITSA is coming — April 2026",
    body:
      "From April 2026, sole traders with income over £50k must file quarterly digital updates to HMRC. Over £30k from April 2027. MileClear's the UK's first driver-first MTD-ready tracker.",
    category: "deadlines",
  },

  // ── Self Assessment walkthroughs ──────────────────────────────────
  {
    id: "sa-utr",
    title: "🆔 What's a UTR?",
    body:
      "Your Unique Tax Reference is a 10-digit number HMRC issues when you register. You'll need it for every tax return you ever file. Register at gov.uk if you don't have one — takes a couple of weeks to arrive in the post.",
    category: "self-assessment",
  },
  {
    id: "sa-id-verify",
    title: "🔐 Verify your identity for HMRC online",
    body:
      "First-time filing online? You'll need your passport or driving licence + a payslip OR P60 OR Self Assessment account to verify identity at gov.uk/personal-tax-account. Skip the Government Gateway dance if you can — Verify is faster.",
    category: "self-assessment",
  },
  {
    id: "sa-box-9",
    title: "📝 SA box 9 — your total turnover",
    body:
      "Box 9 on the SA103 is your gross self-employed income — everything earned BEFORE expenses or deductions. Fares + tips + bonuses + delivery fees. MileClear's earnings total goes here.",
    category: "self-assessment",
  },
  {
    id: "sa-capital-allowances",
    title: "🚗 Capital allowances vs simplified expenses",
    body:
      "Once you pick simplified expenses (the 45p/25p AMAP rate) for a vehicle, you can't switch to capital allowances on the same one. Make the decision once, stick with it.",
    category: "self-assessment",
  },
  {
    id: "sa-amap-vs-actual",
    title: "🚗 AMAP rates vs actual costs — which?",
    body:
      "Cars + vans: 45p per mile (first 10k), 25p after. For most drivers covering 8-15k business miles this is more generous than tracking actual fuel/wear/insurance. Switch only if you have an expensive vehicle and low mileage.",
    category: "self-assessment",
  },
  {
    id: "sa-payment-on-account",
    title: "💸 Payment on account explained",
    body:
      "Owe HMRC over £1,000? You'll owe two prepayments toward NEXT year's bill, due 31 Jan + 31 Jul. Each is 50% of this year's total. Catches new self-employed drivers by surprise — set the cash aside.",
    category: "self-assessment",
  },
  {
    id: "sa-late-penalty",
    title: "🚨 SA late-filing penalties — they escalate",
    body:
      "£100 fixed if 1 day late, even if you owe nothing. £10/day after 3 months (£900 max). £300 OR 5% of tax owed at 6 months, and again at 12 months. File a placeholder return rather than miss the date.",
    category: "self-assessment",
  },
  {
    id: "sa-amend-return",
    title: "✏️ You can amend a Self Assessment return",
    body:
      "Made a mistake? You have until 12 months AFTER the 31 January filing deadline to amend a return. Log in to your HMRC online account → tap the return → \"Amend a tax return\". Refunds usually arrive in 2-4 weeks.",
    category: "self-assessment",
  },
  {
    id: "sa-class-2-4-ni",
    title: "💷 Class 2 + Class 4 NI on your SA",
    body:
      "Self-employed = two NI lines on your bill. Class 2 (~£3.45/week) is voluntary if profit < £6,725 but you should still pay to build state pension. Class 4 (6% above £12,570) gets calculated automatically.",
    category: "self-assessment",
  },
  {
    id: "sa-records-6-years",
    title: "📦 Keep records for 6 years",
    body:
      "HMRC can investigate a SA return for up to 6 years after filing (longer for fraud). Keep receipts, bank statements, invoices, mileage logs, platform earnings exports. Cloud backup beats a shoebox.",
    category: "self-assessment",
  },

  // ── Did you know ──────────────────────────────────────────────────
  {
    id: "dyk-amap-covers-everything",
    title: "💡 AMAP covers EVERYTHING vehicle-related",
    body:
      "When you claim 45p/mile, that includes fuel + insurance + servicing + tyres + depreciation + MOT. You can't claim those separately on top. Parking + tolls though — those are extra.",
    category: "did-you-know",
  },
  {
    id: "dyk-home-to-first-stop",
    title: "💡 Home → first stop can be business",
    body:
      "If you don't have a regular workplace (like most gig drivers), the trip from home to the first job is usually business mileage. Different from PAYE employees who can't claim their commute.",
    category: "did-you-know",
  },
  {
    id: "dyk-parking-fines",
    title: "🚫 Parking tickets aren't deductible",
    body:
      "HMRC won't let you claim Penalty Charge Notices, speeding fines, or red-route tickets — even if you got them during a job. The legal logic: HMRC won't reward law-breaking.",
    category: "did-you-know",
  },
  {
    id: "dyk-personal-allowance",
    title: "💡 First £12,570 is tax-free",
    body:
      "The Personal Allowance shelters the first £12,570 of profit. Above that you're paying 20% basic, then 40% above £50,270. Knowing the bands lets you decide whether to push for that extra weekend shift.",
    category: "did-you-know",
  },
  {
    id: "dyk-trading-allowance",
    title: "💡 First £1,000 of self-employed income is tax-free",
    body:
      "The Trading Allowance lets you earn £1,000 of self-employed income before needing to register or file. Great for side hustles. Stops being useful when you go full-time — you can't combine it with expense claims.",
    category: "did-you-know",
  },
  {
    id: "dyk-marriage-allowance",
    title: "💍 Marriage Allowance — transfer £1,260",
    body:
      "Married or in a civil partnership? The lower-earning partner can transfer £1,260 of unused Personal Allowance to the higher earner. Saves up to £252/year. Apply once at gov.uk/marriage-allowance.",
    category: "did-you-know",
  },
  {
    id: "dyk-pension-tax-relief",
    title: "💰 Pension contributions cut your tax bill",
    body:
      "Pay into a SIPP or stakeholder pension and HMRC tops up 20% (basic rate) directly. Higher-rate taxpayers can claim another 20% via SA. £80 in = £100 in your pension.",
    category: "did-you-know",
  },
  {
    id: "dyk-class2-voluntary",
    title: "💡 Class 2 NI is voluntary below £6,725 profit",
    body:
      "If you earn less than the Small Profits Threshold, Class 2 NI is voluntary. Pay anyway: it's £180/year and counts toward state pension + maternity allowance. Big bang for tiny buck.",
    category: "did-you-know",
  },
  {
    id: "dyk-paye-refund",
    title: "💷 Wrong PAYE tax code? Claim a refund",
    body:
      "If a PAYE job had the wrong tax code, you can claim back overpaid tax for up to 4 years. Drivers who do mixed PAYE + self-employed often have this. Worth checking your tax codes on the HMRC app annually.",
    category: "did-you-know",
  },
  {
    id: "dyk-side-income",
    title: "🛍️ Side income still counts",
    body:
      "Selling on eBay, Vinted, OnlyFans, Etsy? If it's regular trading (not just clearing your loft), HMRC treats it as self-employment income. Combine it with your driving income on the same SA return.",
    category: "did-you-know",
  },
  {
    id: "dyk-cash-vs-accruals",
    title: "💡 Cash basis vs accruals — choose your basis",
    body:
      "Cash basis (default since 2024) means income counts when paid, expenses when paid. Accruals counts when invoiced. Most drivers should stick with cash basis — invoices that go unpaid don't show as taxable income.",
    category: "did-you-know",
  },
  {
    id: "dyk-vat-threshold",
    title: "💡 VAT registration kicks in at £90,000 turnover",
    body:
      "Cross £90k in any rolling 12-month period (not tax year) and you MUST register for VAT. Most gig drivers won't, but private hire and full-time couriers can. MileClear shows you your live YTD figures.",
    category: "did-you-know",
  },
  {
    id: "dyk-state-pension-top-up",
    title: "💡 Top up missing NIC years",
    body:
      "Need a full state pension? You need ~35 qualifying years of NI. Self-employed years can have gaps. Pay voluntary Class 2 NI to fill them — cheap, especially for years before 2025.",
    category: "did-you-know",
  },
  {
    id: "dyk-no-late-discount",
    title: "🚫 HMRC doesn't do discounts",
    body:
      "Unlike commercial debts, HMRC won't negotiate down your tax bill. They will agree a Time to Pay arrangement (instalments over 12 months) if you ask early. Don't wait until after the deadline.",
    category: "did-you-know",
  },
  {
    id: "dyk-mileage-records",
    title: "💡 Why HMRC wants per-trip mileage records",
    body:
      "HMRC requires you to be able to back up every mileage claim. A 12,000-mile entry on your SA needs a log showing the trips — date, route, purpose. MileClear keeps this automatically.",
    category: "did-you-know",
  },

  // ── Common mistakes ───────────────────────────────────────────────
  {
    id: "mistake-missed-expenses",
    title: "⚠️ The most common mistake: under-claiming expenses",
    body:
      "Drivers routinely forget parking, phone bills, accountancy fees, breakdown cover. Five missed £20/month expenses = £1,200/year of tax-free profit you're paying tax on. Track every receipt.",
    category: "mistakes",
  },
  {
    id: "mistake-amap-vs-actual",
    title: "⚠️ Switching AMAP ↔ actual costs is a one-way door",
    body:
      "Once you've picked AMAP rates for a vehicle, you can't switch to claiming actual costs (or capital allowances) for that vehicle. Decide once, document the decision, stick to it.",
    category: "mistakes",
  },
  {
    id: "mistake-no-receipts",
    title: "⚠️ \"I didn't keep receipts\" doesn't fly with HMRC",
    body:
      "If they investigate, you need proof of every expense claim. Bank statements alone often aren't enough. Take a photo of every receipt the moment it lands. Cloud-backup'd photos are HMRC-acceptable.",
    category: "mistakes",
  },
  {
    id: "mistake-personal-mix",
    title: "⚠️ Mixing personal + business spending",
    body:
      "If your bank statements show personal Tesco shopping next to business fuel and there's no separation, HMRC will question every expense. Open a separate account (even just a free Starling or Monzo) and use it ONLY for business.",
    category: "mistakes",
  },
  {
    id: "mistake-forgetting-payment-on-account",
    title: "⚠️ Forgetting that 31 July payment",
    body:
      "First-year drivers get the £1,000+ threshold wrong all the time. Your January bill is THIS year's tax PLUS next year's first POA — usually 1.5× what you expected. Set aside enough for both.",
    category: "mistakes",
  },
  {
    id: "mistake-late-registration",
    title: "⚠️ Late-registering for Self Assessment",
    body:
      "Started self-employed work in 2024-25? You must register by 5 October 2025. Miss it and the penalty is 100% of the tax owed (capped). Set a calendar reminder when you start any new income stream.",
    category: "mistakes",
  },
  {
    id: "mistake-undeclared-side-income",
    title: "⚠️ Not declaring side gigs",
    body:
      "HMRC sees data from Uber, Deliveroo, Just Eat, Etsy, eBay, Airbnb — the platforms share it under the OECD's MRD reporting rules. Hiding income from any of them is high-risk. Declare everything.",
    category: "mistakes",
  },
  {
    id: "mistake-no-class-4-aside",
    title: "⚠️ Forgetting Class 4 NI in your set-aside",
    body:
      "Income tax + Class 2 + Class 4 NI add up to roughly 28% of profit at basic rate, not 20%. Setting aside 20% of profit isn't enough. MileClear's Tax Readiness card includes ALL three.",
    category: "mistakes",
  },
  {
    id: "mistake-trying-to-diy",
    title: "⚠️ DIYing past a certain scale",
    body:
      "Once you're earning £30k+ self-employed, an accountant usually saves more than they cost. Capital allowances, VAT analysis, pension planning, payment-on-account smoothing — they'll catch things you didn't know existed.",
    category: "mistakes",
  },
  {
    id: "mistake-no-pension",
    title: "⚠️ No pension contributions",
    body:
      "Self-employed drivers have no auto-enrolment safety net. Every pound into a SIPP gets a 20% government top-up (40% for higher-rate earners) AND reduces taxable profit. The most tax-efficient saving HMRC offers.",
    category: "mistakes",
  },

  // ── MileClear-specific ────────────────────────────────────────────
  {
    id: "mc-classify-every-trip",
    title: "🛞 Classify every trip Business or Personal",
    body:
      "Unclassified trips don't count for tax. Open the trips screen, sweep through the Unclassified filter, tag them. Even an unclassified £40 trip is £18 of unclaimed deduction.",
    category: "mileclear",
  },
  {
    id: "mc-saved-locations",
    title: "🏠 Saved locations = auto-classify",
    body:
      "Pin your Home, Work, and Depot in Settings → Tracking & Locations. MileClear classifies trips between them automatically — no more manual tagging.",
    category: "mileclear",
  },
  {
    id: "mc-tax-readiness-card",
    title: "📊 The Tax Readiness card is your weekly compass",
    body:
      "Top of the dashboard: estimated tax + NI YTD, this week's set-aside amount, and your filing-deadline countdown. Check it every Friday so January isn't a surprise.",
    category: "mileclear",
  },
  {
    id: "mc-platform-tags",
    title: "🏷️ Platform tags help filter for tax",
    body:
      "Tag each business trip by platform (Uber, Deliveroo, Just Eat, etc.). The Self Assessment wizard rolls these into the SA103 boxes, and you can filter your trip list by platform any time.",
    category: "mileclear",
  },
  {
    id: "mc-first-sa-guide",
    title: "📖 First Self Assessment? We've got you",
    body:
      "Tap the dashboard → \"First Self Assessment? Read the guide\". Plain-English walkthrough of UTR, tax year, deadlines, and what HMRC won't bother explaining. Free for everyone.",
    category: "mileclear",
  },
  {
    id: "mc-open-banking",
    title: "🏦 Auto-import earnings via Open Banking",
    body:
      "Connect your business bank in Settings → Earnings → Open Banking. MileClear auto-imports your gig payments — no manual entry, no CSV juggling. Pro feature.",
    category: "mileclear",
  },
  {
    id: "mc-csv-import",
    title: "📥 CSV import from Uber, Deliveroo, Just Eat",
    body:
      "Download your platform earnings CSV and drop it into MileClear → Earnings → Import CSV. The app auto-detects platform, dates, amounts. Saves an hour per platform per month.",
    category: "mileclear",
  },
  {
    id: "mc-pro-features",
    title: "💎 What Pro unlocks (£4.99/month)",
    body:
      "HMRC submissions, accountant sharing, Open Banking auto-import, deeper business insights, auto-classify rules, weekly P&L. £44.99/year saves 25%.",
    category: "mileclear",
  },
];

// ── Selection ─────────────────────────────────────────────────────

/**
 * Pick today's tip from the bank. Filters out:
 *   - Tips outside their seasonal window
 *   - Tips already posted in the last `dedupDays` (default 30)
 *
 * Returns null if there's somehow nothing eligible (only happens if
 * every tip was posted recently — would need the bank to shrink below
 * 30 tips).
 */
export function selectTodaysTip(args: {
  recentlyPostedIds: string[];
  now?: Date;
  dedupDays?: number;
}): TaxTip | null {
  const now = args.now ?? new Date();
  const recent = new Set(args.recentlyPostedIds);
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();

  const eligible = TAX_TIPS.filter((tip) => {
    if (recent.has(tip.id)) return false;
    if (!tip.season) return true;
    return isInSeason(tip.season, month, day);
  });

  if (eligible.length === 0) {
    // Fall back to seasonless tips, ignoring recent dedup — better
    // to repeat than to skip a day entirely.
    const seasonless = TAX_TIPS.filter((t) => !t.season);
    if (seasonless.length === 0) return null;
    return seasonless[Math.floor(Math.random() * seasonless.length)];
  }

  return eligible[Math.floor(Math.random() * eligible.length)];
}

/**
 * Inclusive season check that handles year-wrap (e.g. fromMonth=12,
 * toMonth=1).
 */
function isInSeason(
  season: NonNullable<TaxTip["season"]>,
  month: number,
  day: number
): boolean {
  const cur = month * 100 + day;
  const from = season.fromMonth * 100 + season.fromDay;
  const to = season.toMonth * 100 + season.toDay;
  if (from <= to) {
    return cur >= from && cur <= to;
  }
  // Wraps year-end (Dec → Jan)
  return cur >= from || cur <= to;
}
