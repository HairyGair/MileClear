import type { Metadata } from "next";
import GuideLayout from "@/components/guides/GuideLayout";

// Checked on 6 Nov 2026 against HM Treasury, "The introduction of Electric
// Vehicle Excise Duty (eVED)", government consultation response, July 2026:
// 3p per mile electric, 1.5p per mile plug-in hybrid, from April 2028; cars
// only (vans, buses, coaches, HGVs, M1SP special vehicles and converted cars
// out of scope); hydrogen at the EV rate, range extenders at the PHEV rate;
// estimate and odometer reading at each VED renewal, reconciled at the MOT;
// no extra checks for cars under 3 years old; top-ups, credit carried forward,
// hardship refunds over £100; same payment options as VED; CPI uprating from
// 2029-30; no charge based on where you drive; business tax treatment as VED
// (simplified mileage rates cover eVED). Draft legislation, not yet law.

export const metadata: Metadata = {
  title: "Pay-Per-Mile Tax for Electric Cars (eVED): 3p a Mile from April 2028",
  description:
    "How the new pay-per-mile tax on electric and plug-in hybrid cars works: 3p a mile for electric, 1.5p for plug-in hybrids, from April 2028. Estimating your miles, odometer checks at the MOT, top-ups, examples for drivers, and what it means for your mileage claim.",
  alternates: {
    canonical: "https://mileclear.com/ev-pay-per-mile-tax",
  },
  openGraph: {
    title: "Pay-Per-Mile Tax for Electric Cars (eVED) Explained | MileClear",
    description:
      "3p a mile for electric cars and 1.5p for plug-in hybrids from April 2028. How the estimate, the odometer check and the payments work, with examples.",
    url: "https://mileclear.com/ev-pay-per-mile-tax",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pay-Per-Mile Tax for Electric Cars (eVED) Explained | MileClear",
    description:
      "3p a mile for electric cars, 1.5p for plug-in hybrids, from April 2028. How it works and what it costs.",
    images: ["/branding/og-image.png"],
  },
};

export default function EvPayPerMileTaxPage() {
  return (
    <GuideLayout
      eyebrow="Electric cars"
      title="Pay-per-mile tax for electric cars (eVED)"
      standfirst="From April 2028, electric and plug-in hybrid cars will pay a tax on every mile they drive, on top of normal car tax. Here is what it costs, how the government will know your mileage, and what it means if you claim mileage for work."
      path="/ev-pay-per-mile-tax"
      updated="6 November 2026"
      shortAnswer={[
        "Electric Vehicle Excise Duty (eVED) starts in April 2028. Fully electric cars will pay 3p a mile and plug-in hybrids 1.5p a mile.",
        "Each time you renew your car tax, you give your odometer reading and estimate how many miles you will drive in the year ahead. You pay for those miles monthly, every six months or once a year, the same way as car tax.",
        "Your estimate is checked against the odometer reading taken at your MOT. If you drove more, you pay the difference. If you drove less, the unused miles carry over to the next year.",
        "There is no tracking box and no charge based on where you drive. The government has said the tax only looks at how many miles you do.",
      ]}
      sections={[
        {
          heading: "Who pays it",
          body: [
            "eVED covers cars registered in the UK that are fully electric or plug-in hybrid.",
          ],
          table: {
            caption: "Which cars pay, and how much",
            head: ["Type of car", "Rate from April 2028"],
            rows: [
              ["Fully electric car", "3p a mile"],
              ["Hydrogen fuel cell car", "3p a mile"],
              ["Plug-in hybrid", "1.5p a mile"],
              ["Range extender (electric with a small engine that only charges the battery)", "1.5p a mile"],
              ["Petrol or diesel car, including hybrids you can't plug in", "Not included. These pay fuel duty when you fill up."],
              ["Vans, buses, coaches and lorries, including electric ones", "Not included when the tax starts"],
              ["Petrol or diesel cars converted to electric", "Not included when the tax starts"],
              ["Special purpose cars such as hearses and campervans", "Not included"],
            ],
          },
          after: [
            "The government chose a lower rate for plug-in hybrids rather than asking drivers to report how many miles they did on battery and how many on petrol. You pay the same 1.5p a mile however you drive it.",
            "Every mile counts, including personal miles and miles driven abroad. The government decided against charging based on where you drive, to protect drivers' privacy.",
          ],
        },
        {
          heading: "How you estimate and pay",
          body: [
            "eVED runs through the car tax system you already use with DVLA. When your car tax is due:",
          ],
          list: [
            "You give the reading on your odometer.",
            "You estimate how many miles you will drive in the next year. The government has said it will publish guidance and tools to help with this.",
            "DVLA works out what you owe for those miles.",
            "You pay monthly, every six months or once a year, online or at the Post Office, the same as car tax.",
          ],
          after: [
            "If you realise part way through the year that you are going to drive more than you estimated, you can top up your miles. Topping up early avoids a large bill at the end.",
          ],
        },
        {
          heading: "How your miles are checked",
          body: [
            "At the end of the year, your new odometer reading is compared with your estimate. A garage records your odometer reading at each MOT, and that reading backs up the check.",
            "The government dropped its plan for extra mileage checks on cars under 3 years old, which don't have an MOT yet. For those cars, the check happens at the first MOT. DVLA can still ask for an official mileage check if it suspects a false reading.",
          ],
          list: [
            "Drove more than you estimated: you pay for the extra miles at the rate that applies at the time.",
            "Drove fewer: the unused miles normally carry over and come off next year's bill.",
            "Money suddenly tight: you can ask DVLA for a refund if it is over £100, your finances have changed unexpectedly and you are at risk of hardship. You declare this yourself on a short form.",
          ],
          after: [
            "The government also plans to make tampering with an odometer an offence, and to require every car to have an odometer that works.",
          ],
        },
        {
          heading: "What it could cost you",
          body: [
            "These figures use the April 2028 rates. From 2029-30 the rates go up with inflation each year.",
          ],
          table: {
            caption: "Yearly eVED at the April 2028 rates",
            head: ["Miles a year", "Electric car (3p)", "Plug-in hybrid (1.5p)"],
            rows: [
              ["5,000", "£150", "£75"],
              ["8,000", "£240", "£120"],
              ["10,000", "£300", "£150"],
              ["15,000", "£450", "£225"],
              ["20,000", "£600", "£300"],
              ["30,000", "£900", "£450"],
            ],
          },
          after: [
            "A delivery driver doing 20,000 miles a year in an electric car would pay £600, or £50 a month. A petrol car doing the same miles pays far more than that in fuel duty, which is the gap the government says it wants to keep.",
          ],
        },
        {
          heading: "If you claim mileage for work",
          body: [
            "The government has said eVED will be treated the same way as car tax for income tax.",
          ],
          list: [
            "Using the HMRC mileage rates (55p a mile for the first 10,000 business miles): eVED is already covered by the rate, so you can't claim it on top. This is how most self-employed drivers claim.",
            "Claiming your actual costs instead: the business share of your eVED counts as a business cost, in the same way as the business share of your car tax.",
            "Driving for an employer: if your employer pays you a mileage rate, check whether it is going to change. HMRC's mileage rates cover all running costs, including eVED.",
          ],
          after: [
            "Either way, you pay eVED on all your miles, business and personal. Only the tax relief depends on your business miles.",
          ],
        },
        {
          heading: "What isn't decided yet",
          body: [
            "The rates, the start date and how it works were confirmed in the government's July 2026 response to the consultation. Draft legislation has been published, but it isn't law yet, so details could still change before April 2028. Still to come:",
          ],
          list: [
            "The guidance and tools for estimating your miles.",
            "The final penalties and how appeals will work.",
            "Refunds when you sell your car or it leaves the road.",
            "An optional way to let your car report its own mileage for you, for drivers who choose it.",
          ],
          after: [
            "We will update this page when the government publishes more.",
          ],
        },
        {
          heading: "Knowing your miles with MileClear",
          body: [
            "MileClear is a mileage tracking app for UK drivers. It records your drives on its own, work and personal, so you can see how many miles you really do in a year before you have to estimate them. You can keep your car's odometer reading on Home.",
            "MileClear doesn't work out eVED for you yet. We plan to add it before April 2028.",
          ],
        },
      ]}
      faqs={[
        {
          question: "When does the pay-per-mile tax for electric cars start?",
          answer:
            "April 2028. The government confirmed the start date in its July 2026 response to the consultation.",
        },
        {
          question: "How much is eVED per mile?",
          answer:
            "3p a mile for fully electric and hydrogen cars, and 1.5p a mile for plug-in hybrids and range extenders. The rates go up with inflation from 2029-30.",
        },
        {
          question: "Do I still pay normal car tax on an electric car?",
          answer:
            "Yes. eVED is on top of standard car tax (Vehicle Excise Duty), which electric cars have paid since April 2025. You pay both through DVLA.",
        },
        {
          question: "Will the government track where I drive?",
          answer:
            "No. The government has ruled out charging based on where you drive. It uses your odometer reading, checked at your MOT. Letting your car report its mileage automatically will be optional.",
        },
        {
          question: "Do hybrids pay eVED?",
          answer:
            "Plug-in hybrids pay 1.5p a mile. Hybrids you can't plug in are treated as petrol or diesel cars and don't pay eVED. They pay fuel duty when you fill up.",
        },
        {
          question: "Do electric vans pay eVED?",
          answer:
            "No, not when it starts. Vans, buses, coaches and lorries are out of scope at first, because fewer of them are electric so far.",
        },
        {
          question: "What if I drive more miles than I estimated?",
          answer:
            "You can top up during the year. If you don't, you pay a balancing payment for the extra miles when your estimate is checked against your odometer reading.",
        },
        {
          question: "Can I claim eVED as a business expense?",
          answer:
            "If you claim actual costs, the business share counts, the same as car tax. If you use HMRC's mileage rates, eVED is already covered by the rate, so you can't claim it as well.",
        },
      ]}
      caution={{
        title: "Not law yet",
        body: "This page follows the government's July 2026 consultation response and its draft legislation. The final rules could change before April 2028. Check GOV.UK before you make a decision based on them.",
      }}
      cta={{
        href: "/app?from=seo-eved",
        label: "Get the MileClear app",
        note: "Free on iPhone and Android. Know your real yearly miles before you have to estimate them.",
      }}
      links={[
        { href: "/ev-mileage-tracker", label: "Mileage tracker for electric cars", primary: true },
        { href: "/ev-tax-relief", label: "EV tax relief guide" },
        { href: "/hmrc-mileage-rates", label: "HMRC mileage rates" },
        { href: "/mileage-or-actual-costs", label: "Mileage or actual costs?" },
        { href: "/self-employed-mileage-tracker", label: "Self-employed mileage tracker" },
        {
          href: "https://www.gov.uk/government/consultations/consultation-on-the-introduction-of-electric-vehicle-excise-duty-eved",
          label: "GOV.UK: eVED consultation and response",
        },
      ]}
    />
  );
}
