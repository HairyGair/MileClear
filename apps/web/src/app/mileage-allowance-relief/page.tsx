import type { Metadata } from "next";
import GuideLayout from "@/components/guides/GuideLayout";

export const metadata: Metadata = {
  title: "Mileage Allowance Relief: Claiming When Your Employer Pays Less Than 55p",
  description:
    "If your employer pays under the HMRC approved rate, you can claim tax relief on the difference. What Mileage Allowance Relief is worth, how to claim it on a P87 or a tax return, and the four-year deadline.",
  alternates: {
    canonical: "https://mileclear.com/mileage-allowance-relief",
  },
  openGraph: {
    title: "Mileage Allowance Relief | MileClear",
    description:
      "Your employer pays 25p and HMRC's rate is 55p. Here is what the 30p difference is actually worth to you, and how to claim it.",
    url: "https://mileclear.com/mileage-allowance-relief",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mileage Allowance Relief | MileClear",
    description:
      "Claiming the difference when your employer pays less than the HMRC approved mileage rate.",
    images: ["/branding/og-image.png"],
  },
};

export default function MileageAllowanceReliefPage() {
  return (
    <GuideLayout
      eyebrow="Employees"
      title="When your employer pays less than the approved rate"
      standfirst="Plenty of employers pay 25p or 30p a mile. HMRC's approved rate is 55p. You can claim tax relief on the gap, and most people who could never do."
      path="/mileage-allowance-relief"
      shortAnswer={[
        "If your employer reimburses you less than HMRC's approved rate, the shortfall counts as an allowable expense. Claiming it is called Mileage Allowance Relief.",
        "You get tax relief on the shortfall, not the shortfall itself. A basic-rate taxpayer gets 20p back for every pound of gap, and a higher-rate taxpayer 40p. That is worth having: 8,000 business miles at a 30p shortfall is £2,400 of expense, which is £480 in your pocket at 20% and £960 at 40%.",
        "You can claim for the current tax year and the four before it, so a claim you have never made is probably worth more than one year's worth.",
      ]}
      sections={[
        {
          heading: "Working out what you are owed",
          body: [
            "Take the approved rate, take off what your employer actually pays you, and multiply by your business miles. The approved rate for a car or van is 55p a mile for the first 10,000 business miles in the tax year and 25p after that. It rose from 45p on 6 April 2026, so a claim covering earlier years uses 45p for those years.",
            "An example. You drive 12,000 business miles in a year and your employer pays a flat 25p.",
          ],
          list: [
            "First 10,000 miles: 55p approved, less 25p paid, is a 30p shortfall. That is £3,000.",
            "The next 2,000 miles: 25p approved, less 25p paid, is nothing. The rate drops to match what you are already getting.",
            "Total expense claimed: £3,000. Relief at 20% is £600; at 40% it is £1,200.",
          ],
          after: [
            "Notice what the second line does. Above 10,000 miles the approved rate falls to 25p, so an employer paying 25p is paying you exactly the approved amount and there is nothing left to claim. High-mileage drivers often assume the gap keeps growing, and it does not.",
          ],
        },
        {
          heading: "How to claim",
          body: [
            "If your total expenses claim for the year is £2,500 or less, use form P87. It is on GOV.UK and takes a few minutes online. You need your employer's PAYE reference, your National Insurance number, your business mileage and what you were paid for it.",
            "If the claim is more than £2,500, or you already file a Self Assessment return for another reason, it goes on the employment pages of your tax return instead.",
            "Relief usually arrives as a change to your tax code, which spreads it across the rest of the year, or as a refund if the year has already ended.",
          ],
        },
        {
          heading: "What you need to have kept",
          body: [
            "HMRC does not want your mileage log with the claim, but it can ask for it afterwards, and a claim you cannot evidence is one you may have to repay.",
            "A usable record has the date, where you went from and to, why the trip was for work, and the miles. Whatever you use to keep it, the test is whether a stranger could follow it a year later.",
          ],
        },
      ]}
      faqs={[
        {
          question: "My employer pays nothing at all. Can I still claim?",
          answer:
            "Yes, and your claim is larger. With nothing reimbursed the whole approved amount is the shortfall: 55p a mile for the first 10,000 business miles and 25p after that.",
        },
        {
          question: "My employer pays more than 55p. What happens?",
          answer:
            "The excess above the approved rate is treated as taxable pay and should go through payroll. There is nothing for you to claim, and you may owe tax on the difference.",
        },
        {
          question: "Does the commute count?",
          answer:
            "No. Ordinary commuting to a permanent workplace is not business mileage, whoever is paying. Travel to a temporary workplace, a client, or a site does count.",
        },
        {
          question: "What about the 5p for carrying a colleague?",
          answer:
            "Passenger payments are different, and this one catches people out. An employer can pay 5p per passenger per mile tax free, but if they do not pay it you cannot claim relief on it. It is the one part of the approved rates with no relief attached.",
        },
        {
          question: "How far back can I go?",
          answer:
            "Four years after the end of the tax year. Claims for 2022-23 have to be in by 5 April 2027, and so on. Earlier years use the 45p rate that applied before 6 April 2026.",
        },
        {
          question: "I use a company car. Does this apply?",
          answer:
            "No. Mileage Allowance Relief is for using your own vehicle for work. Company car drivers are on advisory fuel rates instead, which work differently.",
        },
      ]}
      caution={{
        title: "The part people get wrong",
        body: "Relief is not a refund of the gap. A £3,000 shortfall does not put £3,000 in your bank, it takes £3,000 off the income you are taxed on. If you were expecting the full amount you will be disappointed, and if you were expecting nothing you are several hundred pounds better off. Either way it is worth the twenty minutes.",
      }}
      links={[
        { href: "/hmrc-mileage-rates", label: "The approved rates in detail", primary: true },
        { href: "/approved-mileage-allowance-payments", label: "AMAP explained" },
        { href: "/what-counts-as-business-mileage", label: "What counts as business mileage" },
      ]}
    />
  );
}
