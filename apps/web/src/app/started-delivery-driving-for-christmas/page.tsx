import type { Metadata } from "next";
import GuideLayout from "@/components/guides/GuideLayout";

export const metadata: Metadata = {
  title: "Started Delivery Driving for Christmas? What to Record for Tax",
  description:
    "Took on delivery work for the Christmas rush? Whether you are self-employed or agency-employed, when to register for Self Assessment, what to record for each trip, the mileage rates and the £1,000 trading allowance.",
  alternates: {
    canonical: "https://mileclear.com/started-delivery-driving-for-christmas",
  },
  openGraph: {
    title: "Started Delivery Driving for Christmas? What to Record | MileClear",
    description:
      "A plain guide for seasonal delivery drivers: self-employed or employed, Self Assessment, what to log, the mileage rate and the trading allowance.",
    url: "https://mileclear.com/started-delivery-driving-for-christmas",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Started Delivery Driving for Christmas? What to Record | MileClear",
    description: "What a seasonal delivery driver needs to record for tax in the UK.",
    images: ["/branding/og-image.png"],
  },
};

export default function StartedDeliveryDrivingForChristmasPage() {
  return (
    <GuideLayout
      eyebrow="Seasonal drivers"
      title="Started delivery driving for Christmas? What to record for tax"
      standfirst="Taking on parcels or takeaways for the busy weeks is easy to start. The tax side is easier too, if you keep a few records from the first day."
      path="/started-delivery-driving-for-christmas"
      updated="October 2026"
      shortAnswer={[
        "First work out whether you are self-employed or employed. Most gig and courier work is self-employed. Work through an agency that puts you on its payroll is usually employment.",
        "If you are self-employed, record the date, start, end, miles and reason for each work trip from your first day. If you started in November 2026 you are in the 2026-27 tax year, and you need to register for Self Assessment by 5 October 2027.",
        "If you are employed through an agency, you do not file as self-employed. Your question is Mileage Allowance Relief instead.",
      ]}
      sections={[
        {
          heading: "Are you self-employed or employed?",
          body: [
            "This decides everything else, so check it first. Look at your contract and how you are paid. If you are paid by the parcel, drop or block, run your own schedule and use your own vehicle, you are most likely self-employed. If an agency pays you through PAYE and takes tax off your wages, you are employed.",
            "Not sure? GOV.UK has an employment status check, and the platform or agency should be able to tell you how it treats you. This guide cannot decide it for you.",
          ],
          after: [
            "Employed drivers do not register for Self Assessment just for this. If your employer pays you less than the approved mileage rate for your own vehicle, read about Mileage Allowance Relief instead.",
          ],
        },
        {
          heading: "Registering for Self Assessment",
          body: [
            "If you are self-employed, you register with HMRC as a sole trader. The deadline is 5 October after the end of the tax year in which you started.",
            "The tax year runs from 6 April to 5 April. Start in November 2026 and you are in the 2026-27 tax year, which ends on 5 April 2027. You then register by 5 October 2027. Your first return for that year is due by 31 January 2028.",
            "Register early if you can. You wait for a letter with your Unique Taxpayer Reference, and it can take a couple of weeks to arrive.",
          ],
        },
        {
          heading: "What to record for each trip",
          body: [
            "A usable mileage record is simple. For each work trip, note:",
          ],
          list: [
            "The date.",
            "Where it started and where it finished.",
            "The miles driven.",
            "Why it was for work, such as the platform or a delivery reference.",
          ],
          after: [
            "The short hops between drops count as business miles. A drive to the shops or a lift for a friend does not. Whether your drive from home to a depot or station counts depends on how your work is set up, and self-employed drivers generally cannot claim ordinary home-to-work travel. Check the GOV.UK guidance on this before you claim it.",
            "Record as you go. A log made at the time is far easier to rely on than one rebuilt in January.",
          ],
        },
        {
          heading: "The mileage rates",
          body: [
            "Most drivers use the simple flat rate per mile for their own vehicle. For tax year 2026-27, which began on 6 April 2026, a car or van is 55p a mile for the first 10,000 business miles and 25p a mile after that. A motorbike is 24p a mile. In 2025-26 the car and van rate was 45p then 25p.",
            "The rate is meant to cover running the vehicle. If you use it, you cannot also claim fuel, insurance or repairs. Parking for work can be claimed on top.",
            "Once you use the mileage rate for a vehicle, you generally have to keep using it for that vehicle. Read the page on mileage rate or actual costs before you choose.",
          ],
        },
        {
          heading: "The £1,000 trading allowance",
          body: [
            "If your gross trading income for the year is £1,000 or less, you usually do not need to declare it. Gross means what you were paid before any costs come off.",
            "If it is more than £1,000, you can choose to deduct a flat £1,000 allowance instead of your actual costs. You cannot have both. The mileage claim is one of your costs, so taking the allowance means giving the mileage claim up for that income.",
            "For a few weeks of seasonal work with few miles, the allowance can come out better. For a lot of driving, the mileage claim is usually the bigger number. Work out both before you file.",
          ],
        },
        {
          heading: "How long to keep your records",
          body: [
            "If you are self-employed, keep them for at least five years after the 31 January deadline for that tax year. For the 2026-27 tax year, with a return due on 31 January 2028, that means until 31 January 2033.",
          ],
        },
        {
          heading: "How MileClear helps",
          body: [
            "MileClear is a mileage tracking app for UK drivers. It uses your phone to track trips in the background, and you sort each one as business or personal. Automatic tracking, sorting trips, shifts, expenses and the Self Assessment wizard and checklist are free.",
            "MileClear does not file your return. Downloads, including the PDF and other exports, are part of Pro at £4.99 a month. Like any phone app, tracking depends on your settings and signal, so check your trips now and then.",
          ],
        },
      ]}
      faqs={[
        {
          question: "Do I need to register as self-employed for a few weeks of Christmas work?",
          answer:
            "If you are self-employed and your gross trading income for the year is more than £1,000, you generally need to register. If it is £1,000 or less you usually do not need to declare it. Check the GOV.UK guidance for your own case.",
        },
        {
          question: "When is the deadline to register for Self Assessment?",
          answer:
            "5 October after the end of the tax year in which you started. Start in November 2026 and you register by 5 October 2027. Your first return is due by 31 January 2028.",
        },
        {
          question: "Which mileage rate applies if I start in November 2026?",
          answer:
            "Tax year 2026-27 rates apply: 55p a mile for the first 10,000 business miles in a car or van, then 25p. A motorbike is 24p a mile.",
        },
        {
          question: "Can I claim fuel as well as the mileage rate?",
          answer:
            "No. The mileage rate covers fuel, insurance and repairs. Parking for work can be claimed on top.",
        },
        {
          question: "I am employed through an agency. What do I do?",
          answer:
            "You are not self-employed, so you do not use Self Assessment for this work. If your employer pays you less than the approved rate for using your own vehicle, see Mileage Allowance Relief.",
        },
        {
          question: "Can I use the trading allowance and claim mileage?",
          answer:
            "No. The £1,000 trading allowance replaces your actual costs, and the mileage claim is one of those costs. You choose one or the other.",
        },
      ]}
      caution={{
        title: "Start the log on day one",
        body: "The miles you drive in your first week are the ones people forget to record. A log started late is a log with a gap in it.",
      }}
      cta={{
        href: "/app?from=seo-peak",
        label: "Get the MileClear app",
        note: "Free to start on iPhone and Android.",
      }}
      links={[
        { href: "/mileage-allowance-relief", label: "Mileage Allowance Relief for employed drivers", primary: true },
        { href: "/hmrc-mileage-rates", label: "HMRC mileage rates" },
        { href: "/mileage-or-actual-costs", label: "Mileage rate or actual costs" },
        { href: "/how-long-to-keep-mileage-records", label: "How long to keep records" },
        { href: "/what-counts-as-business-mileage", label: "What counts as business mileage" },
        { href: "/delivery-driver-mileage-tracker", label: "Delivery driver mileage tracker" },
        { href: "https://www.gov.uk/register-for-self-assessment", label: "GOV.UK: register for Self Assessment" },
        {
          href: "https://www.gov.uk/guidance/tax-free-allowances-on-property-and-trading-income",
          label: "GOV.UK: trading allowance",
        },
        {
          href: "https://www.gov.uk/government/publications/rates-and-allowances-travel-mileage-and-fuel-allowances/travel-mileage-and-fuel-rates-and-allowances",
          label: "GOV.UK: mileage rates",
        },
      ]}
    />
  );
}
