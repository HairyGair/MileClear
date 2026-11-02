import type { Metadata } from "next";
import GuideLayout from "@/components/guides/GuideLayout";

// Every date and rule here was checked against GOV.UK on 2 Nov 2026:
// gov.uk/guidance/use-making-tax-digital-for-income-tax/send-quarterly-updates
// (updated 16 Oct 2026), .../submit-your-tax-return (16 Oct 2026) and
// gov.uk/guidance/penalties-for-making-tax-digital-for-income-tax (30 Mar 2026).

export const metadata: Metadata = {
  title: "Making Tax Digital Quarterly Update Deadlines 2026-27",
  description:
    "The four Making Tax Digital for Income Tax quarterly update deadlines for 2026-27: 7 August, 7 November, 7 February and 7 May. Which dates each update covers, the 1 April option, sending early, and the 31 January tax return deadline.",
  alternates: {
    canonical: "https://mileclear.com/mtd-quarterly-update-deadlines",
  },
  openGraph: {
    title: "MTD Quarterly Update Deadlines 2026-27 | MileClear",
    description:
      "7 August, 7 November, 7 February, 7 May. Every Making Tax Digital quarterly update deadline for 2026-27 in one table, in plain English.",
    url: "https://mileclear.com/mtd-quarterly-update-deadlines",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MTD Quarterly Update Deadlines 2026-27 | MileClear",
    description:
      "Every Making Tax Digital quarterly update deadline for 2026-27, and what each update covers.",
    images: ["/branding/og-image.png"],
  },
};

export default function MtdQuarterlyUpdateDeadlinesPage() {
  return (
    <GuideLayout
      eyebrow="Making Tax Digital"
      title="Making Tax Digital quarterly update deadlines 2026-27"
      standfirst="If you are in Making Tax Digital for Income Tax, you send HMRC a quarterly update four times a year. Here is every deadline for the 2026-27 tax year, and what each update needs to cover."
      path="/mtd-quarterly-update-deadlines"
      updated="2 November 2026"
      shortAnswer={[
        "The quarterly update deadlines are the 7th of August, November, February and May. For 2026-27 that is 7 August 2026, 7 November 2026, 7 February 2027 and 7 May 2027.",
        "The next one after this page was updated is 7 November 2026, which is a Saturday. It covers your income and costs from 6 April to 5 October 2026.",
        "A quarterly update is a summary of your income and costs so far. It is not a tax return and it is not a bill. Your tax return for 2026-27 is still due by 31 January 2028.",
      ]}
      sections={[
        {
          heading: "The four deadlines for 2026-27",
          body: [
            "The tax year runs from 6 April to 5 April. HMRC splits it into four quarters, and each quarterly update is due on the 7th of the month after the quarter ends.",
          ],
          table: {
            caption: "Standard quarters, tax year 2026-27",
            head: ["Quarter", "Update covers", "Deadline"],
            rows: [
              ["6 April to 5 July 2026", "6 April to 5 July 2026", "7 August 2026"],
              ["6 July to 5 October 2026", "6 April to 5 October 2026", "7 November 2026"],
              ["6 October 2026 to 5 January 2027", "6 April 2026 to 5 January 2027", "7 February 2027"],
              ["6 January to 5 April 2027", "6 April 2026 to 5 April 2027", "7 May 2027"],
            ],
          },
          after: [
            "Look at the middle column. Each update gives HMRC your totals for the tax year so far, not just the three months that have passed. That is how you fix a mistake from an earlier quarter: correct your records, and the right figure goes in with your next update.",
            "If you had no income and no costs in a quarter, you still send the update to tell HMRC.",
          ],
        },
        {
          heading: "If your accounts run from 1 April",
          body: [
            "GOV.UK says that if your accounting period runs from 1 April to 31 March, you use calendar update periods instead. The quarters then start on the 1st of the month. The deadlines do not change.",
          ],
          table: {
            caption: "Calendar update periods, tax year 2026-27",
            head: ["Quarter", "Update covers", "Deadline"],
            rows: [
              ["1 April to 30 June 2026", "1 April to 30 June 2026", "7 August 2026"],
              ["1 July to 30 September 2026", "1 April to 30 September 2026", "7 November 2026"],
              ["1 October to 31 December 2026", "1 April to 31 December 2026", "7 February 2027"],
              ["1 January to 31 March 2027", "1 April 2026 to 31 March 2027", "7 May 2027"],
            ],
          },
          after: [
            "Most self-employed drivers keep their books to the tax year, 6 April to 5 April, so the standard quarters above are the ones they use. If you are not sure which applies to you, ask your accountant or check your HMRC online account.",
          ],
        },
        {
          heading: "Sending early",
          body: [
            "You do not have to wait for the quarter to end. GOV.UK says you can send an update up to 10 days before the end of the update period, if you do not expect to record anything else for it.",
            "For the quarter ending 5 October, that means you could send from late September onwards. Sending early is fine, and if something comes in after you sent it, it goes into your next update because each one carries your totals for the year so far.",
          ],
        },
        {
          heading: "What a quarterly update is, and is not",
          body: [
            "A quarterly update is a running total of your business income and your business costs for the tax year so far. You send it from software that works with Making Tax Digital. A spreadsheet on its own cannot send it.",
            "It is not a tax return, and you do not pay anything when you send it. Your payment dates do not change under Making Tax Digital. After you send an update, you can see an estimate of your tax so far, which helps you put money aside.",
            "For a driver, the costs usually include your mileage claim. For 2026-27 that is 55p a mile for the first 10,000 business miles in a car or van, then 25p a mile. A motorbike is 24p a mile.",
          ],
        },
        {
          heading: "The end of the year: your tax return by 31 January",
          body: [
            "The four quarterly updates do not finish the year. You still submit a tax return for 2026-27, by 31 January 2028. That is where you add anything the updates did not cover, such as wages from a job or bank interest, and confirm your figures.",
            "The deadline to pay any tax you owe for the year is also 31 January after the tax year ends.",
          ],
        },
        {
          heading: "What happens if you miss a quarterly deadline in 2026-27",
          body: [
            "HMRC has said there are no penalties for missing a quarterly update deadline for the 2026-27 tax year. You still need to send all of them before you can submit your tax return, so a missed one has to be sent in the end.",
            "From the 2027-28 tax year, each missed quarterly update deadline earns a penalty point. Reach 4 points and you get a £200 penalty.",
          ],
        },
        {
          heading: "Sending your updates from MileClear",
          body: [
            "MileClear is a mileage tracking app for UK drivers. It tracks your trips, and you can add your earnings and expenses as you go.",
            "Pro drivers can connect their HMRC account in the app, see which quarters are due, check the figures and send the quarterly update for their self-employment income to HMRC. You need to have signed up for Making Tax Digital with HMRC first. The end-of-year tax return is not sent from MileClear yet, so you file that on GOV.UK, through other software or through your accountant.",
          ],
        },
      ]}
      faqs={[
        {
          question: "When are the Making Tax Digital quarterly update deadlines?",
          answer:
            "7 August, 7 November, 7 February and 7 May. For the 2026-27 tax year that is 7 August 2026, 7 November 2026, 7 February 2027 and 7 May 2027.",
        },
        {
          question: "What does the 7 November update cover?",
          answer:
            "With standard quarters, it covers your income and costs from 6 April to 5 October 2026. Each update gives your totals for the tax year so far.",
        },
        {
          question: "Can I send my quarterly update early?",
          answer:
            "Yes. GOV.UK says you can send it up to 10 days before the end of the update period, if you do not expect to record anything else for that period.",
        },
        {
          question: "Is a quarterly update a tax bill?",
          answer:
            "No. It is a summary of your income and costs so far. You do not pay when you send it, and your payment dates do not change. You can see an estimate of your tax after you send it.",
        },
        {
          question: "Do I still need to do a tax return?",
          answer:
            "Yes. After the four quarterly updates you submit a tax return for the year. For 2026-27 it is due by 31 January 2028.",
        },
        {
          question: "What if I had no income in a quarter?",
          answer: "You still send the quarterly update, to tell HMRC there was nothing to report.",
        },
        {
          question: "Will I get a penalty for a late quarterly update in 2026-27?",
          answer:
            "HMRC has said there are no penalties for missing a quarterly update deadline for the 2026-27 tax year. You still need to send every update before you can submit your tax return. Penalty points for late quarterly updates start from the 2027-28 tax year.",
        },
        {
          question: "Can MileClear send my quarterly update?",
          answer:
            "Yes, for self-employment income, on Pro. You need to sign up for Making Tax Digital with HMRC first. The end-of-year tax return is not sent from MileClear yet.",
        },
      ]}
      caution={{
        title: "Do not leave it to the 7th",
        body: "The first time you connect any software to HMRC, signing in and checking your details takes a while. Give yourself a few days before the deadline, not a few minutes.",
      }}
      cta={{
        href: "/app?from=seo-mtd-deadlines",
        label: "Get the MileClear app",
        note: "Free to start on iPhone and Android. Sending quarterly updates is part of Pro.",
      }}
      links={[
        { href: "/mtd-itsa-software-for-sole-traders", label: "MTD software for sole traders", primary: true },
        { href: "/updates/quarterly-updates-to-hmrc", label: "Sending quarterly updates from MileClear" },
        { href: "/updates/making-tax-digital-self-employed-drivers", label: "MTD for self-employed drivers" },
        { href: "/hmrc-mileage-rates", label: "HMRC mileage rates" },
        { href: "/self-employed-mileage-tracker", label: "Self-employed mileage tracker" },
        {
          href: "https://www.gov.uk/guidance/use-making-tax-digital-for-income-tax/send-quarterly-updates",
          label: "GOV.UK: send quarterly updates",
        },
      ]}
    />
  );
}
