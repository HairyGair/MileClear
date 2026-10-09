// Copied from the app's first Self Assessment guide (apps/mobile/app/first-tax-return.tsx),
// reworded for the website. Plain text with a few **bold** runs. Links open in a new tab.

export interface GuideLink {
  label: string;
  url: string;
}

export interface GuideSection {
  title: string;
  /** Paragraphs. Text between ** ** is bold. */
  paragraphs: string[];
  bullets?: string[];
  links?: GuideLink[];
}

export const GUIDE_INTRO =
  "A plain-English walkthrough for self-employed drivers filing for the first time. About 5 minutes to read.";

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    title: "Are you actually self-employed?",
    paragraphs: [
      "If you drive for Uber, Deliveroo, Just Eat, Amazon Flex, Stuart, DPD, Evri or similar, and you use your own vehicle, HMRC treats you as self-employed. You are running a small business of one, so you declare your earnings and pay tax on the profit yourself.",
      "The platform does not do this for you, even though platforms now report your earnings to HMRC under the Digital Platform Reporting rules (from January 2024).",
      "**If you have earned more than £1,000 in a tax year from gig work, you must file a Self Assessment.**",
    ],
  },
  {
    title: "Get a UTR (Unique Taxpayer Reference)",
    paragraphs: [
      "Before you can file you need a UTR, a 10-digit number HMRC uses to identify you. You only ever have one.",
      "To get one, register for Self Assessment on GOV.UK. HMRC posts your UTR within 10 working days. **Do this as early in the tax year as you can.** If you wait until October the queue gets long.",
    ],
    links: [{ label: "Register on GOV.UK", url: "https://www.gov.uk/register-for-self-assessment" }],
  },
  {
    title: "The UK tax year",
    paragraphs: [
      "The UK tax year runs from **6 April to 5 April** the following year, not the calendar year. Earnings from 6 April 2025 to 5 April 2026 fall into the tax year \"2025-26\".",
      "MileClear groups your trips and earnings by tax year for you. When you export, the report covers exactly the right dates.",
    ],
  },
  {
    title: "What you will actually pay",
    paragraphs: ["Self-employed drivers pay three things on their profit:"],
    bullets: [
      "Income Tax: 20% basic rate, 40% higher rate. The first £12,570 of income is tax-free.",
      "Class 4 National Insurance: 6% on profit between £12,570 and £50,270, then 2% above.",
      "Class 2 National Insurance: £3.45 a week if your profit is over £12,570. It counts towards your state pension.",
    ],
  },
  {
    title: "The mileage claim (this is the big one)",
    paragraphs: [
      "The Approved Mileage Allowance Payment (AMAP) lets you take a flat rate off your profit for each business mile. The car and van rate went up on 6 April 2026, so use the right one for the year you are filing:",
    ],
    bullets: [
      "Cars and vans, 2025-26: 45p a mile for the first 10,000 miles, then 25p.",
      "Cars and vans, 2026-27 onwards: 55p a mile for the first 10,000 miles, then 25p.",
      "Mopeds and motorbikes: 24p a mile flat, both years.",
    ],
  },
  {
    title: "A worked example",
    paragraphs: [
      "For your 2025-26 return, a driver covering 20,000 business miles in a car claims £7,000 off their profit. At the basic rate that is £1,400 less tax. The same mileage in 2026-27 is worth £8,000 (£1,600 at the basic rate) because of the rise.",
      "**It is the largest single deduction most drivers have.** That is why MileClear records every mile and applies the right rate for each trip date.",
      "This guide is for filing tax year 2025-26 (deadline 31 January 2027), so the worked figures use the 45p rate that applied that year. MileClear applies 55p to any business miles you drive from 6 April 2026.",
    ],
  },
  {
    title: "The 31 January deadline",
    paragraphs: [
      "Your Self Assessment for tax year 2025-26 must be filed and paid by **31 January 2027**. Filing late is an instant £100 penalty, with daily penalties after 3 months.",
      "You can file any time after the tax year ends on 5 April. Filing early gives you time to plan if the bill is bigger than you expected. Most drivers file between November and January.",
      "HMRC may also ask for \"payments on account\" towards the next tax year: usually half of last year's bill on 31 January and another half on 31 July. Plan for those too.",
    ],
    links: [{ label: "Payments on account on GOV.UK", url: "https://www.gov.uk/understand-self-assessment-bill/payments-on-account" }],
  },
  {
    title: "What MileClear gives you",
    paragraphs: [],
    bullets: [
      "An automatic mileage log every time you drive (free).",
      "The right mileage rate for each vehicle and trip date (free).",
      "A live tax estimate that updates as you drive and add earnings (free).",
      "A Self Assessment walkthrough that maps your numbers to the SA103 boxes (free). The PDF is Pro.",
      "A PDF mileage log with a cover sheet (Pro).",
      "Read-only sharing with your accountant from the website (Pro).",
    ],
  },
  {
    title: "Next steps",
    paragraphs: [],
    bullets: [
      "Register for Self Assessment now. Do not wait until December. The UTR posts within 10 working days.",
      "Consider a separate bank account for gig earnings. It is optional, but it makes the year-end maths much easier.",
      "Set aside about 25 to 30% of what you earn for tax and National Insurance. The Tax page shows an amount based on your real numbers.",
      "Track every business mile, including the empty miles between deliveries. Every mile you claim reduces your tax bill.",
    ],
    links: [{ label: "Register on GOV.UK", url: "https://www.gov.uk/register-for-self-assessment" }],
  },
];

export const GUIDE_DISCLAIMER =
  "MileClear is a mileage tracker, not a tax adviser. For complex situations (more than one business, partnerships, capital allowances on a leased van), speak to an accountant.";
