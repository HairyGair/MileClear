import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BreadcrumbsJsonLd from "@/components/seo/BreadcrumbsJsonLd";
import Calculator from "./Calculator";

export const metadata: Metadata = {
  title: "Mileage Calculator UK - HMRC Rate & Petrol Cost 2026-27",
  description:
    "Free UK mileage and fuel expenses calculator. Work out your HMRC approved mileage allowance (55p/25p for 2026-27) and your real petrol or diesel cost, side by side. No sign-up.",
  alternates: {
    canonical: "https://mileclear.com/mileage-calculator",
  },
  openGraph: {
    title: "Mileage Calculator | MileClear",
    description:
      "Work out your HMRC mileage allowance and your actual fuel cost side by side, then see the gap between them.",
    url: "https://mileclear.com/mileage-calculator",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mileage Calculator | MileClear",
    description:
      "HMRC mileage allowance and real petrol cost, calculated side by side.",
    images: ["/branding/og-image.png"],
  },
};

const faqs = [
  {
    q: "How does this mileage calculator work?",
    a: "Enter your business miles, vehicle type and tax year to get the HMRC approved mileage allowance (AMAP). Enter your car's MPG and the price of fuel per litre to get the real cost of the fuel for those same miles. Both update as you type, there is nothing to submit and nothing is saved or sent anywhere, the whole calculation runs in your browser.",
  },
  {
    q: "What are the current HMRC mileage rates?",
    a: "For tax year 2026-27 (from 6 April 2026), cars and vans claim 55p per mile for the first 10,000 business miles in the tax year, then 25p per mile after that. Motorbikes are a flat 24p per mile regardless of distance. For tax year 2025-26 and earlier, cars and vans were 45p for the first 10,000 miles, then 25p after, motorbikes unchanged at 24p.",
  },
  {
    q: "Is the 10,000 mile threshold per tax year, per month or per journey?",
    a: "Per tax year. The counter runs from 6 April to 5 April and resets to zero each year. It is not per employer, per vehicle or per journey, it is a single running total of all your business miles in that tax year, in that vehicle type. If you drive 10,000 business miles by December, every mile from January to the following 5 April drops to the lower rate.",
  },
  {
    q: "Does the mileage rate already include fuel?",
    a: "Yes. The AMAP rate is built to cover fuel, insurance, servicing, road tax, tyres and general wear and tear in one figure. That is deliberate, so you do not need to keep separate fuel receipts if you are claiming the mileage rate. It also means you cannot claim mileage and fuel receipts for the same trip, that is double-claiming and HMRC will disallow it if picked up in an enquiry.",
  },
  {
    q: "My employer pays me less than the HMRC rate, can I claim the difference?",
    a: "Yes, this is called Mileage Allowance Relief. If your employer reimburses you at, say, 30p a mile and the approved rate is 55p, you can claim tax relief on the 25p a mile shortfall via a P87 form or through Self Assessment if you already file one. If your employer pays more than the approved rate, the excess is taxable and should go through payroll as a benefit.",
  },
  {
    q: "What MPG figure should I use?",
    a: "Your own, ideally worked out from your fuel receipts and a couple of odometer readings, since real-world MPG is usually lower than the manufacturer's official figure. If you do not have one yet, the manufacturer's combined-cycle MPG is a reasonable starting point, just treat the fuel cost figure as an estimate until you have logged a few tanks.",
  },
  {
    q: "Why is the fuel cost sometimes higher than the mileage claim?",
    a: "It happens with high-MPG shortfalls (an inefficient vehicle) or unusually expensive fuel. It can also happen honestly with a large, thirsty vehicle. If your figures show this, it is worth double-checking your MPG and pence-per-litre inputs before assuming the mileage rate is not covering its costs, since UK average MPG and fuel prices vary a lot by vehicle and by month.",
  },
];

// Revalidate hourly so the pump price stays current without rebuilding. The
// page still prerenders, so it remains fully server-rendered for crawlers.
export const revalidate = 3600;

async function currentPencePerLitre(): Promise<string | undefined> {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";
  try {
    const res = await fetch(`${base}/fuel/national-averages`, { next: { revalidate: 3600 } });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { data?: { petrolPencePerLitre?: number } };
    const p = body.data?.petrolPencePerLitre;
    // Guard the range: a malformed feed must not seed an absurd default.
    if (typeof p !== "number" || p < 50 || p > 400) return undefined;
    return p.toFixed(1);
  } catch {
    return undefined;
  }
}

export default async function MileageCalculatorPage() {
  const pencePerLitre = await currentPencePerLitre();
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
      <BreadcrumbsJsonLd crumbs={[{ name: "Mileage Calculator", path: "/mileage-calculator" }]} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }}
      />
      <Navbar />

      <main style={{ paddingTop: "68px" }}>
        {/* Hero */}
        <section className="section">
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "2rem" }}>
              <span className="label">Free Calculator</span>
              <h1 className="heading" style={{ marginBottom: "1rem" }}>
                Mileage and Fuel Cost Calculator
              </h1>
              <p className="subtext" style={{ margin: "0 auto", maxWidth: 640 }}>
                Two numbers, side by side: what HMRC lets you claim for your business
                miles, and what the fuel for those miles actually cost. No sign-up,
                nothing saved, recalculates as you type.
              </p>
            </div>
          </div>
        </section>

        {/* Calculator */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <Calculator initialPencePerLitre={pencePerLitre} />
          </div>
        </section>

        {/* How the rates work */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={{ marginBottom: "1.5rem" }}>
              <span className="label">How It Works</span>
              <h2 className="heading" style={{ fontSize: "clamp(1.75rem, 3vw, 2.25rem)", marginBottom: "1rem" }}>
                How the HMRC approved rate works
              </h2>
            </div>
            <div style={{ fontSize: "1rem", color: "var(--text-secondary)", lineHeight: 1.8 }}>
              <p style={{ marginBottom: "1rem" }}>
                HMRC publishes an Approved Mileage Allowance Payment (AMAP) rate for
                cars and vans, motorbikes and bicycles. For tax year 2026-27, cars and
                vans claim 55p per mile for the first 10,000 business miles, then 25p
                per mile after that, up from 45p/25p for tax year 2025-26 and earlier.
                Motorbikes stay at a flat 24p per mile regardless of distance. Full
                detail, including a worked example, is on our{" "}
                <a href="/hmrc-mileage-rates" style={{ color: "var(--amber-400)" }}>
                  HMRC mileage rates page
                </a>
                .
              </p>
              <p style={{ marginBottom: "1rem" }}>
                The rate is not linked to actual fuel prices or how efficient your
                vehicle is, it is a flat allowance designed to be simple to apply and
                to cover the whole cost of running the vehicle for business, not just
                the petrol or diesel. That is exactly why the calculator above shows
                both figures separately, the HMRC claim is a fixed allowance, the fuel
                cost is a real expense that varies with your MPG and the pump price.
              </p>
              <p>
                The 10,000 mile threshold is a single running total per tax year, per
                vehicle type, not per employer or per journey. It resets to zero on 6
                April. Once you pass it, only the miles above 10,000 drop to the lower
                rate, the first 10,000 stay at the higher one.
              </p>
            </div>
          </div>
        </section>

        {/* What counts */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div
              style={{
                background: "var(--bg-card-solid)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--r-lg)",
                padding: "clamp(1.5rem, 3vw, 2rem)",
              }}
            >
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  color: "var(--amber-400)",
                  marginBottom: "0.85rem",
                }}
              >
                Before you claim
              </div>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "1.375rem",
                  fontWeight: 700,
                  color: "var(--text-white)",
                  marginBottom: "0.85rem",
                  lineHeight: 1.25,
                }}
              >
                Not every mile is a business mile
              </h2>
              <p style={{ fontSize: "0.9375rem", color: "var(--text-primary)", lineHeight: 1.75, marginBottom: "0.85rem" }}>
                The calculator above assumes every mile you enter is genuine business
                mileage. A normal commute to a fixed workplace does not count, and
                mixing personal driving into the total is one of the most common
                reasons HMRC challenges a claim. Trips between job sites, to clients,
                to suppliers, and (for most mobile workers) from home to a temporary
                workplace, all count.
              </p>
              <a
                href="/what-counts-as-business-mileage"
                style={{
                  display: "inline-block",
                  color: "var(--amber-400)",
                  fontWeight: 600,
                  fontSize: "0.9375rem",
                }}
              >
                What counts as business mileage, eight real situations →
              </a>
            </div>
          </div>
        </section>

        {/* Mileage Allowance Relief */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={{ marginBottom: "1.5rem" }}>
              <span className="label">Employees</span>
              <h2 className="heading" style={{ fontSize: "clamp(1.75rem, 3vw, 2.25rem)", marginBottom: "1rem" }}>
                My employer pays less than the approved rate
              </h2>
            </div>
            <div style={{ fontSize: "1rem", color: "var(--text-secondary)", lineHeight: 1.8 }}>
              <p style={{ marginBottom: "1rem" }}>
                Plenty of employers reimburse mileage below the HMRC rate, 25p or 30p a
                mile is common. The gap between what they pay and the approved rate is
                not lost, it is tax relief you can claim yourself, known as Mileage
                Allowance Relief (MAR). Work out the shortfall per mile, multiply by
                your business miles for the year, and claim it through a P87 form (or
                your Self Assessment return if you already file one).
              </p>
              <p>
                A driver on 8,000 business miles a year whose employer pays 25p, against
                an approved rate of 55p, has a 30p per mile shortfall, worth £2,400 of
                tax relief claimable, which reduces their tax bill by £480 at the 20%
                basic rate or £960 at 40%. It is one of the most commonly missed reliefs
                for employees who drive for work. See our{" "}
                <a href="/business-mileage-guide" style={{ color: "var(--amber-400)" }}>
                  business mileage guide
                </a>{" "}
                for the full walkthrough.
              </p>
            </div>
          </div>
        </section>

        {/* FAQs */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 760, margin: "0 auto" }}>
            <div style={{ marginBottom: "2rem" }}>
              <span className="label">FAQ</span>
              <h2 className="heading" style={{ fontSize: "clamp(1.75rem, 3vw, 2.25rem)" }}>
                Common questions
              </h2>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              {faqs.map((faq) => (
                <div key={faq.q}>
                  <h3
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "1.0625rem",
                      fontWeight: 700,
                      color: "var(--text-white)",
                      marginBottom: "0.625rem",
                      lineHeight: 1.35,
                    }}
                  >
                    {faq.q}
                  </h3>
                  <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: 1.75 }}>
                    {faq.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Related */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div className="divider" style={{ marginBottom: "2.5rem" }} />
            <h2 className="heading" style={{ fontSize: "clamp(1.5rem, 2.5vw, 2rem)", marginBottom: "1rem" }}>
              Keep reading
            </h2>
            <p style={{ fontSize: "1rem", color: "var(--text-secondary)", lineHeight: 1.75, marginBottom: "1.5rem" }}>
              This calculator gives you a single number for right now. Tracking every
              trip automatically, all year, is what turns that into a claim HMRC will
              actually accept.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
              <a
                href="/hmrc-mileage-rates"
                style={{
                  background: "var(--amber-400)",
                  color: "var(--bg-deep)",
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: "0.9375rem",
                  padding: "0.75rem 1.5rem",
                  borderRadius: "var(--r-full)",
                  textDecoration: "none",
                }}
              >
                HMRC rates in detail →
              </a>
              <a
                href="/what-counts-as-business-mileage"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  fontSize: "0.9375rem",
                  padding: "0.75rem 1.5rem",
                  borderRadius: "var(--r-full)",
                  border: "1px solid var(--border-default)",
                  textDecoration: "none",
                }}
              >
                What counts as business mileage
              </a>
              <a
                href="/business-mileage-guide"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  fontSize: "0.9375rem",
                  padding: "0.75rem 1.5rem",
                  borderRadius: "var(--r-full)",
                  border: "1px solid var(--border-default)",
                  textDecoration: "none",
                }}
              >
                Full business mileage guide
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
