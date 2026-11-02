import type { Metadata } from "next";
import GuideLayout from "@/components/guides/GuideLayout";

// Checked against GOV.UK on 2 Nov 2026:
// gov.uk/guidance/penalties-for-making-tax-digital-for-income-tax (30 Mar 2026)
// gov.uk/guidance/use-making-tax-digital-for-income-tax/send-quarterly-updates (16 Oct 2026)
// The 2026-27 easement covers late quarterly updates only. Late tax returns
// and late payments are still penalised in 2026-27.

export const metadata: Metadata = {
  title: "Making Tax Digital Late Submission Penalties: Points, £200 and 2026-27",
  description:
    "How Making Tax Digital for Income Tax penalties work: a point for each missed deadline, a £200 penalty at 4 points, how points expire, late payment penalties, and why late quarterly updates in 2026-27 get no penalty.",
  alternates: {
    canonical: "https://mileclear.com/mtd-late-submission-penalties",
  },
  openGraph: {
    title: "MTD Late Submission Penalties Explained | MileClear",
    description:
      "Penalty points, the £200 penalty, how points come off, late payment penalties, and the 2026-27 rule for late quarterly updates.",
    url: "https://mileclear.com/mtd-late-submission-penalties",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MTD Late Submission Penalties Explained | MileClear",
    description:
      "A point per missed deadline, £200 at 4 points, and no penalties for late quarterly updates in 2026-27.",
    images: ["/branding/og-image.png"],
  },
};

export default function MtdLateSubmissionPenaltiesPage() {
  return (
    <GuideLayout
      eyebrow="Making Tax Digital"
      title="Making Tax Digital late submission penalties"
      standfirst="Making Tax Digital for Income Tax comes with a new penalty system. Miss a deadline and you get a point. Collect enough points and you pay £200. Here is how it works, and what is different in the first year."
      path="/mtd-late-submission-penalties"
      updated="2 November 2026"
      shortAnswer={[
        "You get one penalty point for each deadline you miss. When you reach 4 points you get a £200 penalty, and another £200 for each deadline you miss after that.",
        "For the 2026-27 tax year, HMRC has said there are no penalties for missing a quarterly update deadline. Points for late quarterly updates start from 2027-28. A late tax return still earns a point, and paying late still costs you.",
        "Late payment is separate. It is not points based: the penalty depends on how late you pay and how much you owe, and interest runs from the first day the payment is late.",
      ]}
      sections={[
        {
          heading: "How penalty points work",
          body: [
            "The new penalties replace the old late filing and late payment penalties on your personal tax return. They apply from the tax year you join Making Tax Digital for Income Tax.",
          ],
          list: [
            "Each quarterly update deadline you miss earns one point (for tax years after 2026-27).",
            "Each tax return deadline you miss earns one point.",
            "You only get one point per deadline, even if you have more than one business.",
            "At 4 points you get a £200 penalty.",
            "Each deadline you miss after that brings another £200 penalty.",
          ],
          after: [
            "Points for Making Tax Digital for Income Tax are kept separately from any VAT penalty points.",
          ],
        },
        {
          heading: "The 2026-27 rule for late quarterly updates",
          body: [
            "GOV.UK says there are no penalties for missing a quarterly update deadline for the 2026-27 tax year. That covers the updates due on 7 August 2026, 7 November 2026, 7 February 2027 and 7 May 2027.",
            "That does not mean you can skip them. You still need to keep digital records and send your quarterly updates before you can submit your tax return. The tax return for 2026-27 is due by 31 January 2028, and missing that deadline does earn a point.",
          ],
        },
        {
          heading: "An example for a driver",
          body: [
            "Say a courier is in Making Tax Digital from April 2026 and sends quarterly updates.",
          ],
          table: {
            caption: "How points could build up",
            head: ["What happens", "Points", "Penalty"],
            rows: [
              ["Sends the 7 November 2026 update a week late", "0", "None. 2026-27 quarterly updates have no penalties."],
              ["Misses the 7 August 2027 update deadline", "1", "None yet"],
              ["Misses the 7 November 2027 deadline", "2", "None yet"],
              ["Misses the 7 February 2028 deadline", "3", "None yet"],
              ["Misses the 7 May 2028 deadline", "4", "£200"],
              ["Misses the next deadline too", "4", "Another £200"],
            ],
          },
          after: [
            "Each missed update still has to be sent. A penalty does not replace the update.",
          ],
        },
        {
          heading: "How points come off",
          body: [
            "If you are below 4 points, HMRC removes each point automatically 24 months after the deadline you missed.",
            "Once you have reached 4 points, they do not come off on their own. To clear them all, you need to do both of these:",
          ],
          list: [
            "Send your quarterly updates and submit your tax return on time for 12 months.",
            "Send any quarterly updates and tax returns that were outstanding from the previous 24 months.",
          ],
          after: [
            "In some exceptional circumstances, such as insolvency, HMRC may cancel a penalty or a point. If you get a penalty letter and disagree, the letter explains how to appeal.",
          ],
        },
        {
          heading: "Late payment penalties",
          body: [
            "Paying late is penalised separately, and these penalties are not points based. They apply to each payment not paid in full by its due date. They do not apply to payments on account. Making Tax Digital does not change when your tax is due.",
          ],
          table: {
            caption: "Late payment penalties",
            head: ["How late", "Tax year 2026-27", "Tax year 2027-28"],
            rows: [
              ["Up to 15 days", "No penalty", "No penalty"],
              [
                "16 to 30 days",
                "3% of the tax owed at day 15, or no penalty in your first year",
                "4% of the tax owed at day 15, or no penalty in your first year",
              ],
              [
                "31 days or more",
                "3% of the tax owed at day 15 and 3% at day 30, plus 10% a year on what is still owed, charged daily from day 31",
                "4% of the tax owed at day 15 and 4% at day 30, plus 10% a year on what is still owed, charged daily from day 31",
              ],
            ],
          },
          after: [
            "In your first year of the new penalties, you have 30 days from the due date to pay in full or contact HMRC to set up a payment plan before penalties start. After the first year this drops to 15 days. You only get the 30 days once. GOV.UK says that if you volunteered first and are now required to use Making Tax Digital, you keep 15 days.",
            "The 10% yearly charge from day 31 runs until the tax is paid, for up to 2 years.",
            "On top of any penalty, HMRC charges late payment interest from the first day your payment is late until you pay in full.",
          ],
        },
        {
          heading: "If you cannot pay on time",
          body: [
            "Contact HMRC as soon as you can about a payment plan, so you can pay in instalments. If a plan is agreed and you keep up the payments, penalties are paused from the date you contacted HMRC. You can still be charged if a plan cannot be agreed or you do not stick to it.",
          ],
        },
        {
          heading: "If you volunteered",
          body: [
            "If you joined Making Tax Digital for Income Tax as a volunteer, before you had to, GOV.UK says penalties do not apply to late quarterly updates while you are volunteering. HMRC has a separate penalties page for volunteers, so check that one if it applies to you.",
          ],
        },
        {
          heading: "Staying on time with MileClear",
          body: [
            "MileClear is a mileage tracking app for UK drivers. Pro drivers can connect their HMRC account, see which quarterly updates are due and send the update for their self-employment income to HMRC from the app.",
            "The end-of-year tax return is not sent from MileClear yet, so you file that on GOV.UK, through other software or through your accountant. Its deadline still counts for points.",
          ],
        },
      ]}
      faqs={[
        {
          question: "What is the penalty for a late Making Tax Digital quarterly update?",
          answer:
            "From the 2027-28 tax year, each missed quarterly update deadline earns one penalty point. At 4 points you get a £200 penalty, then another £200 for each further missed deadline. For 2026-27, HMRC has said there are no penalties for missing a quarterly update deadline.",
        },
        {
          question: "Is there a penalty for a late quarterly update in 2026-27?",
          answer:
            "No. GOV.UK says there are no penalties for missing a quarterly update deadline for the 2026-27 tax year. You still need to send every update before you can submit your tax return.",
        },
        {
          question: "Does a late tax return earn a penalty point?",
          answer:
            "Yes. Each tax return deadline you miss earns a point. The 2026-27 easement only covers quarterly updates.",
        },
        {
          question: "How long do penalty points last?",
          answer:
            "Below 4 points, each point is removed 24 months after the missed deadline. At 4 points, they are cleared when you have been on time for 12 months and sent anything outstanding from the previous 24 months.",
        },
        {
          question: "How much is the late payment penalty?",
          answer:
            "For 2026-27: nothing up to 15 days late. 3% of the tax owed at day 15 if you pay 16 to 30 days late. At 31 days or more, 3% at day 15 and 3% at day 30, plus 10% a year charged daily from day 31. For 2027-28 the 3% figures become 4%. In your first year you have 30 days to pay or set up a payment plan before penalties start.",
        },
        {
          question: "Do late payment penalties apply to payments on account?",
          answer: "No. GOV.UK says late payment penalties do not apply to payments on account.",
        },
        {
          question: "Can I appeal a penalty?",
          answer:
            "Yes. HMRC sends a letter for a penalty point, a £200 penalty or a late payment penalty, and the letter explains how to appeal if you disagree.",
        },
      ]}
      caution={{
        title: "No penalty is not the same as optional",
        body: "In 2026-27 a late quarterly update costs nothing, but you cannot submit your tax return until all four are in. Leaving them all to January 2028 means doing a year of updates in a hurry before a deadline that does count.",
      }}
      cta={{
        href: "/app?from=seo-mtd-penalties",
        label: "Get the MileClear app",
        note: "Free to start on iPhone and Android. Sending quarterly updates is part of Pro.",
      }}
      links={[
        { href: "/mtd-quarterly-update-deadlines", label: "MTD quarterly update deadlines", primary: true },
        { href: "/do-i-need-making-tax-digital", label: "Do I need Making Tax Digital?" },
        { href: "/mtd-itsa-software-for-sole-traders", label: "MTD software for sole traders" },
        { href: "/self-assessment-delivery-drivers", label: "Self Assessment for delivery drivers" },
        { href: "/updates/quarterly-updates-to-hmrc", label: "Sending quarterly updates from MileClear" },
        { href: "/updates/making-tax-digital-self-employed-drivers", label: "MTD for self-employed drivers" },
        { href: "/hmrc-mileage-rates", label: "HMRC mileage rates" },
        { href: "/self-employed-mileage-tracker", label: "Self-employed mileage tracker" },
        {
          href: "https://www.gov.uk/guidance/penalties-for-making-tax-digital-for-income-tax",
          label: "GOV.UK: MTD penalties",
        },
      ]}
    />
  );
}
