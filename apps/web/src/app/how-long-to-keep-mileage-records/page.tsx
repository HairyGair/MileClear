import type { Metadata } from "next";
import GuideLayout from "@/components/guides/GuideLayout";

export const metadata: Metadata = {
  title: "How Long to Keep Mileage Records (UK)",
  description:
    "Five years after the filing deadline if you are self-employed, 22 months after the tax year if you are employed, six years for a company. What a mileage record has to contain, and when digital is required.",
  alternates: {
    canonical: "https://mileclear.com/how-long-to-keep-mileage-records",
  },
  openGraph: {
    title: "How Long to Keep Mileage Records | MileClear",
    description:
      "The retention periods for self-employed drivers, employees and companies, and what a record has to contain to be worth keeping.",
    url: "https://mileclear.com/how-long-to-keep-mileage-records",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "How Long to Keep Mileage Records | MileClear",
    description: "UK retention periods for mileage records, and what a usable record contains.",
    images: ["/branding/og-image.png"],
  },
};

export default function HowLongToKeepRecordsPage() {
  return (
    <GuideLayout
      eyebrow="Record keeping"
      title="How long to keep your mileage records"
      standfirst="Long enough that HMRC can still ask, which is longer than most people assume and depends on which sort of taxpayer you are."
      path="/how-long-to-keep-mileage-records"
      shortAnswer={[
        "Self-employed: at least five years after the 31 January filing deadline for that tax year. Employed and claiming relief: 22 months after the end of the tax year. A limited company: six years from the end of the accounting period.",
        "In practice that means a self-employed driver keeping records for the 2026-27 tax year, whose return is due on 31 January 2028, needs them until 31 January 2033. Nearly six years after the driving happened.",
        "Digital counts. A spreadsheet, an app, or photographs of a paper book are all fine, and under Making Tax Digital the records have to be digital anyway.",
      ]}
      sections={[
        {
          heading: "The three answers",
          body: [
            "Which one applies to you depends on how the mileage reaches a tax return, not on what you drive.",
          ],
          list: [
            "Self-employed, sole trader or partner: five years after the 31 January submission deadline for the relevant tax year. This is the longest of the three and the one most drivers fall under.",
            "Employed, claiming Mileage Allowance Relief: 22 months after the end of the tax year the claim relates to. For 2026-27, which ends on 5 April 2027, that is 31 January 2029.",
            "Limited company: six years from the end of the accounting period the records cover.",
          ],
          after: [
            "If you filed late, the clock is longer: keep everything until at least fifteen months after you actually filed. If HMRC opens an enquiry, keep everything until the enquiry is settled, whatever the normal period would have said.",
          ],
        },
        {
          heading: "What a mileage record has to contain",
          body: [
            "There is no prescribed HMRC form, which is why the question gets asked so often. What matters is that the record supports the figure on the return.",
          ],
          list: [
            "The date of the journey.",
            "Where it started and where it finished. A postcode or a place name is enough; a customer name on its own is not, unless you can still say where that is years later.",
            "The reason it was for work. A client name, a job number, a delivery reference.",
            "The miles driven.",
            "Which vehicle, if you use more than one.",
          ],
          after: [
            "Keep your total annual mileage too, not only the business part. If HMRC asks what proportion of your driving was for work, the answer is far easier to give when you already know both numbers.",
          ],
        },
        {
          heading: "Why the periods are worth respecting",
          body: [
            "HMRC can open an enquiry into a return up to twelve months after you file it as a matter of course, and considerably longer where a return was careless or deliberately wrong. The retention periods exist so the evidence still exists when the question arrives.",
            "A mileage claim is unusually exposed here, because it is often one of the larger deductions on a driver's return and it is entirely dependent on records you kept yourself. A claim you cannot evidence can be disallowed, with interest and possibly a penalty on top.",
          ],
        },
        {
          heading: "Making Tax Digital changes the format, not the length",
          body: [
            "Making Tax Digital for Income Tax requires records to be kept digitally and updates to be sent quarterly. It does not shorten how long you keep them. A shoebox of receipts is no longer enough on its own; a shoebox of receipts photographed into an app is.",
          ],
        },
      ]}
      faqs={[
        {
          question: "Do I need to keep fuel receipts as well?",
          answer:
            "If you claim the flat rate per mile, no: the mileage log is the record and fuel receipts are not part of the claim. If you claim actual running costs, then yes, the receipts are the claim and need keeping for the same period.",
        },
        {
          question: "Is a photo of a paper mileage book acceptable?",
          answer:
            "Yes. HMRC accepts digital copies of original records. The photograph needs to be legible and you need to still have it, which in practice means somewhere backed up rather than only on a phone.",
        },
        {
          question: "What if I lose the records?",
          answer:
            "Reconstruct what you honestly can from what remains, such as bank statements, job records, or an app's history, and keep a note explaining what happened. An estimate you can explain is better than a gap. An invented figure is a different matter entirely.",
        },
        {
          question: "Does the clock run from the journey or from the return?",
          answer:
            "From the return. That is why the real-world period is nearly six years for a sole trader: the driving happens through the tax year, the return is not due until the following 31 January, and the five years run from there.",
        },
        {
          question: "I have stopped trading. Can I throw them away?",
          answer:
            "Not yet. The retention period runs from the filing deadline for the final return, so ceasing to trade does not reset it.",
        },
      ]}
      caution={{
        title: "The one people forget",
        body: "If you change phone, app or accountant, check the records came with you. The commonest way a mileage log is lost is not a decision to delete it, it is a handset upgrade three years before anybody needs to look at it.",
      }}
      links={[
        { href: "/mileage-claim-form-template", label: "A mileage record template", primary: true },
        { href: "/business-mileage-guide", label: "The business mileage guide" },
        { href: "/what-counts-as-business-mileage", label: "What counts as business mileage" },
      ]}
    />
  );
}
