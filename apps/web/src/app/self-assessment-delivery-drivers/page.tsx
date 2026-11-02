import type { Metadata } from "next";
import GuideLayout from "@/components/guides/GuideLayout";

// Facts checked against GOV.UK on 2 Nov 2026:
// - who must file (£1,000 before expenses), register by 5 October:
//   gov.uk/self-assessment-tax-returns/who-must-send-a-tax-return
// - 2025-26 deadlines (paper 31 Oct 2026, online + payment 31 Jan 2027, 31 July):
//   gov.uk/self-assessment-tax-returns/deadlines
// - payments on account: gov.uk/understand-self-assessment-bill/payments-on-account
// - penalties: gov.uk/self-assessment-tax-returns/penalties
// - trading allowance: gov.uk/guidance/tax-free-allowances-on-property-and-trading-income
// - boxes 9, 10.1, 12, 18, 19, 20 and the £90,000 line: SA103S 2026 form and
//   notes (2025-26); box 20 car, van and travel on SA103F 2026 notes.
// - mileage rates: gov.uk/simpler-income-tax-simplified-expenses/vehicles
// - records: gov.uk/self-employed-records/how-long-to-keep-your-records

export const metadata: Metadata = {
  title: "Self Assessment for Delivery Drivers: 2025-26 Tax Return Guide",
  description:
    "Self Assessment for UK delivery drivers for the 2025-26 tax year: the 31 January 2027 deadline, payments on account, the £1,000 trading allowance, which SA103 boxes your mileage goes in, and late filing penalties.",
  alternates: {
    canonical: "https://mileclear.com/self-assessment-delivery-drivers",
  },
  openGraph: {
    title: "Self Assessment for Delivery Drivers: 2025-26 | MileClear",
    description:
      "Deadlines, payments on account, the trading allowance, the SA103 boxes for mileage and costs, and penalties, for UK delivery drivers.",
    url: "https://mileclear.com/self-assessment-delivery-drivers",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Self Assessment for Delivery Drivers: 2025-26 | MileClear",
    description: "The 2025-26 tax return, explained for UK delivery drivers.",
    images: ["/branding/og-image.png"],
  },
};

export default function SelfAssessmentDeliveryDriversPage() {
  return (
    <GuideLayout
      eyebrow="Self Assessment"
      title="Self Assessment for delivery drivers: the 2025-26 tax return"
      standfirst="If you deliver for Deliveroo, Uber Eats, Just Eat, Amazon Flex, Evri, DPD or Stuart as a sole trader, the return for the 2025-26 tax year is due online by 31 January 2027. Here is what you need to know, and where your mileage goes."
      path="/self-assessment-delivery-drivers"
      updated="November 2026"
      shortAnswer={[
        "If you were a self-employed sole trader and earned more than £1,000 before costs in the 2025-26 tax year (6 April 2025 to 5 April 2026), you must send a Self Assessment return. The £1,000 is the total across every app.",
        "The online return for 2025-26 is due by 31 January 2027, and so is any tax you owe. If you make payments on account, the second one is due by 31 July 2027.",
        "Your mileage claim goes in box 12, car, van and travel expenses, on the short self-employment pages (SA103S). For 2025-26 a car or van is 45p a mile for the first 10,000 business miles, then 25p.",
      ]}
      sections={[
        {
          heading: "Do you need to file?",
          body: [
            "GOV.UK says you must send a return if you were self-employed as a sole trader and earned more than £1,000 before taking off anything you can claim tax relief on. That means your pay before costs, added up across every app you worked for.",
            "If this is your first return, you needed to tell HMRC by 5 October 2026 for the 2025-26 tax year. If you have not registered yet, do it now on GOV.UK. When you register after 5 October, HMRC sends you a letter or email with a filing deadline 3 months from its date, but you must still pay the tax you owe by 31 January 2027. If you register late and do not pay in full by then, you may get a penalty for not telling HMRC in time.",
          ],
        },
        {
          heading: "The 2025-26 dates",
          list: [
            "5 October 2026: deadline to register for Self Assessment if this is your first return.",
            "31 October 2026: deadline for a paper return.",
            "31 January 2027: deadline for the online return, and for paying the tax you owe for 2025-26.",
            "31 July 2027: second payment on account, if you have to make them.",
          ],
          after: [
            "The paper deadline has passed, so for most drivers the next date that matters is 31 January 2027.",
          ],
        },
        {
          heading: "Payments on account",
          body: [
            "Payments on account are advance payments towards next year's bill. You have to make them unless your tax bill for the year was less than £1,000, or more than 80% of the tax you owed was already paid another way, for example through your tax code from a job.",
            "Each payment is half of the tax you owed for the year. They are due by 31 January and 31 July.",
            "This catches out a lot of drivers in their first year. If your 2025-26 bill is £2,000 and you made no payments on account last year, you pay the £2,000 plus a first £1,000 towards 2026-27 by 31 January 2027, so £3,000. Then another £1,000 is due by 31 July 2027.",
          ],
        },
        {
          heading: "The £1,000 trading allowance",
          body: [
            "The trading allowance is a tax exemption of up to £1,000 a year. It works on gross income, which means your pay before any costs come off.",
            "If your gross trading income for the year is £1,000 or less, you usually do not need to tell HMRC. If it is more, you can deduct the £1,000 allowance instead of your costs, but not both. Your mileage claim is one of your costs, so taking the allowance means giving up the mileage claim.",
            "For most drivers who use their own vehicle, the costs are worth more. 2,500 business miles at 45p is already £1,125. Work out both before you choose.",
          ],
        },
        {
          heading: "Which boxes your mileage and costs go in",
          body: [
            "Most delivery drivers use the short self-employment pages, SA103S. The form is for turnover below £90,000. If your turnover was £90,000 or more, you use the full pages, SA103F, where car, van and travel expenses are box 20.",
            "On the 2025-26 SA103S:",
          ],
          list: [
            "Box 9, your turnover: everything the apps paid you, including tips, fees and bonuses.",
            "Box 10.1, trading income allowance: only if you take the £1,000 allowance instead of your costs. If you do, leave boxes 11 to 20 empty.",
            "Box 12, car, van and travel expenses: your mileage claim, plus parking and tolls on work trips.",
            "Box 18, phone, fax, stationery and other office costs: the work share of your phone.",
            "Box 19, other allowable business expenses: costs that fit nowhere else.",
            "Box 20, total allowable expenses: the total of boxes 11 to 19. With turnover below £90,000, HMRC's notes say you may just put your total costs here instead of filling in each box.",
          ],
          after: [
            "The online return asks for the same figures under the same headings, so the box numbers are a useful map even if you never see the paper form.",
          ],
        },
        {
          heading: "The 2025-26 mileage rates",
          body: [
            "For journeys between 6 April 2025 and 5 April 2026, the flat rates are:",
          ],
          list: [
            "Car or van: 45p a mile for the first 10,000 business miles, then 25p a mile.",
            "Motorbike: 24p a mile.",
          ],
          after: [
            "These are the 2025-26 rates only. From 6 April 2026 the car and van rate went up to 55p for the first 10,000 miles, but that belongs on your 2026-27 return, due by 31 January 2028. Rates for later years are on our HMRC mileage rates page.",
            "The flat rate covers fuel, insurance, repairs and servicing, so you cannot claim those as well for that vehicle. Parking can be claimed on top. Once you use the flat rate for a vehicle, you must keep using it for as long as you use that vehicle for work.",
          ],
        },
        {
          heading: "Late filing and late payment penalties",
          body: [
            "If your 2025-26 return is late, GOV.UK lists these penalties:",
          ],
          list: [
            "£100 as soon as it is late.",
            "After 3 months, £10 a day, up to £900.",
            "After 6 months, a further 5% of the tax due or £300, whichever is more.",
            "After 12 months, another 5% or £300, whichever is more.",
          ],
          after: [
            "Paying late brings separate penalties of 5% of the unpaid tax at 30 days, 6 months and 12 months, plus interest on what you owe.",
            "If you join Making Tax Digital for Income Tax from 2026-27, late returns are handled with penalty points instead. Our page on Making Tax Digital penalties explains that.",
          ],
        },
        {
          heading: "Keeping records",
          body: [
            "Keep your records for at least 5 years after the 31 January deadline for the tax year. For 2025-26, with an online deadline of 31 January 2027, that means until at least the end of January 2032.",
            "For mileage, a usable record has the date, where each trip started and finished, the miles, and why it was for work. Keep your app statements, receipts for parking and kit, and your phone bills with them.",
          ],
        },
        {
          heading: "How MileClear helps",
          body: [
            "MileClear is a mileage tracking app for UK drivers. It records your drives in the background, you sort each one as business or personal, and it works out your mileage claim at the right rate for the year each trip was made. Tracking is free.",
            "The free Self Assessment walkthrough adds up your earnings, mileage and costs, and shows which box each figure goes in. The print-ready PDF summary is part of Pro at £4.99 a month.",
            "MileClear does not file your return. You still submit it on GOV.UK, or hand the figures to your accountant. For a step-by-step list of what to gather, read our Self Assessment checklist for delivery drivers.",
          ],
        },
      ]}
      faqs={[
        {
          question: "When is the deadline for the 2025-26 tax return?",
          answer:
            "The online return is due by 31 January 2027, and so is any tax you owe for 2025-26. The paper deadline was 31 October 2026. If you make payments on account, the second one is due by 31 July 2027.",
        },
        {
          question: "Which box does mileage go in on the SA103S?",
          answer:
            "Box 12, car, van and travel expenses, on the 2025-26 short self-employment pages. Parking and tolls on work trips go there too. On the full pages, SA103F, it is box 20.",
        },
        {
          question: "Should I use the SA103S or the SA103F?",
          answer:
            "The short pages, SA103S, are for turnover below £90,000. If your turnover was £90,000 or more, use the full pages, SA103F.",
        },
        {
          question: "Do I have to make payments on account?",
          answer:
            "Yes, unless your tax bill for the year was less than £1,000 or more than 80% of the tax you owed was already paid another way, such as through your tax code. Each payment is half of the year's bill, due by 31 January and 31 July.",
        },
        {
          question: "Is it 45p or 55p a mile on my 2025-26 return?",
          answer:
            "45p for the first 10,000 business miles in a car or van, then 25p. The 55p rate applies to journeys from 6 April 2026, so it goes on the 2026-27 return.",
        },
        {
          question: "What is the penalty for filing late?",
          answer:
            "£100 as soon as the return is late. After 3 months it is £10 a day up to £900, then 5% of the tax due or £300 at 6 months and again at 12 months, whichever is more each time. Paying late brings separate penalties and interest.",
        },
        {
          question: "Can I take the £1,000 trading allowance and claim mileage?",
          answer:
            "No. If your gross trading income is over £1,000, you either deduct the £1,000 allowance or your actual costs, including mileage, not both.",
        },
      ]}
      caution={{
        title: "The first-year January bill",
        body: "In your first year with payments on account, the 31 January payment can be about one and a half times your bill for the year. Set money aside for it now.",
      }}
      cta={{
        href: "/app?from=seo-sa-delivery&page=tax",
        label: "Get the MileClear app",
        note: "Free to start on iPhone and Android.",
      }}
      links={[
        {
          href: "/updates/self-assessment-delivery-drivers-checklist",
          label: "Self Assessment checklist for delivery drivers",
          primary: true,
        },
        { href: "/hmrc-mileage-rates", label: "HMRC mileage rates" },
        { href: "/mileage-or-actual-costs", label: "Mileage rate or actual costs" },
        { href: "/what-counts-as-business-mileage", label: "What counts as business mileage" },
        { href: "/how-long-to-keep-mileage-records", label: "How long to keep records" },
        { href: "/do-delivery-apps-report-earnings-to-hmrc", label: "Do delivery apps report to HMRC?" },
        { href: "/making-tax-digital-delivery-drivers", label: "Making Tax Digital for drivers" },
        { href: "/delivery-driver-mileage-tracker", label: "Delivery driver mileage tracker" },
        {
          href: "https://www.gov.uk/self-assessment-tax-returns/deadlines",
          label: "GOV.UK: Self Assessment deadlines",
        },
        {
          href: "https://www.gov.uk/understand-self-assessment-bill/payments-on-account",
          label: "GOV.UK: payments on account",
        },
        {
          href: "https://www.gov.uk/government/publications/self-assessment-self-employment-short-sa103s",
          label: "GOV.UK: SA103S form and notes",
        },
      ]}
    />
  );
}
