import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BreadcrumbsJsonLd from "@/components/seo/BreadcrumbsJsonLd";

export const metadata: Metadata = {
  title: "Electric Vehicle Tax Relief UK 2026-27 — What EV Drivers Can Claim",
  description:
    "A clear guide to what UK electric vehicle drivers can claim back from HMRC: mileage relief (EVs use the same 55p/25p rate), home and public charging, the 100% first-year allowance on a new EV, company-car benefit-in-kind, VAT, grants and the new road tax. For the self-employed, employees and company-car drivers.",
  alternates: {
    canonical: "https://mileclear.com/ev-tax-relief",
  },
  openGraph: {
    title: "Electric Vehicle Tax Relief | MileClear",
    description:
      "What EV drivers can claim from HMRC in 2026-27: mileage, charging, the 100% first-year allowance, company-car BIK, VAT, grants and road tax. Plain English, with sources.",
    url: "https://mileclear.com/ev-tax-relief",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Electric Vehicle Tax Relief | MileClear",
    description:
      "What UK EV drivers can claim from HMRC: mileage, charging, the 100% first-year allowance, company-car BIK, VAT, grants and road tax.",
    images: ["/branding/og-image.png"],
  },
};

const faqs = [
  {
    q: "Do electric cars get a lower mileage rate than petrol cars?",
    a: "No. HMRC's Approved Mileage Allowance Payment (AMAP) rate is the same whatever the fuel type. For a car or van you claim 55p per business mile for the first 10,000 miles in the 2026-27 tax year (45p up to 5 April 2026), then 25p per mile after that. An electric car is treated exactly the same as petrol or diesel for simplified mileage.",
  },
  {
    q: "If I claim the mileage rate, can I also claim my charging cost?",
    a: "No. The mileage rate already covers the running cost of the car, and for an EV that includes the electricity you use to charge it, plus insurance, servicing, depreciation and road tax. You cannot claim home or public charging on top of the mileage rate. You can still claim genuinely separate, business-only costs such as tolls, congestion or Clean Air Zone charges, and parking.",
  },
  {
    q: "Can I claim the full cost of a new electric car against my tax?",
    a: "If you are self-employed and use the actual-costs method (not the mileage rate), a brand-new, unused electric car can qualify for a 100% first-year allowance, letting you deduct the full purchase price in year one, restricted to your business-use percentage. This is currently available for expenditure up to 5 April 2027 for income tax. Second-hand EVs and hybrids do not qualify for the 100% allowance. Once you claim a capital allowance on a car you can no longer use the mileage rate for it, and a balancing charge usually applies when you sell, so it is worth modelling both methods first.",
  },
  {
    q: "What is the Advisory Electricity Rate?",
    a: "The Advisory Electricity Rate (AER) is the per-mile rate HMRC sets for reimbursing electricity used in a company electric car. As of June 2026 it is 7p per mile for home charging and 15p per mile for public charging, and it is reviewed quarterly. It applies to company cars only. If you use your own EV for work, you use the higher AMAP rate (45p/25p) instead, because that covers the whole cost of the car, not just the electricity.",
  },
  {
    q: "Why is an electric company car so tax-efficient?",
    a: "Company cars are taxed as a benefit in kind based on the car's list price and a percentage set by its CO2 emissions. A zero-emission car gets the lowest band: 3% in 2025-26, 4% in 2026-27 and 5% in 2027-28, compared with 25% to 37% for many petrol and diesel cars. That makes the taxable benefit, and the tax you pay, a fraction of an equivalent combustion car. It is the single biggest EV tax break, and the reason salary-sacrifice EV schemes are so popular.",
  },
  {
    q: "Do electric cars pay road tax now?",
    a: "Yes. From 1 April 2025 electric and zero-emission cars stopped being exempt from Vehicle Excise Duty. A new EV pays a £10 first-year rate, then the £200 standard rate from year two. EVs with a list price over £50,000 also pay the Expensive Car Supplement (around £425 a year) in years two to six. This is a recent change that catches a lot of people out.",
  },
  {
    q: "Is this tax advice?",
    a: "No. This is general information to help you understand the reliefs that exist, based on HMRC and gov.uk guidance current in June 2026. The right method and the amounts depend on your own figures, and the choice between mileage and actual costs is locked per vehicle, so if real money is at stake it is worth confirming with an accountant or HMRC before you commit.",
  },
];

// Small presentational helpers to keep the long page readable.
function Card({
  children,
  accent = "default",
}: {
  children: React.ReactNode;
  accent?: "default" | "amber" | "warn" | "good";
}) {
  const bg =
    accent === "amber"
      ? "var(--amber-glow-md)"
      : accent === "warn"
        ? "rgba(239, 68, 68, 0.07)"
        : accent === "good"
          ? "rgba(16, 185, 129, 0.07)"
          : "var(--bg-card-solid)";
  const border =
    accent === "amber"
      ? "1px solid rgba(234, 179, 8, 0.25)"
      : accent === "warn"
        ? "1px solid rgba(239, 68, 68, 0.25)"
        : accent === "good"
          ? "1px solid rgba(16, 185, 129, 0.25)"
          : "1px solid var(--border-default)";
  return (
    <div style={{ background: bg, border, borderRadius: "var(--r-md)", padding: "1.25rem", marginBottom: "1rem" }}>
      {children}
    </div>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        fontFamily: "var(--font-display)",
        fontSize: "1.1rem",
        fontWeight: 700,
        color: "var(--text-white)",
        marginBottom: "0.6rem",
      }}
    >
      {children}
    </h3>
  );
}

function P({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "0.75rem", ...style }}>
      {children}
    </p>
  );
}

function SectionHead({ label, title, intro }: { label: string; title: string; intro?: string }) {
  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <span className="label">{label}</span>
      <h2 className="heading" style={{ fontSize: "clamp(1.6rem, 3vw, 2.1rem)", marginBottom: intro ? "0.85rem" : 0 }}>
        {title}
      </h2>
      {intro && <p style={{ fontSize: "1rem", color: "var(--text-secondary)", lineHeight: 1.75 }}>{intro}</p>}
    </div>
  );
}

export default function EvTaxReliefPage() {
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "Electric Vehicle Tax Relief UK — What EV Drivers Can Claim from HMRC",
    description:
      "A plain-English guide to EV tax relief for UK drivers in 2026-27: mileage, home and public charging, the 100% first-year allowance, company-car benefit-in-kind, VAT, grants and road tax. For the self-employed, employees and company-car drivers.",
    author: { "@type": "Person", name: "Anthony Gair" },
    publisher: {
      "@type": "Organization",
      name: "MileClear",
      logo: { "@type": "ImageObject", url: "https://mileclear.com/branding/logo-120x120.png" },
    },
    datePublished: "2026-06-14",
    dateModified: "2026-06-14",
    mainEntityOfPage: "https://mileclear.com/ev-tax-relief",
    inLanguage: "en-GB",
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

  const wrap = { maxWidth: 820, margin: "0 auto" } as const;

  return (
    <>
      <BreadcrumbsJsonLd crumbs={[{ name: "EV Tax Relief", path: "/ev-tax-relief" }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(article) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }} />
      <Navbar />

      <main style={{ paddingTop: "68px" }}>
        {/* Hero */}
        <section className="section">
          <div className="container" style={wrap}>
            <div style={{ textAlign: "center", marginBottom: "2rem" }}>
              <span className="label">HMRC Guide</span>
              <h1 className="heading" style={{ marginBottom: "1rem" }}>
                Electric Vehicle Tax Relief: What You Can Claim
              </h1>
              <p className="subtext" style={{ margin: "0 auto", maxWidth: 640 }}>
                A clear, sourced guide to what UK electric vehicle drivers can claim back from HMRC,
                whether you are self-employed, an employee using your own EV, or driving an electric
                company car. Current for the 2025-26 and 2026-27 tax years.
              </p>
            </div>

            {/* The headline reassurance */}
            <Card accent="amber">
              <H3>The headline: an EV gets the same mileage rate as petrol</H3>
              <P>
                If you claim simplified mileage, an electric car is treated exactly like a petrol or
                diesel one. You claim <strong style={{ color: "var(--text-white)" }}>55p per business
                mile</strong> for the first 10,000 miles in 2026-27 (45p up to 5 April 2026), then 25p
                after that. There is no lower &quot;EV rate&quot;, and you are not penalised for driving
                electric. Where EVs really differ from petrol is in the <em>actual-costs</em> route, where
                a brand-new electric car can earn a 100% first-year allowance, and as a
                <em> company car</em>, where the benefit-in-kind charge is tiny.
              </P>
            </Card>
          </div>
        </section>

        {/* Self-employed */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={wrap}>
            <SectionHead
              label="If you're self-employed"
              title="Sole traders: two methods, choose carefully"
              intro="As a self-employed driver you get tax relief on your car in one of two ways. You pick one per vehicle, and the choice is locked for as long as you keep that vehicle, so it pays to understand both."
            />

            <Card>
              <H3>Method 1: Simplified mileage (the usual choice for drivers)</H3>
              <P>
                Claim a flat rate per business mile: 55p for the first 10,000 miles in 2026-27 (45p
                before), then 25p. That single figure is designed to cover the whole running cost of
                the car, including the electricity to charge it, insurance, servicing, tyres,
                depreciation and road tax.
              </P>
              <P>
                <strong style={{ color: "var(--text-white)" }}>So you cannot also claim charging on
                top.</strong> Home charging, public charging, a new battery, none of it, because the
                mileage rate already accounts for it. What you <em>can</em> still claim separately are
                genuinely business-only costs the rate does not cover: tolls, parking, congestion and
                Clean Air Zone / ULEZ charges incurred wholly for work.
              </P>
              <P>
                It is the simplest option and, for most high-mileage drivers with a cheap-to-run EV,
                usually the most generous too. No fuel receipts, just a mileage log.
              </P>
            </Card>

            <Card>
              <H3>Method 2: Actual costs (where the big EV allowances live)</H3>
              <P>
                Instead of a flat rate, you deduct the business-use proportion of your real running
                costs, plus a capital allowance on the car itself. For an EV the claimable running costs
                include:
              </P>
              <ul style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: 1.8, paddingLeft: "1.2rem", marginBottom: "0.75rem" }}>
                <li><strong style={{ color: "var(--text-white)" }}>Home charging</strong> — the business share of your actual home electricity cost used to charge the car. The cleanest evidence is a smart charger or app that logs the kWh, priced at your real unit rate.</li>
                <li><strong style={{ color: "var(--text-white)" }}>Public charging</strong> — the business share of your charge-point receipts.</li>
                <li>Insurance, servicing, repairs, breakdown cover, road tax, all apportioned by business-use percentage (business miles ÷ total miles).</li>
              </ul>
              <P>
                One thing to watch: HMRC&apos;s Advisory Electricity Rate (7p/15p per mile) is for
                <em> company-car</em> reimbursement, not for a sole trader&apos;s actual-cost claim. If
                you are self-employed on actual costs, use your <strong style={{ color: "var(--text-white)" }}>real
                electricity cost</strong>, not the advisory rate.
              </P>
            </Card>

            <Card accent="good">
              <H3>The 100% first-year allowance on a new EV</H3>
              <P>
                This is the standout reason to consider actual costs for an electric car. A
                <strong style={{ color: "var(--text-white)" }}> brand-new, unused</strong> electric (or
                0g/km) car can qualify for a <strong style={{ color: "var(--text-white)" }}>100%
                first-year allowance</strong>, so you deduct the full purchase price against profit in
                year one, restricted to your business-use percentage. A £40,000 EV used 80% for business
                gives a £32,000 deduction in the first year. Compare that with a petrol car, which is
                written down slowly at 18% or 6% a year.
              </P>
              <P style={{ marginBottom: 0 }}>
                The allowance is available for expenditure up to <strong style={{ color: "var(--text-white)" }}>5
                April 2027</strong> (income tax), having been extended by a year. The catches:
                second-hand EVs and hybrids do not qualify; once you claim a capital allowance you can
                never use the mileage rate for that car; and a <strong style={{ color: "var(--text-white)" }}>balancing
                charge</strong> usually adds much of the sale proceeds back to your taxable profit when
                you sell, which partly reverses the year-one benefit. Model both methods before you
                commit.
              </P>
            </Card>

            <Card>
              <H3>Charge point at home or work</H3>
              <P style={{ marginBottom: 0 }}>
                A business installing an EV charge point can claim a 100% first-year allowance on the
                cost, also extended to 5 April 2027. If the charger at home is also used privately, the
                claim is restricted to the business-use proportion.
              </P>
            </Card>
          </div>
        </section>

        {/* Employee own EV */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={wrap}>
            <SectionHead
              label="If you're an employee, own car"
              title="Using your own electric car for work"
              intro="If you drive your own EV for your job, the rules are the same as for a petrol car, and they work in your favour."
            />
            <Card>
              <P>
                Your employer can pay you up to the <strong style={{ color: "var(--text-white)" }}>approved
                mileage rate</strong> (45p per mile for the first 10,000 business miles, 25p after)
                tax-free. There is no separate, lower rate for EVs.
              </P>
              <P style={{ marginBottom: 0 }}>
                If your employer pays <em>less</em> than the approved rate, for example a flat 25p or
                only the electricity cost, you can claim <strong style={{ color: "var(--text-white)" }}>Mileage
                Allowance Relief</strong> on the shortfall through your tax return or a P87. Because the
                45p rate has not changed in years while EV running costs are low, this relief is often
                well worth claiming.
              </P>
            </Card>
          </div>
        </section>

        {/* Company car */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={wrap}>
            <SectionHead
              label="If you drive a company EV"
              title="The electric company car: the biggest EV tax break"
              intro="This is where electric vehicles are dramatically tax-advantaged, and why salary-sacrifice EV schemes have taken off."
            />

            <Card accent="amber">
              <H3>Benefit-in-kind is tiny on a zero-emission car</H3>
              <P>
                A company car is taxed as a benefit based on its list price times a percentage set by
                CO2 emissions. A zero-emission car gets the lowest band:
              </P>
              <ul style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: 1.8, paddingLeft: "1.2rem", marginBottom: "0.75rem" }}>
                <li><strong style={{ color: "var(--text-white)" }}>3%</strong> in 2025-26</li>
                <li><strong style={{ color: "var(--text-white)" }}>4%</strong> in 2026-27</li>
                <li><strong style={{ color: "var(--text-white)" }}>5%</strong> in 2027-28, then rising to 7% and 9% by 2029-30</li>
              </ul>
              <P style={{ marginBottom: 0 }}>
                Compared with 25% to 37% for many petrol and diesel cars, that is roughly a tenth of the
                tax. A £40,000 EV at 3% is a £1,200 taxable benefit, costing a 40% taxpayer about £480 a
                year. Even with the planned rises, EVs stay the cheapest band by a wide margin into
                2029-30.
              </P>
            </Card>

            <Card>
              <H3>Salary sacrifice</H3>
              <P style={{ marginBottom: 0 }}>
                You give up part of your gross salary for the use of an EV, so you avoid income tax and
                National Insurance on the sacrificed amount and pay only the small benefit-in-kind
                charge. Salary-sacrifice cars are normally caught by rules that cancel this saving, but
                ultra-low-emission cars (75g/km or less, which includes all EVs) are exempt, which is
                exactly why EV salary sacrifice is so popular.
              </P>
            </Card>

            <Card>
              <H3>Charging a company EV</H3>
              <P>
                The <strong style={{ color: "var(--text-white)" }}>Advisory Electricity Rate</strong>
                lets the employer reimburse electricity tax-free: as of June 2026, 7p per mile for home
                charging and 15p per mile for public, reviewed quarterly.
              </P>
              <P style={{ marginBottom: 0 }}>
                <strong style={{ color: "var(--text-white)" }}>Workplace charging is tax-free</strong>:
                charging your car at the employer&apos;s premises is not a taxable benefit. And since a
                2023 change, an employer reimbursing the cost of charging a <em>company</em> car at your
                home is no longer a taxable benefit either. (Charging your own private car at home is a
                different story and generally is not covered.)
              </P>
            </Card>
          </div>
        </section>

        {/* VAT */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={wrap}>
            <SectionHead
              label="If you're VAT-registered"
              title="VAT on charging and buying an EV"
              intro="Mostly relevant if your business is VAT-registered. The rules are not EV-friendly here, and home charging is the trap."
            />
            <Card>
              <ul style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: 1.85, paddingLeft: "1.2rem", margin: 0 }}>
                <li><strong style={{ color: "var(--text-white)" }}>Public charging</strong> is standard-rated at 20%, and a business can reclaim the VAT on business use. (A tribunal has challenged this and HMRC is appealing, so treat 20% as the live position.)</li>
                <li><strong style={{ color: "var(--text-white)" }}>Home charging</strong> is at the 5% domestic rate. A sole trader can reclaim the business proportion, but an <strong style={{ color: "var(--text-white)" }}>employer cannot reclaim VAT on an employee charging a company car at home</strong>, because the electricity is supplied to the individual, not the business. This is the most common mistake.</li>
                <li><strong style={{ color: "var(--text-white)" }}>Buying a car</strong> (EV included): VAT is generally blocked unless the car has genuinely no private use available. <strong style={{ color: "var(--text-white)" }}>Leasing</strong>: 50% of the VAT is recoverable. <strong style={{ color: "var(--text-white)" }}>Vans</strong>: up to 100% on business use.</li>
              </ul>
            </Card>
          </div>
        </section>

        {/* VED reality check */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={wrap}>
            <SectionHead label="Recently changed" title="EVs now pay road tax" />
            <Card accent="warn">
              <P>
                From <strong style={{ color: "var(--text-white)" }}>1 April 2025</strong>, electric and
                zero-emission cars lost their Vehicle Excise Duty exemption. They were free; they are
                not any more.
              </P>
              <ul style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: 1.8, paddingLeft: "1.2rem", margin: 0 }}>
                <li>A new EV pays a <strong style={{ color: "var(--text-white)" }}>£10</strong> first-year rate, then the <strong style={{ color: "var(--text-white)" }}>£200</strong> standard rate from year two. Older EVs moved onto the standard rate too.</li>
                <li>EVs with a list price over <strong style={{ color: "var(--text-white)" }}>£50,000</strong> also pay the Expensive Car Supplement (around £425 a year) in years two to six. The threshold for zero-emission cars was raised from £40,000 to £50,000, applied retrospectively, so most EVs registered from April 2025 escape it.</li>
              </ul>
            </Card>
          </div>
        </section>

        {/* Grants */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={wrap}>
            <SectionHead
              label="Grants & schemes"
              title="Help with a charge point"
              intro="The old grant for buying an EV ended years ago. The grants that survive are about chargers, and most run to 31 March 2027."
            />
            <Card>
              <ul style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: 1.85, paddingLeft: "1.2rem", margin: 0 }}>
                <li><strong style={{ color: "var(--text-white)" }}>Workplace Charging Scheme</strong>: up to £500 per socket (max 40) for businesses, charities and public bodies.</li>
                <li><strong style={{ color: "var(--text-white)" }}>Flats and rented homes, and on-street parking</strong>: £500 per socket for people who rent or own a flat, or have no off-street parking.</li>
                <li><strong style={{ color: "var(--text-white)" }}>Residential landlords</strong>: £500 per socket, up to 200 sockets.</li>
              </ul>
            </Card>
          </div>
        </section>

        {/* Disclaimer + FAQ */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={wrap}>
            <Card>
              <P style={{ marginBottom: 0, fontSize: "0.875rem" }}>
                This page is general information based on HMRC and gov.uk guidance current in June 2026,
                not personal tax advice. Rates and thresholds change, the choice between mileage and
                actual costs is locked per vehicle, and the right answer depends on your figures. If a
                meaningful amount of tax is at stake, confirm with an accountant or HMRC before you
                decide. Always check the current-year figures on gov.uk for the exact amounts.
              </P>
            </Card>

            <div className="divider" style={{ margin: "2.5rem 0" }} />

            <SectionHead label="FAQ" title="Common questions" />
            {faqs.map((f) => (
              <Card key={f.q}>
                <H3>{f.q}</H3>
                <P>{f.a}</P>
              </Card>
            ))}
          </div>
        </section>

        {/* Related + CTA */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={wrap}>
            <div className="divider" style={{ marginBottom: "2.5rem" }} />
            <h2 className="heading" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)", marginBottom: "0.85rem" }}>
              Track every electric mile, automatically
            </h2>
            <p style={{ fontSize: "1rem", color: "var(--text-secondary)", lineHeight: 1.75, marginBottom: "1.5rem" }}>
              Whichever method you choose, it only works if your mileage log is real. MileClear records
              your trips on their own, applies the correct HMRC rate for each one, and shows EV drivers
              their charging cost per mile and nearby chargers. Free to track.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
              <a
                href="/hmrc-mileage-rates"
                style={{
                  background: "var(--amber-400)",
                  color: "var(--bg-deep)",
                  padding: "0.7rem 1.25rem",
                  borderRadius: "var(--r-md)",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                The HMRC mileage rates →
              </a>
              <a
                href="/business-mileage-guide"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-white)",
                  padding: "0.7rem 1.25rem",
                  borderRadius: "var(--r-md)",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                The full business mileage guide
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
