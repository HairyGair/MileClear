import type { Metadata } from "next";
import GuideLayout from "@/components/guides/GuideLayout";

export const metadata: Metadata = {
  title: "Claiming Mileage as a Limited Company Director",
  description:
    "How a director claims mileage for using their own car on company business: the 55p/25p approved rate paid by the company tax free, what changes when the company owns the car, and reclaiming the VAT.",
  alternates: {
    canonical: "https://mileclear.com/limited-company-mileage",
  },
  openGraph: {
    title: "Limited Company Mileage | MileClear",
    description:
      "Your own car or the company's? The two routes work completely differently, and one of them carries a benefit-in-kind charge.",
    url: "https://mileclear.com/limited-company-mileage",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Limited Company Mileage | MileClear",
    description: "How a director claims mileage, and what changes when the company owns the car.",
    images: ["/branding/og-image.png"],
  },
};

export default function LimitedCompanyMileagePage() {
  return (
    <GuideLayout
      eyebrow="Directors"
      title="Claiming mileage through a limited company"
      standfirst="A director is an employee of their own company, which sounds like a technicality and turns out to decide the whole answer."
      path="/limited-company-mileage"
      shortAnswer={[
        "If you drive your own car on company business, the company pays you the approved mileage rate: 55p a mile for the first 10,000 business miles in the tax year, 25p after that. It is a deductible cost for the company, it is tax free in your hands, and there is no benefit-in-kind charge.",
        "If the company owns the car and you use it privately, none of that applies. The company claims the running costs, and you pick up a benefit-in-kind charge on the private use, which for most ordinary cars costs more than it saves.",
        "For a single-director company the first route is usually the simpler and cheaper one, which is why so many small companies never own a car at all.",
      ]}
      sections={[
        {
          heading: "Your own car, on company business",
          body: [
            "This is the common case and it is straightforward. You keep a mileage log, the company reimburses you at the approved rate, and the payment sits in the accounts as a business expense.",
            "The company can pay less than the approved rate if it wants to, but there is little reason to: the full rate is deductible and tax free. If it does pay less, you can personally claim tax relief on the shortfall.",
            "If the company pays more than the approved rate, the excess is treated as earnings. It goes through payroll, and you pay income tax and National Insurance on it.",
            "There is one extra allowance worth knowing: 5p per passenger per mile where you carry a colleague on the same business trip. The company can pay it tax free. Nobody can claim relief on it if the company does not.",
          ],
        },
        {
          heading: "The company's car instead",
          body: [
            "If the company buys or leases the car and you have use of it privately, the arrangement changes completely. The company claims the running costs and capital allowances, and you are taxed on the benefit of having it available, calculated from the car's list price and its CO2 emissions.",
            "For a conventional petrol or diesel car that charge is substantial, and it is why a company car is often a poor deal for a small company director. Electric cars are treated far more kindly and are the case where a company car can genuinely make sense.",
            "In a company car you do not claim the 55p rate. If you pay for the fuel on business trips yourself, the company can reimburse you at HMRC's advisory fuel rates instead, which are pence-per-mile figures set by engine size and fuel type and updated quarterly.",
          ],
        },
        {
          heading: "Reclaiming the VAT",
          body: [
            "A VAT-registered company can reclaim the VAT on the fuel part of a mileage payment. The approved rate covers everything the car costs, not only fuel, so the reclaim is worked out on the advisory fuel rate for that vehicle rather than on the whole 55p.",
            "HMRC expects you to hold enough fuel receipts to cover the amount reclaimed. They do not have to match the journeys mile for mile, but they do have to exist, and this is a routine thing to be asked for on a VAT inspection.",
          ],
        },
        {
          heading: "What the paperwork needs to look like",
          body: [
            "A director's mileage claim is a transaction between two parties who happen to be the same person, which is exactly why it is worth documenting properly.",
          ],
          list: [
            "A mileage log with dates, routes, purpose and miles, the same as any employee would keep.",
            "A claim, even a simple monthly one, showing the miles and the rate applied.",
            "A payment from the company to you that matches it, rather than a round number drawn whenever.",
            "The records kept for six years from the end of the accounting period.",
          ],
          after: [
            "The 10,000-mile threshold is per person per tax year, not per company and not per car. Two directors each doing 10,000 business miles each get the higher rate on their own first 10,000.",
          ],
        },
      ]}
      faqs={[
        {
          question: "Can the company pay me mileage for driving to the office?",
          answer:
            "Not if that office is your permanent workplace: ordinary commuting is not business travel, whoever is paying. Travel to clients, suppliers, sites and temporary workplaces does count. If you work from home and your home is genuinely the base of the business, trips out from home are usually business travel.",
        },
        {
          question: "Does it matter whose name the car is in?",
          answer:
            "Yes, that is the whole distinction. A car owned by you personally, used for company business, goes down the approved-rate route. A car owned or leased by the company goes down the benefit-in-kind route.",
        },
        {
          question: "I am the only employee. Is it still worth the paperwork?",
          answer:
            "More so, not less. A payment from your company to you with nothing behind it is the sort of thing an inspection asks about. A mileage log turns it into an ordinary business expense that explains itself.",
        },
        {
          question: "Can I claim both the mileage rate and the fuel?",
          answer:
            "No. The approved rate is meant to cover fuel, insurance, servicing, repairs and depreciation together. Claiming fuel separately on top is double-claiming and is one of the more visible mistakes on a small company's accounts.",
        },
        {
          question: "What about a company van?",
          answer:
            "Vans are treated differently from cars and much more generously. The benefit charge for a van with private use is a flat figure rather than a percentage of list price, and vans qualify for full capital allowances. If the vehicle is genuinely a van, company ownership is a far more sensible proposition than it is for a car.",
        },
      ]}
      caution={{
        title: "Before buying a car through the company",
        body: "This is the decision where an hour of an accountant's time pays for itself several times over. The tax outcome swings enormously on the vehicle's emissions, on how much private use there is, and on whether it is a car or a van in HMRC's eyes. A car bought through a company because it felt like the businesslike thing to do is a common and expensive mistake.",
      }}
      links={[
        { href: "/hmrc-mileage-rates", label: "The approved rates in detail", primary: true },
        { href: "/mileage-allowance-relief", label: "If you are paid under the rate" },
        { href: "/how-long-to-keep-mileage-records", label: "How long to keep records" },
      ]}
    />
  );
}
