import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import Problem from "@/components/landing/Problem";
import Features from "@/components/landing/Features";
import WhoItsFor from "@/components/landing/WhoItsFor";
import Pricing from "@/components/landing/Pricing";
import EarlyAccess from "@/components/landing/EarlyAccess";
import FAQ from "@/components/landing/FAQ";
import Footer from "@/components/landing/Footer";
import StructuredData from "@/components/landing/StructuredData";

function AboutSection() {
  return (
    <section
      id="about"
      style={{
        maxWidth: "var(--max-w)",
        margin: "0 auto",
        padding: "0 var(--px) 3rem",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "clamp(0.9rem, 1.5vw, 1rem)",
          lineHeight: "1.8",
          color: "var(--text-secondary)",
          borderLeft: "2px solid var(--amber-500)",
          paddingLeft: "1.25rem",
          maxWidth: "72ch",
        }}
      >
        MileClear is a UK mileage tracking app built for gig economy workers,
        delivery drivers, and self-employed professionals. It automatically
        records GPS trips in the background, calculates HMRC mileage deductions
        at the approved rates (45p per mile for the first 10,000 business miles,
        25p per mile after that, 24p for motorbikes), and provides shift-based
        earnings tracking with platform tagging for Uber, Deliveroo, Amazon
        Flex, and more. Available free on the App Store with a Pro tier at
        £4.99/month for tax exports and business intelligence.
      </p>
    </section>
  );
}

export default function LandingPage() {
  return (
    <>
      <StructuredData />
      <Navbar />
      <main>
        <Hero />
        <AboutSection />
        <Problem />
        <Features />
        <WhoItsFor />
        <Pricing />
        <EarlyAccess />
        <FAQ />
      </main>
      <Footer />
    </>
  );
}
