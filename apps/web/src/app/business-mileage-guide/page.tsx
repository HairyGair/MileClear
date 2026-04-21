import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BreadcrumbsJsonLd from "@/components/seo/BreadcrumbsJsonLd";

export const metadata: Metadata = {
  title: "The UK Business Mileage Guide",
  description:
    "A plain-English guide to business mileage in the UK: what counts, what HMRC expects, the fuel-and-mileage trap that trips most drivers up, and why it matters even if you only drive occasionally for work.",
  alternates: {
    canonical: "https://mileclear.com/business-mileage-guide",
  },
  openGraph: {
    title: "The UK Business Mileage Guide | MileClear",
    description:
      "What counts as business mileage, what HMRC expects, the fuel-and-mileage trap, and how to keep a log they will actually accept.",
    url: "https://mileclear.com/business-mileage-guide",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "The UK Business Mileage Guide | MileClear",
    description:
      "What counts, what HMRC expects, and the fuel-and-mileage trap that trips most drivers up.",
    images: ["/branding/og-image.png"],
  },
};

export default function BusinessMileageGuidePage() {
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "The UK Business Mileage Guide",
    description:
      "A plain-English guide to business mileage in the UK. What counts, what HMRC expects, and the fuel-and-mileage trap that trips most drivers up.",
    author: { "@type": "Person", name: "Anthony Gair" },
    publisher: {
      "@type": "Organization",
      name: "MileClear",
      logo: {
        "@type": "ImageObject",
        url: "https://mileclear.com/branding/logo-120x120.png",
      },
    },
    datePublished: "2026-04-21",
    dateModified: "2026-04-21",
    mainEntityOfPage: "https://mileclear.com/business-mileage-guide",
    inLanguage: "en-GB",
  };

  return (
    <>
      <BreadcrumbsJsonLd
        crumbs={[{ name: "Business Mileage Guide", path: "/business-mileage-guide" }]}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(article) }}
      />
      <Navbar />

      <main style={{ paddingTop: "68px" }}>
        {/* Hero */}
        <section className="section">
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "2rem" }}>
              <span className="label">Guide</span>
              <h1 className="heading" style={{ marginBottom: "1rem" }}>
                The UK Business Mileage Guide
              </h1>
              <p className="subtext" style={{ margin: "0 auto", maxWidth: 640 }}>
                Everything a UK driver needs to know about tracking business
                miles for tax, in plain English. Works whether you drive for
                gig platforms, trade jobs, client visits, or an employer who
                reimburses less than HMRC allows.
              </p>
            </div>
          </div>
        </section>

        {/* Why it matters */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={{ marginBottom: "1.5rem" }}>
              <span className="label">01 / Why it matters</span>
              <h2 className="heading" style={{ fontSize: "clamp(1.75rem, 3vw, 2.25rem)", marginBottom: "1rem" }}>
                Business mileage is money HMRC expects you to claim
              </h2>
            </div>
            <div style={{ fontSize: "1rem", color: "var(--text-secondary)", lineHeight: 1.8 }}>
              <p style={{ marginBottom: "1rem" }}>
                Every mile you drive for work in your own car or van is worth
                something to you at tax time. HMRC allows 45p per mile for the
                first 10,000 business miles in a tax year, and 25p after that.
                That number is not a suggestion. It is a tax deduction you are
                entitled to, and the only reason drivers miss it is poor
                record keeping.
              </p>
              <p style={{ marginBottom: "1rem" }}>
                A driver doing 12,000 business miles a year is looking at
                £5,000 off their taxable income. At 20% tax, that is £1,000 in
                their pocket. Drive 18,000 miles and the figure jumps to
                £6,500 deducted and £1,300 saved. Gig workers routinely cross
                20,000 miles a year and never claim a penny of it.
              </p>
              <p>
                There is also a personal side. Even if you do not drive for
                work, knowing how much you actually drive is useful. MileClear
                has a personal mode that tracks milestones, your running costs,
                and where your car is spending its life. Some of our best
                testers started tracking to save tax and stayed for the
                personal insight.
              </p>
            </div>
          </div>
        </section>

        {/* The trap */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={{ marginBottom: "1.5rem" }}>
              <span className="label">02 / The biggest trap</span>
              <h2 className="heading" style={{ fontSize: "clamp(1.75rem, 3vw, 2.25rem)", marginBottom: "1rem" }}>
                You cannot claim fuel AND mileage
              </h2>
            </div>

            <div
              style={{
                background: "rgba(239, 68, 68, 0.06)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                borderRadius: "var(--r-lg)",
                padding: "clamp(1.5rem, 3vw, 2rem)",
                marginBottom: "1.25rem",
              }}
            >
              <p style={{ fontSize: "1rem", color: "var(--text-primary)", lineHeight: 1.75, marginBottom: "1rem" }}>
                This is the single most common mistake we see in user
                imports. The 45p/25p HMRC rate is designed to cover fuel,
                insurance, servicing, tyres, road tax, and general wear. If
                you claim the mileage rate, <strong style={{ color: "var(--text-white)" }}>you cannot also claim those costs</strong>.
              </p>
              <p style={{ fontSize: "1rem", color: "var(--text-primary)", lineHeight: 1.75 }}>
                It feels wrong to throw away a petrol receipt. But that is
                exactly the point of the rate - it does the maths for you.
                Double-claiming fuel is the fastest way to trigger a HMRC
                enquiry, and if they find it, they will disallow the whole
                claim, not just the fuel portion.
              </p>
            </div>

            <div style={{ fontSize: "1rem", color: "var(--text-secondary)", lineHeight: 1.8 }}>
              <p style={{ marginBottom: "1rem" }}>
                The alternative is the &quot;actual costs&quot; method. You
                keep every fuel receipt, every service invoice, every
                insurance bill, and claim the business-use percentage of each.
                For most drivers it is more work and a smaller deduction. The
                mileage rate wins on simplicity and usually on value.
              </p>
              <p>
                Pick one method per vehicle and stick with it for as long as
                you own it. You cannot switch year to year.
              </p>
            </div>
          </div>
        </section>

        {/* What counts */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={{ marginBottom: "1.5rem" }}>
              <span className="label">03 / What counts</span>
              <h2 className="heading" style={{ fontSize: "clamp(1.75rem, 3vw, 2.25rem)", marginBottom: "1rem" }}>
                Which trips qualify as business mileage
              </h2>
              <p style={{ fontSize: "1rem", color: "var(--text-secondary)", lineHeight: 1.75 }}>
                The short version: any trip where you are driving for work,
                to a temporary workplace, or between job sites. The
                long version is mostly about edge cases, and those get their
                own page.
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gap: "0.75rem",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              }}
            >
              <div
                style={{
                  background: "rgba(16, 185, 129, 0.06)",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  borderRadius: "var(--r-md)",
                  padding: "1.25rem",
                }}
              >
                <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--emerald-400)", marginBottom: "0.75rem" }}>
                  Counts
                </div>
                <ul style={{ listStyle: "none", padding: 0, fontSize: "0.9375rem", color: "var(--text-primary)", lineHeight: 1.7 }}>
                  <li style={{ marginBottom: "0.5rem" }}>→ Trips between two job sites in one day</li>
                  <li style={{ marginBottom: "0.5rem" }}>→ Driving to a client or customer</li>
                  <li style={{ marginBottom: "0.5rem" }}>→ Picking up materials from a supplier</li>
                  <li style={{ marginBottom: "0.5rem" }}>→ Gig platform deliveries (Uber, Deliveroo, etc.)</li>
                  <li>→ Driving to a training course HMRC considers work-related</li>
                </ul>
              </div>

              <div
                style={{
                  background: "rgba(239, 68, 68, 0.04)",
                  border: "1px solid rgba(239, 68, 68, 0.25)",
                  borderRadius: "var(--r-md)",
                  padding: "1.25rem",
                }}
              >
                <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#fca5a5", marginBottom: "0.75rem" }}>
                  Does not count
                </div>
                <ul style={{ listStyle: "none", padding: 0, fontSize: "0.9375rem", color: "var(--text-primary)", lineHeight: 1.7 }}>
                  <li style={{ marginBottom: "0.5rem" }}>→ Your daily commute to a permanent workplace</li>
                  <li style={{ marginBottom: "0.5rem" }}>→ School run, even if you carry on to a job after</li>
                  <li style={{ marginBottom: "0.5rem" }}>→ Personal errands with a quick work stop</li>
                  <li style={{ marginBottom: "0.5rem" }}>→ Driving to a social lunch that was pitched as business</li>
                  <li>→ Volunteer trips that are not for a registered charity</li>
                </ul>
              </div>
            </div>

            <p
              style={{
                fontSize: "0.9375rem",
                color: "var(--text-muted)",
                marginTop: "1.25rem",
                lineHeight: 1.7,
              }}
            >
              The grey areas - home-to-first-job, trips that mix business with
              errands, volunteering - are covered in depth on the{" "}
              <a href="/what-counts-as-business-mileage" style={{ color: "var(--amber-400)", textDecoration: "underline", textUnderlineOffset: "3px" }}>
                what counts as business mileage
              </a>{" "}
              page.
            </p>
          </div>
        </section>

        {/* Record keeping */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={{ marginBottom: "1.5rem" }}>
              <span className="label">04 / Record keeping</span>
              <h2 className="heading" style={{ fontSize: "clamp(1.75rem, 3vw, 2.25rem)", marginBottom: "1rem" }}>
                The log HMRC will actually accept
              </h2>
              <p style={{ fontSize: "1rem", color: "var(--text-secondary)", lineHeight: 1.75 }}>
                A reconstructed spreadsheet built from memory at the end of
                the tax year is not a log. HMRC wants a &quot;contemporaneous
                record&quot; - something written down at the time, or close
                to it. Here is the minimum per trip:
              </p>
            </div>

            <ul
              style={{
                listStyle: "none",
                padding: 0,
                display: "grid",
                gap: "0.75rem",
                marginBottom: "1.5rem",
              }}
            >
              {[
                { k: "Date", v: "When the trip happened" },
                { k: "Start and end", v: "Postcode or full address, not &ldquo;depot&rdquo; or &ldquo;site&rdquo;" },
                { k: "Reason", v: "Client, job reference, or platform tag" },
                { k: "Distance", v: "Measured, not estimated. Odometer or GPS is fine" },
                { k: "Vehicle", v: "Registration plate of the car or van used" },
              ].map((item) => (
                <li
                  key={item.k}
                  style={{
                    background: "var(--bg-card-solid)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--r-md)",
                    padding: "1rem 1.25rem",
                    display: "grid",
                    gridTemplateColumns: "140px 1fr",
                    gap: "1rem",
                    alignItems: "baseline",
                  }}
                >
                  <strong style={{ fontFamily: "var(--font-display)", color: "var(--text-white)", fontSize: "0.9375rem" }}>
                    {item.k}
                  </strong>
                  <span style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: item.v }} />
                </li>
              ))}
            </ul>

            <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: 1.75 }}>
              HMRC can open an enquiry up to six years back. A clean log
              survives an enquiry. A spreadsheet that only appeared after
              HMRC asked for it does not.
            </p>
          </div>
        </section>

        {/* Calculating */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={{ marginBottom: "1.5rem" }}>
              <span className="label">05 / Calculating the deduction</span>
              <h2 className="heading" style={{ fontSize: "clamp(1.75rem, 3vw, 2.25rem)", marginBottom: "1rem" }}>
                How the 45p/25p split works
              </h2>
            </div>
            <div style={{ fontSize: "1rem", color: "var(--text-secondary)", lineHeight: 1.8 }}>
              <p style={{ marginBottom: "1rem" }}>
                The first 10,000 business miles in a tax year are at 45p per
                mile. Every mile after that, same tax year, is at 25p. The
                counter resets on 6 April each year.
              </p>
              <p style={{ marginBottom: "1rem" }}>
                One of our users - a gig worker splitting their time between
                Uber and Deliveroo - covered 723.8 miles in two weeks.
                Annualised, that is around 18,800 miles a year. Their HMRC
                deduction works out at £4,500 (first 10k at 45p) plus £2,200
                (remaining 8,800 at 25p), a total of <strong style={{ color: "var(--amber-400)" }}>£6,700</strong>.
                At a 20% tax rate, that is £1,340 saved.
              </p>
              <p>
                The full worked example, including how the rates apply to
                sole traders vs employees vs company directors, is on the{" "}
                <a href="/hmrc-mileage-rates" style={{ color: "var(--amber-400)", textDecoration: "underline", textUnderlineOffset: "3px" }}>
                  HMRC mileage rates page
                </a>
                .
              </p>
            </div>
          </div>
        </section>

        {/* Tools */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={{ marginBottom: "1.5rem" }}>
              <span className="label">06 / Tools</span>
              <h2 className="heading" style={{ fontSize: "clamp(1.75rem, 3vw, 2.25rem)", marginBottom: "1rem" }}>
                What you actually need to track this well
              </h2>
            </div>
            <div style={{ fontSize: "1rem", color: "var(--text-secondary)", lineHeight: 1.8 }}>
              <p style={{ marginBottom: "1rem" }}>
                You can do this with a notebook in the glove box. Plenty of
                drivers have for decades. What breaks down is the
                discipline - every trip, every day, without fail. Miss a
                week and you are reconstructing from memory, which HMRC does
                not love.
              </p>
              <p style={{ marginBottom: "1rem" }}>
                The alternative is a phone app that tracks automatically
                using GPS, tags each trip with a classification and
                platform, and produces a HMRC-ready export when you need it.
                MileClear is built for this specifically, for UK drivers -
                the free tier covers the tracking and the calculation, and
                the £4.99/month Pro tier adds the PDF and CSV exports you
                need for Self Assessment or to send to your accountant.
              </p>
              <p>
                Other apps exist. Pick one that saves you more time than it
                costs and stops you losing miles.
              </p>
            </div>
          </div>
        </section>

        {/* Personal side */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={{ marginBottom: "1.5rem" }}>
              <span className="label">07 / The personal angle</span>
              <h2 className="heading" style={{ fontSize: "clamp(1.75rem, 3vw, 2.25rem)", marginBottom: "1rem" }}>
                Why track mileage if you are not claiming tax
              </h2>
            </div>
            <div style={{ fontSize: "1rem", color: "var(--text-secondary)", lineHeight: 1.8 }}>
              <p style={{ marginBottom: "1rem" }}>
                Most people vastly underestimate how far they drive. If you
                had to guess, you would probably come in 30% low. And the
                things you do with that number - budgeting fuel, planning
                when to service the car, working out whether an EV makes
                sense, checking insurance policy limits - only work if the
                number is real.
              </p>
              <p style={{ marginBottom: "1rem" }}>
                The other side is time. A quiet year with a lot of local
                driving looks very different from a year with two big
                commutes and a few holiday runs. Seeing the pattern is more
                useful than most people expect - it shapes how you think
                about where you live, where you work, and whether you need
                the second car.
              </p>
              <p>
                Tracking for personal reasons is free in MileClear and
                always will be. You never have to turn on the tax side if
                you do not want to.
              </p>
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
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginTop: "1rem" }}>
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
                HMRC mileage rates in detail →
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
                href="/features"
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
                See MileClear features
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
