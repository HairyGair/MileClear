import type { Metadata } from "next";
import GuideLayout from "@/components/guides/GuideLayout";

// Facts checked against GOV.UK on 2 Nov 2026:
// - rules from 1 January 2024, reported yearly by the following January
//   (2024 information by 31 January 2025), sellers get a copy, examples
//   "delivering food, driving a taxi", reports do not replace your records,
//   reporting does not automatically mean you owe tax:
//   gov.uk/guidance/selling-goods-or-services-on-a-digital-platform
// - the 2,000 euro / 30 sales exception does not apply to services:
//   gov.uk/guidance/reporting-rules-for-digital-platforms
// - report and seller copy both due by 31 January after the calendar year:
//   gov.uk/guidance/manage-your-digital-platform-reporting and the Platform
//   Operators (Due Diligence and Reporting Requirements) Regulations 2023
// - who must file: gov.uk/self-assessment-tax-returns/who-must-send-a-tax-return

export const metadata: Metadata = {
  title: "Do Uber, Deliveroo and Amazon Flex Tell HMRC What You Earn?",
  description:
    "Since 1 January 2024, digital platforms report sellers' income to HMRC each year, and give you a copy. What the rules cover for delivery and rideshare drivers, what they mean for your tax return, and why you still need your own mileage log.",
  alternates: {
    canonical: "https://mileclear.com/do-delivery-apps-report-earnings-to-hmrc",
  },
  openGraph: {
    title: "Do Delivery Apps Tell HMRC What You Earn? | MileClear",
    description:
      "The digital platform reporting rules explained for UK delivery and rideshare drivers, and why the reports do not cover your mileage.",
    url: "https://mileclear.com/do-delivery-apps-report-earnings-to-hmrc",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Do Delivery Apps Tell HMRC What You Earn? | MileClear",
    description: "The digital platform reporting rules, explained for UK delivery drivers.",
    images: ["/branding/og-image.png"],
  },
};

export default function DoDeliveryAppsReportEarningsPage() {
  return (
    <GuideLayout
      eyebrow="Platform reporting"
      title="Do Uber, Deliveroo and Amazon Flex tell HMRC what you earn?"
      standfirst="Under rules that started in the UK on 1 January 2024, digital platforms send HMRC details of what they pay the people who work through them. Here is what that means if you deliver or drive through an app."
      path="/do-delivery-apps-report-earnings-to-hmrc"
      updated="November 2026"
      shortAnswer={[
        "Yes, if the app counts as a digital platform under the rules. GOV.UK names delivering food and driving a taxi as examples of the services covered.",
        "Platforms collect your details and income for each calendar year and send them to HMRC by 31 January the following year. Information for 2024 was due by 31 January 2025. The platform must also give you a copy of what it reported.",
        "The reports cover what you were paid, not your mileage. HMRC can compare them with your tax return, so declare all your income, and keep your own mileage log to claim your costs.",
      ]}
      sections={[
        {
          heading: "What the rules are",
          body: [
            "The UK's reporting rules for digital platforms started on 1 January 2024. A digital platform is a website or app that connects sellers with customers for goods or services. In these rules, a driver doing work through an app counts as a seller.",
            "GOV.UK gives examples of what is covered, including providing personal services \"like delivering food, driving a taxi, or freelancing\". So food delivery and ride apps are the kind of platform the rules were written for.",
            "There is a small-seller exception, but it is for people who make fewer than 30 sales of goods in a calendar year and get less than 2,000 euros (about £1,700) for those sales. It does not apply to services, so there is no minimum for delivery or driving work.",
          ],
        },
        {
          heading: "What gets reported, and when",
          body: [
            "For an individual, the platform asks for your full name, home address, date of birth and tax identification number. It reports these with what it paid you through the platform.",
            "Platforms work on calendar years, from 1 January to 31 December. Each year's report goes to HMRC by 31 January the following year. The first reports, covering 2024, were due by 31 January 2025. Reports covering 2025 were due by 31 January 2026.",
            "The platform must also give you a copy of the information it sent, by the same 31 January date. Keep it with your tax records.",
            "The copy shows the total you earned on the platform for the calendar year, less any fees, commission or taxes the platform took off, split into the four quarters of the year. So it may not match the turnover on your tax return, which is your pay before costs, for the tax year.",
          ],
        },
        {
          heading: "What this means for drivers",
          body: [
            "The rules do not create a new tax. GOV.UK says a platform reporting your details does not automatically mean you owe tax. The tax rules for self-employed drivers are the same as before.",
            "What has changed is that HMRC now has its own figure for what each app paid you. If you were self-employed as a sole trader and earned more than £1,000 before costs in a tax year, you must send a Self Assessment return. Declare everything from every app, including the ones you only used for a few weeks.",
            "The dates will not line up exactly. Platforms report by calendar year, but the tax year runs from 6 April to 5 April. Use your own records and statements to work out your income for the tax year, and use the platform's copy as a check.",
          ],
        },
        {
          heading: "Which apps does this cover?",
          body: [
            "Any app that connects you with customers for delivery or driving work is likely to be a platform under these rules. That is the model used by food delivery and ride apps such as Uber and Deliveroo.",
            "Some parcel work is set up differently, with you contracted by the delivery company itself. Whether a particular company reports under these rules depends on how it is set up. The simplest check is whether you received a copy of a platform report by 31 January, or ask the company. Either way, your duty to declare your income is the same.",
          ],
        },
        {
          heading: "The reports do not cover your mileage",
          body: [
            "A platform report is about income. It does not record the miles you drove, your fuel or your parking. GOV.UK says the reports do not replace your normal business records or tax calculations.",
            "For most drivers, mileage is the biggest cost they can claim, and only you can back it up. A usable log has the date, where each trip started and finished, the miles and why it was for work. Without one, you could end up paying tax on income that HMRC knows about while claiming nothing for the miles it took to earn it.",
          ],
        },
        {
          heading: "How MileClear helps",
          body: [
            "MileClear is a mileage tracking app for UK drivers. It records your drives in the background, you sort each one as business or personal, and it works out your mileage claim at the right rate for the year each trip was made. Tracking is free.",
            "You can add what each app paid you, then type in the figure from a platform's report to see how it compares with what you recorded. MileClear does not file your tax return. Like any phone app, tracking depends on your settings and signal, so check your trips now and then.",
          ],
        },
      ]}
      faqs={[
        {
          question: "Does Uber or Deliveroo report my earnings to HMRC?",
          answer:
            "Under the UK digital platform reporting rules, which started on 1 January 2024, platforms that connect people with customers for services such as food delivery and taxi driving report sellers' details and income to HMRC each year. They must also give you a copy.",
        },
        {
          question: "When do platforms send the information to HMRC?",
          answer:
            "By 31 January after the end of each calendar year. Information for 2024 was due by 31 January 2025, and information for 2025 by 31 January 2026.",
        },
        {
          question: "Will I get a copy of what the app reported?",
          answer:
            "Yes. Platform operators have to give you a copy of the information they reported to HMRC, by the same 31 January date.",
        },
        {
          question: "Is there a minimum before I am reported?",
          answer:
            "Not for delivery or driving work. The exception for fewer than 30 sales of goods in a calendar year and less than 2,000 euros (about £1,700) applies to selling goods, not to services.",
        },
        {
          question: "Does being reported mean I owe tax?",
          answer:
            "Not automatically. The tax rules are the same as before. If you were self-employed and earned more than £1,000 before costs in the tax year, you must send a Self Assessment return.",
        },
        {
          question: "Do the platform reports include my mileage?",
          answer:
            "No. They cover what you were paid. To claim your mileage you need your own record of the date, start, finish, miles and reason for each work trip.",
        },
      ]}
      caution={{
        title: "Calendar year, not tax year",
        body: "A platform's report runs from January to December, not the tax year, and its total has the platform's fees, commission and any taxes it took already taken off. Your tax return covers 6 April to 5 April. Do not copy the platform's total straight onto your return. Work out the tax year figure from your own records and statements.",
      }}
      cta={{
        href: "/app?from=seo-platform-reporting&page=gig",
        label: "Get the MileClear app",
        note: "Free to start on iPhone and Android.",
      }}
      links={[
        { href: "/self-assessment-delivery-drivers", label: "Self Assessment for delivery drivers", primary: true },
        { href: "/updates/self-assessment-delivery-drivers-checklist", label: "Self Assessment checklist" },
        { href: "/making-tax-digital-delivery-drivers", label: "Making Tax Digital for drivers" },
        { href: "/delivery-driver-mileage-tracker", label: "Delivery driver mileage tracker" },
        { href: "/what-counts-as-business-mileage", label: "What counts as business mileage" },
        { href: "/uber-mileage-tracker", label: "Uber" },
        { href: "/deliveroo-mileage-tracker", label: "Deliveroo" },
        { href: "/just-eat-mileage-tracker", label: "Just Eat" },
        { href: "/amazon-flex-mileage-tracker", label: "Amazon Flex" },
        {
          href: "https://www.gov.uk/guidance/selling-goods-or-services-on-a-digital-platform",
          label: "GOV.UK: selling on a digital platform",
        },
        {
          href: "https://www.gov.uk/guidance/reporting-rules-for-digital-platforms",
          label: "GOV.UK: reporting rules for digital platforms",
        },
      ]}
    />
  );
}
