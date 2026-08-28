import type { Metadata } from "next";
import GuideLayout from "@/components/guides/GuideLayout";

export const metadata: Metadata = {
  title: "Mileage or Actual Costs: Which Should You Claim?",
  description:
    "Self-employed drivers can claim a flat rate per mile or a share of what the vehicle really costs. How to tell which is worth more, and the lock-in that means you cannot simply swap year to year.",
  alternates: {
    canonical: "https://mileclear.com/mileage-or-actual-costs",
  },
  openGraph: {
    title: "Mileage or Actual Costs? | MileClear",
    description:
      "The flat rate per mile against a share of the real running costs. Which is worth more, and the decision you cannot undo.",
    url: "https://mileclear.com/mileage-or-actual-costs",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mileage or Actual Costs? | MileClear",
    description: "Which way of claiming vehicle costs is worth more, and why the choice sticks.",
    images: ["/branding/og-image.png"],
  },
};

export default function MileageOrActualCostsPage() {
  return (
    <GuideLayout
      eyebrow="Self-employed"
      title="Mileage or actual costs?"
      standfirst="Two ways to claim what your vehicle costs you, and a choice that is harder to reverse than most people realise."
      path="/mileage-or-actual-costs"
      shortAnswer={[
        "If you are self-employed you can either claim a flat rate for every business mile, or claim the business share of what the vehicle actually costs you and its value as a capital allowance. You cannot do both for the same vehicle.",
        "For most drivers of an ordinary car doing serious mileage, the flat rate wins and takes an afternoon less work. Actual costs tend to win for expensive vehicles, low annual mileage, or where a van or an electric car brings a large first-year allowance.",
        "The important part is that the choice sticks to the vehicle. Once you claim the flat rate for a car, you keep using it for that car for as long as you have it, and once you have claimed capital allowances on a vehicle you cannot move it onto the flat rate at all.",
      ]}
      sections={[
        {
          heading: "What each one actually means",
          body: [
            "The flat rate, which HMRC calls simplified expenses, is the same approved mileage rate employees are reimbursed at: 55p a mile for the first 10,000 business miles in the year and 25p after that, for a car or van. It is meant to cover everything the vehicle costs you, so fuel, insurance, servicing, repairs, road tax and depreciation are all inside that figure and cannot be claimed on top.",
            "Actual costs means adding up what the vehicle genuinely costs to run over the year, claiming the business proportion of it, and claiming capital allowances for the vehicle itself. If a third of your driving is business, you claim a third of the fuel, a third of the insurance, a third of the servicing, and so on.",
            "Parking and tolls incurred on a business trip sit outside both and can be claimed either way. Fines cannot, whatever you were doing at the time.",
          ],
        },
        {
          heading: "A comparison worth doing once",
          body: [
            "Take a driver doing 15,000 business miles a year in a car that costs £4,200 a year to run all in, of which 80% of the driving is business.",
          ],
          list: [
            "Flat rate: 10,000 miles at 55p is £5,500, plus 5,000 at 25p is £1,250. Total £6,750.",
            "Actual costs: 80% of £4,200 is £3,360, plus whatever capital allowance the car attracts that year.",
          ],
          after: [
            "On those numbers the flat rate is comfortably ahead, and it is ahead without keeping a shoebox of receipts. Turn the numbers around, though, and so does the answer: a £40,000 electric van used almost entirely for work, doing 4,000 miles a year, can attract a first-year allowance far larger than 4,000 miles of flat rate will ever produce.",
            "The honest advice is to run both sets of numbers for your own vehicle before you claim for the first time, because the first claim is what fixes your options.",
          ],
        },
        {
          heading: "The lock-in, and who cannot use the flat rate at all",
          body: [
            "Once you use the flat rate for a vehicle, you carry on using it for that vehicle until you get rid of it. You are not choosing again each April.",
            "It also runs the other way. If you have already claimed capital allowances on a vehicle, that vehicle cannot be moved onto the flat rate. Buying a van, claiming the allowance, and hoping to switch to mileage next year is not an option.",
            "Simplified expenses are for sole traders and partnerships. A limited company cannot use them for its vehicles: the company claims real costs and capital allowances, and pays the approved mileage rate to a director or employee using their own car.",
          ],
        },
        {
          heading: "If you have more than one vehicle",
          body: [
            "The choice is per vehicle, not per business, so a sole trader can perfectly well claim the flat rate on the car and actual costs on the van. What you cannot do is mix the two methods on the same vehicle in the same year, or move a vehicle between methods once it is settled.",
          ],
        },
      ]}
      faqs={[
        {
          question: "Can I claim fuel receipts as well as the mileage rate?",
          answer:
            "No. The approved rate is designed to cover fuel along with everything else the vehicle costs. Claiming both is the single most common mistake HMRC sees on driver returns, and it is the one most likely to be picked up.",
        },
        {
          question: "Does the 10,000-mile threshold reset each year?",
          answer:
            "Yes. It is per tax year, running 6 April to 5 April, and it counts business miles only. Personal driving does not use up the allowance.",
        },
        {
          question: "What if I change cars?",
          answer:
            "The choice belongs to the vehicle, so a new vehicle is a fresh decision. Sell the car you were claiming the flat rate on, buy another, and you can choose either method for the new one.",
        },
        {
          question: "Is the flat rate available for motorbikes?",
          answer:
            "Yes, at 24p a mile with no threshold: it is 24p from the first mile to the last. Bicycles have their own rate of 20p a mile.",
        },
        {
          question: "I lease my vehicle. Which applies?",
          answer:
            "You can still use the flat rate. If you go the actual-costs route the lease payments are a running cost rather than a capital allowance, and there are restrictions on how much of the payments you can claim for cars with higher emissions. This is one to check with an accountant.",
        },
      ]}
      caution={{
        title: "Decide before you claim, not after",
        body: "This is the rare tax decision that is genuinely hard to undo, and it is made silently the first time you put a figure on a return. If you are about to buy a vehicle that is expensive, electric, or a van, work out both answers first. An hour with an accountant before the purchase is worth considerably more than the same hour afterwards.",
      }}
      links={[
        { href: "/hmrc-mileage-rates", label: "The approved rates in detail", primary: true },
        { href: "/business-mileage-guide", label: "The business mileage guide" },
        { href: "/ev-tax-relief", label: "Electric vehicle tax relief" },
      ]}
    />
  );
}
