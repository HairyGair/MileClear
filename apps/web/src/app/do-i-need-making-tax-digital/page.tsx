import type { Metadata } from "next";
import GuideLayout from "@/components/guides/GuideLayout";

// Checked against GOV.UK on 2 Nov 2026:
// gov.uk/guidance/find-out-if-and-when-you-need-to-use-making-tax-digital-for-income-tax (26 Mar 2026)
// gov.uk/guidance/work-out-your-qualifying-income-for-making-tax-digital-for-income-tax (11 Sep 2026)
// gov.uk/guidance/find-out-if-you-can-get-an-exemption-from-making-tax-digital-for-income-tax (28 May 2026)
// gov.uk/guidance/apply-for-an-exemption-from-making-tax-digital-for-income-tax (17 Aug 2026)
// gov.uk/guidance/use-making-tax-digital-for-income-tax/if-your-circumstances-change (16 Oct 2026)

export const metadata: Metadata = {
  title: "Do I Need Making Tax Digital? The £50k, £30k and £20k Rules for Drivers",
  description:
    "Who must use Making Tax Digital for Income Tax: qualifying income over £50,000 from April 2026, over £30,000 from April 2027 and over £20,000 from April 2028. Qualifying income is turnover, not profit. Worked examples for delivery and gig drivers.",
  alternates: {
    canonical: "https://mileclear.com/do-i-need-making-tax-digital",
  },
  openGraph: {
    title: "Do I Need Making Tax Digital? | MileClear",
    description:
      "The thresholds, what counts as qualifying income, which year's return decides it, and worked examples for UK drivers.",
    url: "https://mileclear.com/do-i-need-making-tax-digital",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Do I Need Making Tax Digital? | MileClear",
    description:
      "£50,000 from April 2026, £30,000 from April 2027, £20,000 from April 2028. Turnover, not profit.",
    images: ["/branding/og-image.png"],
  },
};

export default function DoINeedMakingTaxDigitalPage() {
  return (
    <GuideLayout
      eyebrow="Making Tax Digital"
      title="Do I need Making Tax Digital for Income Tax?"
      standfirst="Making Tax Digital for Income Tax is coming in stages, by how much you earn from self-employment and property. Here is how to tell when it reaches you, with examples for drivers."
      path="/do-i-need-making-tax-digital"
      updated="2 November 2026"
      shortAnswer={[
        "You need it if your qualifying income is over the limit for the year HMRC checks. Over £50,000 in 2024-25 means from 6 April 2026. Over £30,000 in 2025-26 means from 6 April 2027. Over £20,000 in 2026-27 means from 6 April 2028.",
        "Qualifying income is your self-employment income plus your property income, before any costs come off. That is your turnover, not your profit. Wages from a job taxed through PAYE do not count.",
        "So a driver who takes £34,000 from deliveries in 2025-26 is over £30,000, even if their profit after costs is much lower.",
      ]}
      sections={[
        {
          heading: "The thresholds and start dates",
          body: [
            "HMRC looks at the qualifying income on your Self Assessment tax return for one year, and that decides whether you start in a later year.",
          ],
          table: {
            caption: "When Making Tax Digital for Income Tax starts",
            head: ["Qualifying income", "In tax year", "You start from"],
            rows: [
              ["Over £50,000", "2024-25", "6 April 2026"],
              ["Over £30,000", "2025-26", "6 April 2027"],
              ["Over £20,000", "2026-27", "6 April 2028"],
            ],
          },
          after: [
            "The tax year runs from 6 April to 5 April, so 2025-26 is 6 April 2025 to 5 April 2026. Its return is the one due by 31 January 2027.",
            "If you are over a limit, HMRC writes to tell you. GOV.UK is clear that if no letter arrives, it is still your job to check.",
          ],
        },
        {
          heading: "What counts as qualifying income",
          body: [
            "Qualifying income is your total income from self-employment and property, measured before expenses. HMRC calls this turnover. For a driver, it is what the platforms and customers paid you, before fuel, the mileage claim or anything else comes off.",
          ],
          list: [
            "Counts: self-employment income, such as delivery, courier and private hire work as a sole trader.",
            "Counts: property income, such as rent. If you own a property jointly, your share counts.",
            "Does not count: wages from a job taxed through PAYE.",
            "Does not count: dividends, the State Pension or a private pension.",
            "Does not count: your share of profit from a partnership. It still goes on your tax return.",
          ],
          after: [
            "It is your total self-employment income, so if you drive for more than one app, or have a second business, it all adds up to one figure.",
          ],
        },
        {
          heading: "Worked examples for drivers",
          body: [
            "These use round numbers to show how the rules work. Your own position depends on your actual return.",
          ],
          table: {
            caption: "Examples",
            head: ["Driver", "Qualifying income", "What it means"],
            rows: [
              [
                "Deliveroo rider. 2025-26 turnover £34,000, costs including mileage £12,000, profit £22,000.",
                "£34,000. Costs do not come off.",
                "Over £30,000 in 2025-26, so Making Tax Digital from 6 April 2027.",
              ],
              [
                "Amazon Flex driver with a part-time PAYE job. 2025-26 Flex turnover £26,000, wages £15,000.",
                "£26,000. The wages do not count.",
                "Under £30,000, so not from April 2027. If Flex turnover in 2026-27 is over £20,000, from 6 April 2028.",
              ],
              [
                "Full-time Uber driver. 2024-25 turnover £52,000.",
                "£52,000.",
                "Over £50,000 in 2024-25, so they should have started on 6 April 2026.",
              ],
              [
                "Evri courier who also lets a flat. 2025-26 courier turnover £18,000, rent £14,000.",
                "£32,000. Both kinds of income add up.",
                "Over £30,000 in 2025-26, so from 6 April 2027.",
              ],
            ],
          },
          after: [
            "The Deliveroo rider is the one that catches people out. A profit of £22,000 sounds well under £30,000, but the test is turnover. Keep a running total of what you are paid through the year so the letter, if it comes, is no surprise.",
          ],
        },
        {
          heading: "Who is exempt",
          body: [
            "Some people do not need to use Making Tax Digital for Income Tax. A few exemptions are automatic, including:",
          ],
          list: [
            "Qualifying income of £20,000 or less.",
            "Not having a National Insurance number before the start of the tax year.",
            "Partnerships, which do not need to use it for now.",
          ],
          after: [
            "You can also apply for an exemption if you are digitally excluded. GOV.UK gives examples: your age, a health condition or a disability stops you using a computer, tablet or smartphone, you cannot get internet access at home or at work because of where you are, or you belong to a religious society whose beliefs rule out digital communications.",
            "HMRC will not accept, on their own: that you filed on paper before, that you do not know accounting software, that you have only a few records, or that it takes extra time or money. You apply by calling or writing to HMRC Self Assessment general enquiries, and HMRC aims to reply within 28 days.",
            "If you are exempt, you still send a normal Self Assessment tax return.",
          ],
        },
        {
          heading: "Before you can sign up",
          body: [
            "To sign up you need to be registered for Self Assessment and to have sent a tax return in the last 2 years. You sign up on GOV.UK.",
            "If your income later drops, you can stop once your qualifying income has been under the relevant limit for 3 tax years in a row. The option shows in your HMRC online account when you are eligible.",
          ],
        },
        {
          heading: "How MileClear helps",
          body: [
            "MileClear is a mileage tracking app for UK drivers. It tracks your trips in the background and keeps your earnings and expenses in one place, so you can see your turnover for the year as you go. Tracking, earnings and expenses are free.",
            "If you are in Making Tax Digital, Pro drivers can send the quarterly update for their self-employment income to HMRC from the app. The end-of-year tax return is not sent from MileClear yet.",
          ],
        },
      ]}
      faqs={[
        {
          question: "Do I need Making Tax Digital for Income Tax?",
          answer:
            "If your qualifying income was over £50,000 in 2024-25, you should have started on 6 April 2026. Over £30,000 in 2025-26 means from 6 April 2027. Over £20,000 in 2026-27 means from 6 April 2028.",
        },
        {
          question: "Is the threshold based on profit or turnover?",
          answer:
            "Turnover. Qualifying income is your self-employment and property income before expenses. A driver with £34,000 of income and £12,000 of costs has qualifying income of £34,000.",
        },
        {
          question: "Do my PAYE wages count towards the threshold?",
          answer:
            "No. Wages from employment, dividends and pensions do not count towards qualifying income.",
        },
        {
          question: "Which tax year decides when I start?",
          answer:
            "Your 2024-25 return decided the April 2026 start. Your 2025-26 return decides the April 2027 start, and your 2026-27 return the April 2028 start.",
        },
        {
          question: "Will HMRC tell me if I need to use it?",
          answer:
            "HMRC writes if your income is over the limit. If you do not get a letter, it is still your responsibility to check.",
        },
        {
          question: "I am under £20,000. Do I need it?",
          answer:
            "No. Qualifying income of £20,000 or less is an automatic exemption. You keep filing a normal Self Assessment tax return.",
        },
        {
          question: "Can I get an exemption if I am not good with computers?",
          answer:
            "Not for that reason alone. HMRC accepts digital exclusion where your age, health or a disability stops you using a computer, tablet or smartphone, where you cannot get internet access because of your location, or for certain religious beliefs. Being unfamiliar with software is not enough on its own.",
        },
      ]}
      caution={{
        title: "Turnover, not profit",
        body: "Drivers have high costs, so profit can sit well under the limit while turnover is over it. The limit is tested on turnover. Add up what you were paid, not what you kept.",
      }}
      cta={{
        href: "/app?from=seo-mtd-do-i-need",
        label: "Get the MileClear app",
        note: "Free to start on iPhone and Android.",
      }}
      links={[
        { href: "/mtd-quarterly-update-deadlines", label: "MTD quarterly update deadlines", primary: true },
        { href: "/mtd-late-submission-penalties", label: "MTD late submission penalties" },
        { href: "/mtd-itsa-software-for-sole-traders", label: "MTD software for sole traders" },
        { href: "/making-tax-digital-delivery-drivers", label: "Making Tax Digital for delivery drivers" },
        { href: "/updates/making-tax-digital-self-employed-drivers", label: "MTD for self-employed drivers" },
        { href: "/updates/quarterly-updates-to-hmrc", label: "Sending quarterly updates from MileClear" },
        { href: "/hmrc-mileage-rates", label: "HMRC mileage rates" },
        { href: "/self-employed-mileage-tracker", label: "Self-employed mileage tracker" },
        {
          href: "https://www.gov.uk/guidance/find-out-if-and-when-you-need-to-use-making-tax-digital-for-income-tax",
          label: "GOV.UK: find out if you need it",
        },
        {
          href: "https://www.gov.uk/guidance/work-out-your-qualifying-income-for-making-tax-digital-for-income-tax",
          label: "GOV.UK: qualifying income",
        },
      ]}
    />
  );
}
