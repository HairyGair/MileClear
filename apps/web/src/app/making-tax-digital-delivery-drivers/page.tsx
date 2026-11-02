import type { Metadata } from "next";
import GuideLayout from "@/components/guides/GuideLayout";

// Facts checked against GOV.UK on 2 Nov 2026:
// - thresholds, qualifying income, start dates, what you must do:
//   gov.uk/guidance/use-making-tax-digital-for-income-tax/using-making-tax-digital-for-income-tax-for-the-first-time
// - HMRC signing people up from September 2026:
//   gov.uk/guidance/sign-up-for-making-tax-digital-for-income-tax
// - what a quarterly update contains, cumulative, late returns still get points:
//   gov.uk/guidance/use-making-tax-digital-for-income-tax/send-quarterly-updates
// - digital records (amount, date, category), simplified expenses:
//   gov.uk/guidance/use-making-tax-digital-for-income-tax/create-digital-records
// - mileage flat rates: gov.uk/simpler-income-tax-simplified-expenses/vehicles

export const metadata: Metadata = {
  title: "Making Tax Digital for Delivery Drivers: Uber, Deliveroo, Amazon Flex",
  description:
    "Making Tax Digital for Income Tax for UK delivery and rideshare drivers. Who it applies to (£50,000 from April 2026, £30,000 from April 2027, £20,000 from April 2028), what you must do, and where your mileage claim fits.",
  alternates: {
    canonical: "https://mileclear.com/making-tax-digital-delivery-drivers",
  },
  openGraph: {
    title: "Making Tax Digital for Delivery Drivers | MileClear",
    description:
      "Who has to use Making Tax Digital for Income Tax, how income from several apps adds up, and how your mileage claim fits into quarterly updates.",
    url: "https://mileclear.com/making-tax-digital-delivery-drivers",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Making Tax Digital for Delivery Drivers | MileClear",
    description: "Making Tax Digital for Income Tax, explained for UK delivery and rideshare drivers.",
    images: ["/branding/og-image.png"],
  },
};

export default function MakingTaxDigitalDeliveryDriversPage() {
  return (
    <GuideLayout
      eyebrow="Making Tax Digital"
      title="Making Tax Digital for delivery and rideshare drivers"
      standfirst="If you drive for Uber, Deliveroo, Just Eat, Amazon Flex, Evri, DPD or Stuart as a sole trader, Making Tax Digital for Income Tax changes how you report to HMRC once your income passes a set level. Here is who it covers and what it means for your mileage."
      path="/making-tax-digital-delivery-drivers"
      updated="November 2026"
      shortAnswer={[
        "Making Tax Digital for Income Tax applies to sole traders and landlords whose qualifying income is over a set level. Qualifying income is your total turnover from self-employment and property, before costs come off.",
        "The level drops in stages: over £50,000 from 6 April 2026, over £30,000 from 6 April 2027, and over £20,000 from 6 April 2028. Each stage is based on the tax return for an earlier year.",
        "Once you are in, you keep digital records, send a quarterly update every 3 months, and still send one tax return for the year by 31 January. Your mileage claim goes on the costs side, so it lowers your profit but does not change whether you have to join.",
      ]}
      sections={[
        {
          heading: "Who it applies to",
          body: [
            "Making Tax Digital for Income Tax is for people who are self-employed as sole traders or who have income from property. Most drivers who take work through delivery and ride apps are sole traders, so it is likely to reach you once your income is high enough.",
            "HMRC looks at your qualifying income on an earlier tax return to decide when you start:",
          ],
          list: [
            "Over £50,000 on your 2024-25 return: you start on 6 April 2026.",
            "Over £30,000 on your 2025-26 return: you start on 6 April 2027.",
            "Over £20,000 on your 2026-27 return: you start on 6 April 2028.",
          ],
          after: [
            "The key word is turnover. It is what the apps paid you before any costs, not your profit. A driver paid £34,000 in the 2025-26 tax year with £12,000 of costs has a profit of £22,000, but their qualifying income is £34,000. That is over £30,000, so they would start on 6 April 2027.",
            "Some people are exempt. If you are not sure whether you need to join, read our guide on whether you need Making Tax Digital, or check the guidance on GOV.UK.",
          ],
        },
        {
          heading: "Driving for more than one app",
          body: [
            "Many drivers work for two or three apps in the same week. HMRC counts your total income from self-employment and property, so your pay from every app adds up to one figure.",
            "Say you made £14,000 from Uber Eats, £11,000 from Deliveroo and £8,000 from Amazon Flex in 2025-26. No single app is over £30,000, but together it is £33,000, so you would start on 6 April 2027.",
            "If you also rent out a property, that rental income counts towards the same total. Wages from a PAYE job are not self-employment or property income, so they are not part of this figure.",
          ],
        },
        {
          heading: "What you have to do once you are in",
          body: [
            "GOV.UK lists three things:",
          ],
          list: [
            "Keep digital records of your self-employment income and costs. Each record needs the amount, the date and a category.",
            "Send a quarterly update every 3 months from software that works with Making Tax Digital.",
            "Send one tax return for the year, and pay what you owe, by 31 January after the tax year ends.",
          ],
          after: [
            "A quarterly update is a summary, not a tax return. It holds your totals for each income and cost category, using the same categories as Self Assessment. HMRC does not get your individual receipts. Each update runs from 6 April to the end of that quarter, so it adds up the year so far.",
            "For the 2026-27 tax year the updates are due by 7 August 2026, 7 November 2026, 7 February 2027 and 7 May 2027. Our page on quarterly update deadlines has the dates for later years.",
            "HMRC says that from September 2026 it will start signing up people who need to use Making Tax Digital for 2026-27 but have not signed up yet, and will write to tell them what to do next.",
          ],
        },
        {
          heading: "How your mileage fits in",
          body: [
            "Mileage is usually a delivery driver's biggest cost. You have two ways to claim for a car, van or motorbike you use for work:",
          ],
          list: [
            "The flat mileage rate. For the 2026-27 tax year a car or van is 55p a mile for the first 10,000 business miles and 25p after that. A motorbike is 24p a mile. This rate covers fuel, insurance, repairs and servicing, so you cannot claim those as well.",
            "Actual costs. You claim the business share of what you spend on the vehicle, such as fuel, insurance and repairs.",
          ],
          after: [
            "Either way, the claim goes on the costs side of your records, in the car, van and travel category. It lowers your profit and so your tax. It does not lower your qualifying income, because that is measured before costs.",
            "Once you use the flat rate for a vehicle, you have to keep using it for as long as you use that vehicle for work. The rates also change from year to year, so check our page on HMRC mileage rates for the year you are claiming.",
            "HMRC's record-keeping guidance says that if you are sure you will use simplified expenses such as the flat mileage rate, you do not need digital records of the actual costs it replaces. You still need a log of your business miles to back up the claim: the date, where you went, the miles and why.",
          ],
        },
        {
          heading: "Late updates and late returns",
          body: [
            "HMRC says that for the 2026-27 tax year, late quarterly updates do not get penalty points. A late tax return still does. Our page on Making Tax Digital penalties explains how the points work.",
          ],
        },
        {
          heading: "How MileClear helps",
          body: [
            "MileClear is a mileage tracking app for UK drivers. It records your drives in the background, you sort each one as business or personal, and it works out your mileage claim at the right rate for the year each trip was made. You can add your earnings from each app and your other costs too. Tracking is free.",
            "Pro drivers can send their quarterly updates for self-employment income to HMRC from the MileClear app. Your mileage claim goes into the car, van and travel costs line, and you check every figure before you send it. You need to be signed up for Making Tax Digital with HMRC first.",
            "The end-of-year tax return is not sent from MileClear yet. You file that on GOV.UK, through other software, or through your accountant. Like any phone app, tracking depends on your settings and signal, so check your trips now and then.",
          ],
        },
      ]}
      faqs={[
        {
          question: "Do delivery drivers have to use Making Tax Digital?",
          answer:
            "Only if your qualifying income is over the level for that year. Qualifying income is your total turnover from self-employment and property, before costs. It is over £50,000 from 6 April 2026, over £30,000 from 6 April 2027 and over £20,000 from 6 April 2028, each based on an earlier tax return.",
        },
        {
          question: "Is the £30,000 limit based on my profit or my earnings?",
          answer:
            "Your earnings before costs. GOV.UK describes qualifying income as the total amount before expenses. A driver paid £34,000 with £12,000 of mileage and other costs is still over £30,000.",
        },
        {
          question: "I drive for Uber and Deliveroo. Do I add them together?",
          answer:
            "Yes. HMRC counts your total income from self-employment and property, so pay from every app adds up to one figure.",
        },
        {
          question: "Does my mileage claim count towards the limit?",
          answer:
            "No. The mileage claim is a cost. It lowers your profit and your tax, but the limit is measured on turnover before costs.",
        },
        {
          question: "Do I still send a tax return under Making Tax Digital?",
          answer:
            "Yes. You send quarterly updates during the year and one tax return for the year, both from compatible software. The return and any tax owed are due by 31 January after the tax year ends.",
        },
        {
          question: "Can MileClear send my quarterly updates?",
          answer:
            "Yes, for self-employment income, if you have Pro and have signed up for Making Tax Digital with HMRC. The end-of-year tax return is not sent from MileClear yet, so you file that on GOV.UK, through other software or through your accountant.",
        },
      ]}
      caution={{
        title: "Turnover, not profit",
        body: "The mistake to avoid is checking your profit against the limit. A driver with low profit after a big mileage claim can still be over £30,000 in turnover, and that is the figure HMRC uses.",
      }}
      cta={{
        href: "/app?from=seo-mtd-delivery&page=tax",
        label: "Get the MileClear app",
        note: "Free to start on iPhone and Android.",
      }}
      links={[
        { href: "/do-i-need-making-tax-digital", label: "Do I need Making Tax Digital?", primary: true },
        { href: "/mtd-quarterly-update-deadlines", label: "Quarterly update deadlines" },
        { href: "/mtd-late-submission-penalties", label: "Making Tax Digital penalties" },
        { href: "/mtd-itsa-software-for-sole-traders", label: "MTD software for sole traders" },
        { href: "/self-assessment-delivery-drivers", label: "Self Assessment for delivery drivers" },
        { href: "/hmrc-mileage-rates", label: "HMRC mileage rates" },
        { href: "/mileage-or-actual-costs", label: "Mileage rate or actual costs" },
        { href: "/delivery-driver-mileage-tracker", label: "Delivery driver mileage tracker" },
        { href: "/uber-mileage-tracker", label: "Uber" },
        { href: "/deliveroo-mileage-tracker", label: "Deliveroo" },
        { href: "/just-eat-mileage-tracker", label: "Just Eat" },
        { href: "/amazon-flex-mileage-tracker", label: "Amazon Flex" },
        { href: "/evri-mileage-tracker", label: "Evri" },
        { href: "/dpd-mileage-tracker", label: "DPD" },
        {
          href: "https://www.gov.uk/guidance/use-making-tax-digital-for-income-tax/using-making-tax-digital-for-income-tax-for-the-first-time",
          label: "GOV.UK: using Making Tax Digital for the first time",
        },
        {
          href: "https://www.gov.uk/guidance/use-making-tax-digital-for-income-tax/send-quarterly-updates",
          label: "GOV.UK: send quarterly updates",
        },
      ]}
    />
  );
}
