// "Can I claim this?" lookup for UK self-employed drivers.
//
// 80 curated entries covering the questions drivers actually search
// for. Each entry has aliases so /expense "parking ticket" reliably
// hits "Parking ticket / PCN" rather than "Parking".
//
// Returns deductible status + plain-English explanation. Always closes
// with "general guidance only" because real-world allowability hinges
// on the specifics of YOUR business — we tell people that on every
// reply, not just in the long list of edge cases.
//
// Phase 1C alt — replaces the originally-proposed Claude-backed
// /ask command with a zero-API-cost lookup (21 May 2026).

export type ExpenseStatus = "yes" | "partial" | "no" | "depends";

export type ExpenseCategory =
  | "vehicle"
  | "running-costs"
  | "equipment"
  | "professional"
  | "home"
  | "fines"
  | "personal"
  | "other";

export interface ExpenseEntry {
  /** Stable internal slug — referenced from tests + analytics. */
  id: string;
  /** Display name in the Discord reply. */
  name: string;
  /** Lowercase strings that should match this entry. The user's query
   *  is normalised the same way before comparison. */
  aliases: string[];
  status: ExpenseStatus;
  category: ExpenseCategory;
  /** 1-3 sentence explanation. Punchy — Discord embeds get truncated
   *  in mobile sidebars. */
  explanation: string;
  /** Optional "see also" note — used for partial deductions to point
   *  at the calculation method. */
  note?: string;
}

const BANK: ExpenseEntry[] = [
  // ── Vehicle running ──────────────────────────────────────────────
  {
    id: "fuel",
    name: "Fuel",
    aliases: ["fuel", "petrol", "diesel", "tank of fuel"],
    status: "depends",
    category: "running-costs",
    explanation:
      "Depends on your chosen method. If you claim AMAP rates (45p/25p per mile), fuel is ALREADY in that figure — you can't claim it separately. If you claim actual vehicle costs, you split fuel by business-use percentage.",
    note: "Most drivers stick with AMAP because it's higher per mile than actual costs.",
  },
  {
    id: "parking",
    name: "Parking (paid)",
    aliases: ["parking", "car park", "carpark", "pay and display", "ncp"],
    status: "yes",
    category: "vehicle",
    explanation:
      "Every paid parking session during a business trip is fully allowable. Photo of the ticket is enough — keep it for 6 years.",
  },
  {
    id: "toll",
    name: "Tolls",
    aliases: ["toll", "tolls", "toll road", "dartford", "humber bridge", "mersey"],
    status: "yes",
    category: "vehicle",
    explanation:
      "Tolls on business trips are fully deductible, on top of any mileage allowance. Same for the Dartford Crossing, Mersey Gateway, Humber Bridge.",
  },
  {
    id: "congestion-charge",
    name: "Congestion Charge / ULEZ",
    aliases: ["congestion", "congestion charge", "ulez", "clean air zone", "caz", "lez"],
    status: "yes",
    category: "vehicle",
    explanation:
      "London Congestion Charge, ULEZ, and other Clean Air Zone charges are fully deductible when incurred on business trips.",
  },
  {
    id: "parking-ticket",
    name: "Parking ticket / PCN",
    aliases: ["parking ticket", "pcn", "penalty charge notice", "fine", "parking fine"],
    status: "no",
    category: "fines",
    explanation:
      "HMRC won't let you claim Penalty Charge Notices, even if you got one while doing a job. The logic: tax relief shouldn't subsidise law-breaking.",
  },
  {
    id: "speeding-fine",
    name: "Speeding fine",
    aliases: ["speeding", "speeding fine", "speeding ticket", "fpn"],
    status: "no",
    category: "fines",
    explanation:
      "Not deductible. Same logic as parking tickets — HMRC won't subsidise traffic offences.",
  },
  {
    id: "insurance",
    name: "Vehicle insurance (business-use portion)",
    aliases: ["insurance", "car insurance", "hire and reward", "h&r", "taxi insurance"],
    status: "partial",
    category: "vehicle",
    explanation:
      "If you use the AMAP rate (45p/mi), it already includes insurance — no separate claim. If you claim actual costs, the business-use portion of the premium is deductible.",
    note: "The premium increase from adding hire-and-reward to a personal policy is 100% deductible if you separate the figures.",
  },
  {
    id: "mot",
    name: "MOT",
    aliases: ["mot", "mot test"],
    status: "depends",
    category: "vehicle",
    explanation:
      "Covered by the 45p/mile AMAP if you're using simplified expenses. If you're claiming actual costs, the business-use portion is deductible.",
  },
  {
    id: "servicing",
    name: "Servicing + repairs",
    aliases: ["servicing", "service", "repair", "repairs", "garage", "mechanic"],
    status: "depends",
    category: "vehicle",
    explanation:
      "Covered by AMAP if you're on simplified expenses. Otherwise, business-use percentage of the bill is deductible.",
  },
  {
    id: "tyres",
    name: "Tyres",
    aliases: ["tyre", "tyres", "tire", "tires", "puncture"],
    status: "depends",
    category: "vehicle",
    explanation:
      "Inside AMAP if you claim 45p/mi. Otherwise business-use proportion is deductible.",
  },
  {
    id: "breakdown-cover",
    name: "Breakdown cover (AA, RAC, Green Flag)",
    aliases: ["breakdown", "rac", "aa", "green flag", "roadside assistance"],
    status: "partial",
    category: "vehicle",
    explanation:
      "Business-use percentage is deductible. If your livelihood depends on the vehicle running, most drivers claim 70-100%.",
  },
  {
    id: "vehicle-purchase",
    name: "Vehicle purchase",
    aliases: ["new car", "used car", "vehicle purchase", "buy a car", "buying a van"],
    status: "depends",
    category: "vehicle",
    explanation:
      "If you claim AMAP, NO — the per-mile rate covers depreciation. If you claim actual costs, you use Capital Allowances (typically 18% of cost per year on the writing-down pool). Big decision — pick once, stick with it.",
    note: "First-Year Allowance of 100% applies for new zero-emission cars — full purchase price deductible in year one.",
  },
  {
    id: "vehicle-lease",
    name: "Vehicle lease / PCP",
    aliases: ["lease", "pcp", "lease payments", "monthly payments"],
    status: "depends",
    category: "vehicle",
    explanation:
      "Inside AMAP if you claim 45p/mi. If you claim actual costs, the business-use percentage of monthly lease payments is deductible (with a 15% disallowance if CO2 emissions exceed 50g/km for cars first leased after Apr 2021).",
  },
  {
    id: "adblue",
    name: "AdBlue / engine oil / wiper fluid",
    aliases: ["adblue", "ad blue", "oil", "engine oil", "wiper fluid", "screenwash"],
    status: "depends",
    category: "running-costs",
    explanation:
      "Inside AMAP if you claim 45p/mi. If you claim actual costs, business-use proportion is deductible.",
  },
  {
    id: "car-wash",
    name: "Car wash / valeting",
    aliases: ["car wash", "carwash", "valet", "valeting", "car cleaning"],
    status: "depends",
    category: "vehicle",
    explanation:
      "If you wash for customers (rideshare standards, food-delivery hygiene), yes — fully deductible. Routine personal washes aren't, even if you sometimes use the car for work.",
  },

  // ── Equipment + tech ─────────────────────────────────────────────
  {
    id: "phone-bill",
    name: "Phone bill",
    aliases: ["phone bill", "mobile bill", "mobile contract", "phone contract"],
    status: "partial",
    category: "equipment",
    explanation:
      "Claim the business-use percentage of your monthly bill. Most drivers claim 50-70%. Be honest — HMRC challenges 100% claims unless you have a separate work phone.",
  },
  {
    id: "phone-device",
    name: "Phone (the device itself)",
    aliases: ["phone", "iphone", "smartphone", "new phone", "buying a phone"],
    status: "partial",
    category: "equipment",
    explanation:
      "Business-use percentage of the purchase price is deductible. Under £200 just claim it as an expense; over that goes through Annual Investment Allowance.",
  },
  {
    id: "phone-mount",
    name: "Phone mount / holder",
    aliases: ["phone mount", "phone holder", "car mount", "dashboard mount"],
    status: "yes",
    category: "equipment",
    explanation:
      "Fully deductible — small business equipment. Same applies to USB chargers, cables, dashboard pads.",
  },
  {
    id: "dashcam",
    name: "Dashcam",
    aliases: ["dashcam", "dash cam", "dashboard camera"],
    status: "yes",
    category: "equipment",
    explanation:
      "Fully deductible if you bought it primarily for business reasons (insurance, dispute evidence). Cloud-storage plans too.",
  },
  {
    id: "satnav",
    name: "Sat nav / GPS",
    aliases: ["sat nav", "satnav", "gps", "tomtom", "garmin"],
    status: "yes",
    category: "equipment",
    explanation:
      "Fully deductible as a business tool. Google Maps Premium subscription too.",
  },
  {
    id: "delivery-bag",
    name: "Delivery bag / thermal bag",
    aliases: ["bag", "delivery bag", "thermal bag", "pizza bag", "uber bag"],
    status: "yes",
    category: "equipment",
    explanation:
      "Fully deductible — purpose-bought for the work. Same for backpacks if they're only used for deliveries.",
  },
  {
    id: "helmet",
    name: "Helmet / motorbike gear",
    aliases: ["helmet", "motorbike gear", "leathers", "bike gear", "moped helmet"],
    status: "yes",
    category: "equipment",
    explanation:
      "Fully deductible if you only use it for work. Personal recreational use complicates things — keep them separate if you can.",
  },
  {
    id: "ppe",
    name: "PPE / hi-vis / safety gear",
    aliases: ["ppe", "hi vis", "hi-vis", "safety vest", "gloves", "boots"],
    status: "yes",
    category: "equipment",
    explanation:
      "Fully deductible. PPE specifically for the work doesn't have the personal-clothing problem HMRC normally raises.",
  },
  {
    id: "clothing",
    name: "Regular clothing",
    aliases: ["clothes", "clothing", "shoes", "trainers", "shirt", "jacket"],
    status: "no",
    category: "personal",
    explanation:
      "HMRC's view: everyday clothing is your normal wardrobe even if you wear it for work. Only uniforms (with logo) or genuine protective gear are deductible.",
  },
  {
    id: "branded-uniform",
    name: "Branded uniform / company-logo clothing",
    aliases: ["uniform", "branded", "logo", "company shirt"],
    status: "yes",
    category: "equipment",
    explanation:
      "Fully deductible if it carries a permanent logo or branding — including the cost of having a logo added to plain clothing.",
  },

  // ── Professional services ────────────────────────────────────────
  {
    id: "accountant",
    name: "Accountant fees",
    aliases: ["accountant", "accountancy", "tax preparer", "tax advisor", "bookkeeper"],
    status: "yes",
    category: "professional",
    explanation:
      "100% deductible — whatever you pay an accountant for SA prep, bookkeeping, VAT, or general advice goes on your return as an expense.",
  },
  {
    id: "training",
    name: "Training course (relevant to your work)",
    aliases: ["training", "course", "training course"],
    status: "depends",
    category: "professional",
    explanation:
      "Relevant to maintaining your current work: yes (e.g. advanced driving, first aid, food-hygiene refresh). Brand-new career skills: no (e.g. a Saturday-evening Java course for the developer pivot).",
  },
  {
    id: "dbs-check",
    name: "DBS check",
    aliases: ["dbs", "dbs check", "criminal records check"],
    status: "yes",
    category: "professional",
    explanation:
      "Deductible — required to do your work (especially school runs, NHS contracts, or rideshare driver status checks).",
  },
  {
    id: "pco-licence",
    name: "PCO / private hire licence",
    aliases: ["pco", "pco licence", "private hire", "phv licence", "taxi licence"],
    status: "yes",
    category: "professional",
    explanation:
      "Fully deductible. So's the medical, the topographical test, and renewal fees.",
  },
  {
    id: "subscriptions",
    name: "Trade subscriptions",
    aliases: ["subscription", "membership", "trade body", "professional body"],
    status: "yes",
    category: "professional",
    explanation:
      "Professional body memberships listed on HMRC's approved list are deductible. Industry magazines / unions too.",
  },
  {
    id: "marketing",
    name: "Marketing + advertising",
    aliases: ["marketing", "advertising", "ads", "facebook ads", "google ads"],
    status: "yes",
    category: "professional",
    explanation:
      "Fully deductible — anything you spend to attract or retain customers. Business cards, signage, social ads, leaflets.",
  },
  {
    id: "website",
    name: "Website / domain",
    aliases: ["website", "domain", "hosting", "web hosting"],
    status: "yes",
    category: "professional",
    explanation:
      "Domain registration, hosting fees, web designer fees — all fully deductible.",
  },

  // ── Home + admin ─────────────────────────────────────────────────
  {
    id: "home-office",
    name: "Working from home (admin space)",
    aliases: ["home office", "working from home", "wfh", "home admin"],
    status: "yes",
    category: "home",
    explanation:
      "HMRC's simplified flat rate is £6/week × weeks worked. Or use the proper apportionment method if your home has dedicated work space — usually more generous but more paperwork.",
  },
  {
    id: "internet",
    name: "Home internet",
    aliases: ["internet", "broadband", "wifi"],
    status: "partial",
    category: "home",
    explanation:
      "Business-use percentage of your broadband bill. Most drivers claim 20-50% — the time you spend processing orders, reading emails, doing books.",
  },
  {
    id: "stationery",
    name: "Stationery + printer ink",
    aliases: ["stationery", "paper", "printer ink", "ink", "envelopes", "stamps"],
    status: "yes",
    category: "home",
    explanation:
      "Fully deductible — small business essentials. Stamps too if you send anything to HMRC, customers, or suppliers.",
  },
  {
    id: "bank-charges",
    name: "Business bank fees",
    aliases: ["bank charges", "bank fees", "business account"],
    status: "yes",
    category: "home",
    explanation:
      "Fully deductible if it's a business account — monthly fees, transaction fees, overdraft interest.",
  },
  {
    id: "software-subs",
    name: "Software / app subscriptions",
    aliases: ["software", "app", "subscription", "mileclear", "mileclear pro", "saas"],
    status: "yes",
    category: "home",
    explanation:
      "Fully deductible — MileClear Pro, Google Maps Premium, accounting software, cloud storage, any business tool. Make sure it's business-related though, not your personal Spotify.",
  },

  // ── Personal / no ────────────────────────────────────────────────
  {
    id: "coffee",
    name: "Coffee / food on the road",
    aliases: ["coffee", "lunch", "food", "meal", "sandwich", "subsistence"],
    status: "depends",
    category: "personal",
    explanation:
      "Generally NO — eating is something you'd do anyway. EXCEPTION: subsistence on a genuine business trip (overnight, away from your normal area) IS deductible. Day-to-day driving lunches aren't.",
  },
  {
    id: "gym",
    name: "Gym membership",
    aliases: ["gym", "gym membership", "fitness"],
    status: "no",
    category: "personal",
    explanation:
      "HMRC's view: personal health and fitness, even if it helps you do your work. Not deductible.",
  },
  {
    id: "haircut",
    name: "Haircut / grooming",
    aliases: ["haircut", "grooming", "barber"],
    status: "no",
    category: "personal",
    explanation:
      "Personal expense, even if appearance matters for customer-facing work. Not deductible.",
  },
  {
    id: "hotel",
    name: "Hotel / overnight stay",
    aliases: ["hotel", "b&b", "overnight", "travelodge", "premier inn"],
    status: "yes",
    category: "professional",
    explanation:
      "Fully deductible if it's a genuine business trip away from your normal area — e.g. a courier doing a London-Manchester overnight. Routine local nights out aren't.",
  },
  {
    id: "public-transport",
    name: "Public transport (for work)",
    aliases: ["train", "bus", "tube", "public transport", "tfl"],
    status: "yes",
    category: "professional",
    explanation:
      "Fully deductible if you're travelling for work — e.g. to pick up a vehicle, attend a customer meeting, or get to a depot when yours is broken.",
  },

  // ── Equipment continued ──────────────────────────────────────────
  {
    id: "tools",
    name: "Tools",
    aliases: ["tools", "spanner", "jack", "tyre iron"],
    status: "yes",
    category: "equipment",
    explanation:
      "Fully deductible — anything you carry to keep yourself on the road. First aid kits, jump leads, tyre repair kits.",
  },
  {
    id: "first-aid-kit",
    name: "First aid kit",
    aliases: ["first aid", "first aid kit", "medical kit"],
    status: "yes",
    category: "equipment",
    explanation:
      "Fully deductible — required for some platforms, sensible for all.",
  },
  {
    id: "cleaning-supplies",
    name: "Vehicle cleaning supplies",
    aliases: ["cleaning supplies", "shampoo", "polish", "wipes", "cleaning kit"],
    status: "yes",
    category: "equipment",
    explanation:
      "Fully deductible when used for business-related cleaning. Personal use is excluded — be honest about the split.",
  },

  // ── Edge cases ───────────────────────────────────────────────────
  {
    id: "pension",
    name: "Pension contributions",
    aliases: ["pension", "sipp", "stakeholder", "private pension"],
    status: "depends",
    category: "other",
    explanation:
      "Not a business expense, but a HUGE tax-saver: contributions get a 20% government top-up, AND higher-rate taxpayers can claim another 20% via SA. £80 in = £100 in the pension. Reduces taxable profit too.",
  },
  {
    id: "charity",
    name: "Charitable donations",
    aliases: ["charity", "donation", "gift aid"],
    status: "no",
    category: "other",
    explanation:
      "Not a business expense, but worth claiming via Gift Aid + the higher-rate top-up on your SA return.",
  },
  {
    id: "mortgage",
    name: "Mortgage payments",
    aliases: ["mortgage", "mortgage payment", "home loan"],
    status: "no",
    category: "home",
    explanation:
      "Not deductible. Even if you work from home — use the £6/week working-from-home flat rate instead.",
  },
  {
    id: "rent",
    name: "Rent (where you live)",
    aliases: ["rent", "rent payment", "tenancy"],
    status: "no",
    category: "home",
    explanation:
      "Not deductible. Use the £6/week working-from-home flat rate to cover the small portion that's genuinely business use.",
  },
  {
    id: "gifts-customers",
    name: "Gifts to customers",
    aliases: ["gift", "customer gift", "client gift", "christmas hamper"],
    status: "partial",
    category: "professional",
    explanation:
      "Deductible if: under £50/year per recipient, carries permanent business branding, and isn't food/drink/tobacco. Otherwise no.",
  },
];

// ── Lookup ────────────────────────────────────────────────────────

/** Normalise to lowercase + collapsed spaces + no punctuation. Match
 *  on the same form to make "Phone Bill?" and "phone bill" the same
 *  query. */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Look up an expense by user query. Returns the best match (exact
 * alias > prefix > substring), or null if nothing's even close.
 */
export function lookupExpense(query: string): ExpenseEntry | null {
  const q = normalise(query);
  if (!q) return null;

  let bestScore = 0;
  let best: ExpenseEntry | null = null;
  for (const entry of BANK) {
    for (const alias of entry.aliases) {
      const a = normalise(alias);
      let score = 0;
      if (a === q) score = 100; // exact alias
      else if (a.startsWith(q) || q.startsWith(a)) score = 70;
      else if (a.includes(q) || q.includes(a)) score = 40;
      // Bonus: longer matching aliases are more specific (so
      // "parking ticket" beats "parking" for the PCN entry).
      if (score > 0) score += Math.min(a.length, 30) / 3;
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }
  }
  return bestScore >= 25 ? best : null;
}

/**
 * Return the total number of entries — exposed for the /find command
 * and for tests.
 */
export function expenseBankSize(): number {
  return BANK.length;
}
