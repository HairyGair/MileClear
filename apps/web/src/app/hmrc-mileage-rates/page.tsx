import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BreadcrumbsJsonLd from "@/components/seo/BreadcrumbsJsonLd";
import RateCalculator from "./RateCalculator";
import "./rates.css";

const PAGE_URL = "https://mileclear.com/hmrc-mileage-rates";
const DATE_PUBLISHED = "2026-04-21";
const DATE_MODIFIED = "2026-10-02";

const TITLE = "HMRC Mileage Rates 2026/27: 55p a Mile";
const DESCRIPTION =
  "HMRC mileage rates: cars and vans 55p a mile for the first 10,000 business miles from 6 April 2026 (45p in 2025/26), then 25p. Motorcycles 24p, bikes 20p.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: "article",
    title: `${TITLE} | MileClear`,
    description: DESCRIPTION,
    url: PAGE_URL,
    siteName: "MileClear",
    locale: "en_GB",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} | MileClear`,
    description: DESCRIPTION,
    images: ["/branding/og-image.png"],
  },
};

const SOURCES = {
  rates:
    "https://www.gov.uk/government/publications/rates-and-allowances-travel-mileage-and-fuel-allowances/travel-mileage-and-fuel-rates-and-allowances",
  employerRules: "https://www.gov.uk/expenses-and-benefits-business-travel-mileage/rules-for-tax",
  employeeRelief: "https://www.gov.uk/tax-relief-for-employees/vehicles-you-use-for-work",
  simplified: "https://www.gov.uk/simpler-income-tax-simplified-expenses/vehicles",
  bim75005: "https://www.gov.uk/hmrc-internal-manuals/business-income-manual/bim75005",
  eim31240: "https://www.gov.uk/hmrc-internal-manuals/employment-income-manual/eim31240",
  eim31280: "https://www.gov.uk/hmrc-internal-manuals/employment-income-manual/eim31280",
  eim31410: "https://www.gov.uk/hmrc-internal-manuals/employment-income-manual/eim31410",
  sa103s: "https://www.gov.uk/government/publications/self-assessment-self-employment-short-sa103s",
  s94f: "https://www.legislation.gov.uk/ukpga/2005/5/section/94F",
};

const faqs: { q: string; a: string }[] = [
  {
    q: "What are the HMRC mileage rates for 2026/27?",
    a: "For the 2026/27 tax year (6 April 2026 to 5 April 2027), cars and vans are 55p a mile for the first 10,000 business miles and 25p a mile after that. Motorcycles are 24p a mile and bicycles 20p a mile. Employers can also pay 5p a mile per fellow employee carried as a passenger on a business trip, tax-free.",
  },
  {
    q: "What are the HMRC mileage rates for 2025/26?",
    a: "For the 2025/26 tax year (6 April 2025 to 5 April 2026), cars and vans are 45p a mile for the first 10,000 business miles and 25p a mile after that. Motorcycles are 24p and bicycles 20p. The 45p rate had applied since April 2011, so it is also the right figure for any earlier year you are still claiming for. This is the year you file by 31 January 2027.",
  },
  {
    q: "When did the mileage rate go up to 55p?",
    a: "On 6 April 2026, the first day of the 2026/27 tax year. Only the first 10,000 business miles in a car or van went up (45p to 55p). The 25p rate above 10,000 miles, the 24p motorcycle rate, the 20p bicycle rate and the 5p passenger rate did not change. Miles driven up to 5 April 2026 stay at 45p.",
  },
  {
    q: "Is the 10,000 mile limit per car or per tax year?",
    a: "Per tax year, across all your cars and vans together, not per vehicle. If you change car halfway through the year, the miles in both cars count towards the same 10,000. The counter starts again on 6 April. Employees with two unconnected employers get a separate 10,000 for each employment; associated employers are added together.",
  },
  {
    q: "Do the mileage rates cover fuel?",
    a: "Yes. The rate is meant to cover the whole cost of running the vehicle: fuel, insurance, servicing, repairs, tyres, road tax, MOT and depreciation. You cannot claim those on top. Parking, tolls and congestion charges on a business trip are not covered by the rate, so the self-employed can claim them separately.",
  },
  {
    q: "My employer pays less than 55p a mile. What can I claim?",
    a: "Mileage Allowance Relief. Work out the approved amount (your business miles at the HMRC rates), take away what your employer paid, and claim tax relief on the difference. Claim online through GOV.UK, or on your Self Assessment return if you file one. You can claim for the current tax year and the 4 previous tax years. You need mileage logs with the reason for each journey and the start and end postcodes.",
  },
  {
    q: "What if my employer pays more than the HMRC rate?",
    a: "Anything above the approved amount is taxable. Your employer adds the excess to your pay and deducts tax, or reports it on a P11D. Up to the approved amount, the payments are tax-free and do not need to be reported.",
  },
  {
    q: "Where do I put mileage on my Self Assessment?",
    a: "If you are self-employed and use the short self-employment pages (SA103S), your mileage claim goes in box 12, 'Car, van and travel expenses', along with other allowable travel costs such as parking. If you use the full pages (SA103F) or your turnover is above the short-form limit, follow the notes for that form.",
  },
  {
    q: "Can I switch between the mileage rate and actual costs?",
    a: "Not freely. Once a self-employed person uses the mileage rate for a vehicle, they have to keep using it for as long as that vehicle is used in the business, and cannot claim capital allowances on it. You can choose again when you replace the vehicle. If you have ever claimed capital allowances on a vehicle, you cannot use the mileage rate for it.",
  },
];

const link = (label: string, href: string, note: string) => ({ label, href, note });
const RELATED = [
  link("What counts as business mileage", "/what-counts-as-business-mileage", "Commuting, temporary workplaces and mixed trips"),
  link("Business mileage guide", "/business-mileage-guide", "How to log and claim, step by step"),
  link("Mileage rate or actual costs?", "/mileage-or-actual-costs", "Which method gives the bigger claim"),
  link("How long to keep mileage records", "/how-long-to-keep-mileage-records", "Record-keeping periods for each case"),
  link("Employee mileage tracker", "/employee-mileage-tracker", "Logs for Mileage Allowance Relief claims"),
  link("Self-employed mileage tracker", "/self-employed-mileage-tracker", "Logs for your Self Assessment"),
  link("Amazon Flex mileage claims", "/updates/amazon-flex-mileage-claim", "What Flex drivers can claim"),
  link("Self Assessment checklist for delivery drivers", "/updates/self-assessment-delivery-drivers-checklist", "Everything to gather before 31 January"),
];

export default function HmrcRatesPage() {
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "HMRC mileage rates 2026/27 (and 2025/26)",
    description: DESCRIPTION,
    author: { "@type": "Person", name: "Anthony Gair" },
    publisher: {
      "@type": "Organization",
      name: "MileClear",
      logo: { "@type": "ImageObject", url: "https://mileclear.com/branding/logo-120x120.png" },
    },
    image: "https://mileclear.com/branding/og-image.png",
    datePublished: DATE_PUBLISHED,
    dateModified: DATE_MODIFIED,
    mainEntityOfPage: { "@type": "WebPage", "@id": PAGE_URL },
    inLanguage: "en-GB",
    citation: Object.values(SOURCES),
  };

  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <>
      <BreadcrumbsJsonLd crumbs={[{ name: "HMRC Mileage Rates", path: "/hmrc-mileage-rates" }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(article) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }} />
      <Navbar />

      <main style={{ paddingTop: "68px" }}>
        {/* Answer first: H1 + rates table */}
        <section className="section hr-top hr-block">
          <div className="container hr-wrap">
            <span className="label">HMRC reference</span>
            <h1 className="hr-h1">HMRC mileage rates 2026/27 (and 2025/26)</h1>
            <p className="hr-lead">
              For cars and vans, HMRC&apos;s rate is <strong>55p a mile</strong> for the first
              10,000 business miles from 6 April 2026, then <strong>25p</strong>. For the
              2025/26 tax year it was <strong>45p</strong>, then 25p. Motorcycles are 24p and
              bicycles 20p in both years.
            </p>
            <p className="hr-meta">
              Last updated: <time dateTime={DATE_MODIFIED}>October 2026</time>. Figures checked
              against <a href="#sources">GOV.UK</a>.
            </p>

            <div className="hr-card">
              <div className="hr-table-scroll">
                <table className="hr-table">
                  <caption>Approved mileage rates per business mile</caption>
                  <thead>
                    <tr>
                      <th scope="col">Vehicle</th>
                      <th scope="col" className="hr-num">2025/26</th>
                      <th scope="col" className="hr-num">2026/27</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">Cars and vans, first 10,000 miles</th>
                      <td className="hr-num">45p</td>
                      <td className="hr-num hr-new">55p</td>
                    </tr>
                    <tr>
                      <th scope="row">Cars and vans, over 10,000 miles</th>
                      <td className="hr-num">25p</td>
                      <td className="hr-num">25p</td>
                    </tr>
                    <tr>
                      <th scope="row">Motorcycles</th>
                      <td className="hr-num">24p</td>
                      <td className="hr-num">24p</td>
                    </tr>
                    <tr>
                      <th scope="row">
                        Bicycles <span className="hr-tag">employees</span>
                      </th>
                      <td className="hr-num">20p</td>
                      <td className="hr-num">20p</td>
                    </tr>
                    <tr>
                      <th scope="row">
                        Passengers, per passenger <span className="hr-tag">employees</span>
                      </th>
                      <td className="hr-num">5p</td>
                      <td className="hr-num">5p</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="hr-small">
                Tax year 2025/26 runs 6 April 2025 to 5 April 2026; 2026/27 runs 6 April 2026 to
                5 April 2027. Employees: these are the Approved Mileage Allowance Payment (AMAP)
                rates. Self-employed: the same car, van and motorcycle figures are the simplified
                expenses flat rates (HMRC says &quot;cars and goods vehicles&quot;). Bicycle and
                passenger rates apply to employees only.
              </p>
            </div>
          </div>
        </section>

        {/* What changed */}
        <section className="section hr-block">
          <div className="container hr-wrap">
            <div className="hr-change">
              <div className="hr-change__kicker">6 April 2026</div>
              <h2 className="hr-h2">What changed on 6 April 2026</h2>
              <ul className="hr-list">
                <li>
                  The car and van rate for the first 10,000 business miles went from{" "}
                  <strong>45p to 55p</strong>, its first change since April 2011.
                </li>
                <li>
                  It applies from the <strong>2026/27 tax year</strong> onwards. Miles driven up to
                  5 April 2026 are still claimed at 45p, including on the 2025/26 return due by 31
                  January 2027.
                </li>
                <li>
                  Nothing else moved: 25p over 10,000 miles, 24p for motorcycles, 20p for bicycles
                  and 5p per passenger are the same.
                </li>
                <li>
                  It covers both employees (AMAP and Mileage Allowance Relief) and the
                  self-employed (simplified expenses). For the self-employed the 55p figure is in
                  the legislation, <a href={SOURCES.s94f}>section 94F of ITTOIA 2005</a>, for 2026/27
                  and later years.
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Calculator */}
        <section className="section hr-block" aria-labelledby="calc-h">
          <div className="container hr-wrap">
            <h2 id="calc-h" className="hr-h2">Work out your claim</h2>
            <p className="hr-p">
              Pick the tax year, enter your business miles for that year and choose the vehicle.
              If you are an employee, add what your employer pays per mile to see the Mileage
              Allowance Relief gap.
            </p>
            <RateCalculator />
          </div>
        </section>

        {/* Worked examples */}
        <section className="section hr-block">
          <div className="container hr-wrap">
            <h2 className="hr-h2">Worked examples: 12,000 business miles</h2>
            <p className="hr-p">
              The higher rate only applies to the first 10,000 miles. Every mile after that is at
              25p, so the same mileage gives a different claim in each tax year. HMRC&apos;s own
              guidance uses the same figures (<a href={SOURCES.bim75005}>BIM75005</a>).
            </p>
            <div className="hr-examples">
              <div className="hr-example">
                <div className="hr-example__label">Tax year 2026/27</div>
                <div className="hr-example__line">
                  <span>10,000 × 55p</span>
                  <span>£5,500</span>
                </div>
                <div className="hr-example__line">
                  <span>2,000 × 25p</span>
                  <span>£500</span>
                </div>
                <div className="hr-example__line hr-example__total">
                  <span>Total</span>
                  <span>£6,000</span>
                </div>
              </div>
              <div className="hr-example">
                <div className="hr-example__label">Tax year 2025/26</div>
                <div className="hr-example__line">
                  <span>10,000 × 45p</span>
                  <span>£4,500</span>
                </div>
                <div className="hr-example__line">
                  <span>2,000 × 25p</span>
                  <span>£500</span>
                </div>
                <div className="hr-example__line hr-example__total">
                  <span>Total</span>
                  <span>£5,000</span>
                </div>
              </div>
            </div>
            <p className="hr-p" style={{ marginTop: "1.25rem" }}>
              For a self-employed driver, that total is deducted from profit, so the tax saved
              depends on your rate: £6,000 off profit saves £1,200 at 20% income tax, before
              National Insurance. For an employee, see the next section.
            </p>
            <h3 className="hr-h3">Employee example: employer pays 30p</h3>
            <p className="hr-p">
              You drive 8,000 business miles in your own car in 2026/27 and your employer pays
              30p a mile. The approved amount is 8,000 × 55p = <strong>£4,400</strong>. Your
              employer paid 8,000 × 30p = £2,400. You can claim Mileage Allowance Relief on the{" "}
              <strong>£2,000</strong> difference, which is worth £400 to a basic rate taxpayer
              (20%) or £800 at 40%.
            </p>
          </div>
        </section>

        {/* Employees vs self-employed */}
        <section className="section hr-block">
          <div className="container hr-wrap">
            <h2 className="hr-h2">Employees and the self-employed claim differently</h2>
            <div className="hr-split">
              <div className="hr-card">
                <h3 className="hr-h3">Employees using their own vehicle</h3>
                <p className="hr-p">
                  Your employer can pay you up to the AMAP rates tax-free. If they pay less, or
                  nothing, you can claim <strong>Mileage Allowance Relief</strong> on the gap.
                </p>
                <ul className="hr-list">
                  <li>Claim online on GOV.UK, or on your Self Assessment return if you file one.</li>
                  <li>Send mileage logs with the reason for each journey and the start and end postcodes.</li>
                  <li>You can go back 4 tax years plus the current one.</li>
                  <li>Anything your employer pays above the AMAP rate is taxable.</li>
                  <li>
                    The 5p passenger rate is tax-free if your employer pays it, but there is no
                    relief to claim if they do not.
                  </li>
                </ul>
              </div>
              <div className="hr-card">
                <h3 className="hr-h3">Self-employed and sole traders</h3>
                <p className="hr-p">
                  You can use the flat rates as <strong>simplified expenses</strong> instead of
                  working out actual vehicle costs. The total goes on your Self Assessment.
                </p>
                <ul className="hr-list">
                  <li>
                    On the short self-employment pages (SA103S) it goes in{" "}
                    <strong>box 12, &quot;Car, van and travel expenses&quot;</strong>.
                  </li>
                  <li>Parking, tolls and congestion charges on business trips can be added on top.</li>
                  <li>Once you use the rate for a vehicle, you stay on it until you replace that vehicle.</li>
                  <li>Not available for a vehicle you have claimed capital allowances on.</li>
                  <li>Bicycles are not covered by simplified expenses.</li>
                </ul>
              </div>
            </div>
            <p className="hr-p" style={{ marginTop: "1rem" }}>
              Either way, only business journeys count. Ordinary commuting from home to a
              permanent workplace does not. See{" "}
              <a href="/what-counts-as-business-mileage">what counts as business mileage</a> and,
              if you are weighing up methods, <a href="/mileage-or-actual-costs">mileage rate or actual costs</a>.
            </p>
          </div>
        </section>

        {/* Threshold + multiple employers */}
        <section className="section hr-block">
          <div className="container hr-wrap">
            <h2 className="hr-h2">How the 10,000 mile threshold works</h2>
            <ul className="hr-list">
              <li>
                <strong>Per tax year.</strong> The count starts again on 6 April. Your first 10,000
                business miles in 2026/27 are all at 55p.
              </li>
              <li>
                <strong>All cars and vans together.</strong> HMRC adds up your business miles in
                every car and van you use, as if they were one vehicle. Two cars do not give you
                two lots of 10,000 (<a href={SOURCES.eim31240}>EIM31240</a>; for the
                self-employed, <a href={SOURCES.s94f}>section 94F</a>).
              </li>
              <li>
                <strong>Motorcycles and bicycles</strong> have one flat rate, so the threshold does
                not apply to them.
              </li>
              <li>
                <strong>More than one employer.</strong> Each unconnected employment has its own
                10,000 mile limit. If your employers are associated (for example companies in the
                same group), the miles are added together (<a href={SOURCES.eim31280}>EIM31280</a>).
              </li>
            </ul>
            <p className="hr-p">
              To claim any of this you need a record of each business trip: the date, where you
              started and finished, why you went and how far. Keep it as you go rather than
              rebuilding it in January. Our guide covers{" "}
              <a href="/how-long-to-keep-mileage-records">how long to keep mileage records</a>.
            </p>
          </div>
        </section>

        {/* Soft CTA */}
        <section className="section hr-block">
          <div className="container hr-wrap">
            <div className="hr-cta">
              <div className="hr-cta__text">
                <h2 className="hr-h3">Keep the log without thinking about it</h2>
                <p className="hr-p">
                  MileClear is a free mileage tracker app. It records your drives in the
                  background, lets you mark each one business or personal, and works out your
                  claim at the rate for the tax year each trip falls in: 45p before 6 April 2026,
                  55p after.
                </p>
              </div>
              <a className="hr-btn" href="/app?from=seo-rates">
                Get the app
              </a>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="section hr-block" aria-labelledby="faq-h">
          <div className="container hr-wrap">
            <h2 id="faq-h" className="hr-h2">Questions about HMRC mileage rates</h2>
            <div className="hr-faq">
              {faqs.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
            <p className="hr-small">
              This page explains HMRC&apos;s published rates and is not tax advice. If your
              situation is complicated (several vehicles, a company car, mixed business and
              personal use you are unsure about), speak to an accountant.
            </p>
          </div>
        </section>

        {/* Related */}
        <section className="section hr-block">
          <div className="container hr-wrap">
            <h2 className="hr-h2">Related guides</h2>
            <ul className="hr-links">
              {RELATED.map((r) => (
                <li key={r.href}>
                  <a href={r.href}>
                    {r.label}
                    <span>{r.note}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Sources */}
        <section className="section hr-block" id="sources">
          <div className="container hr-wrap">
            <h2 className="hr-h2">Sources: GOV.UK</h2>
            <ul className="hr-sources">
              <li>
                <a href={SOURCES.rates}>Travel: mileage and fuel rates and allowances</a> (AMAP
                rates for both years, including bicycles and passengers)
              </li>
              <li>
                <a href={SOURCES.employerRules}>Expenses and benefits: business travel mileage, rules for tax</a>{" "}
                (payments above and below the approved amount)
              </li>
              <li>
                <a href={SOURCES.employeeRelief}>Tax relief for employees: vehicles you use for work</a>{" "}
                (Mileage Allowance Relief, how to claim, mileage logs)
              </li>
              <li>
                <a href={SOURCES.simplified}>Simplified expenses: vehicles</a> (self-employed flat rates)
              </li>
              <li>
                <a href={SOURCES.bim75005}>BIM75005: simplified expenses, motor vehicles</a> (rates by
                tax year, worked examples, sticking with the method)
              </li>
              <li>
                <a href={SOURCES.eim31240}>EIM31240</a> and <a href={SOURCES.eim31280}>EIM31280</a>{" "}
                (10,000 mile threshold, multiple employments)
              </li>
              <li>
                <a href={SOURCES.eim31410}>EIM31410: passenger payments</a> (exemption only, no relief)
              </li>
              <li>
                <a href={SOURCES.sa103s}>Self Assessment: self-employment (short) SA103S</a> (box 12,
                2025/26 form)
              </li>
              <li>
                <a href={SOURCES.s94f}>Income Tax (Trading and Other Income) Act 2005, section 94F</a>{" "}
                (legislation.gov.uk)
              </li>
            </ul>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
