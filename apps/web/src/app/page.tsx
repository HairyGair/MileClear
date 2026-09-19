import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import Problem from "@/components/landing/Problem";
import ClearTrack from "@/components/landing/ClearTrack";
import Features from "@/components/landing/Features";
import Screenshots from "@/components/landing/Screenshots";
import WhoItsFor from "@/components/landing/WhoItsFor";
import Pricing from "@/components/landing/Pricing";
import EarlyAccess from "@/components/landing/EarlyAccess";
import FAQ from "@/components/landing/FAQ";
import Community from "@/components/landing/Community";
import Footer from "@/components/landing/Footer";
import StructuredData from "@/components/landing/StructuredData";

import {
  ACTIVE_DRIVERS_DISPLAY,
  APP_STORE_RATING,
  APP_STORE_RATING_COUNT,
  MILES_TRACKED_DISPLAY,
} from "@/data/stats";

const APP_STORE_URL = "https://apps.apple.com/app/mileclear/id6759671005";

function SocialProof() {
  return (
    <section
      aria-label="How much driving MileClear has recorded"
      style={{
        maxWidth: "var(--max-w)",
        margin: "0 auto",
        padding: "0 var(--px) 2.5rem",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "1rem",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "0.8rem",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--text-muted, var(--text-secondary))",
          margin: 0,
        }}
      >
        Recorded by MileClear drivers so far
      </p>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1.5rem",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <span style={proofItem}>
          <strong style={proofFigure}>{MILES_TRACKED_DISPLAY}</strong> miles
        </span>
        <span style={proofDivider}>|</span>
        <span style={proofItem}>
          <strong style={proofFigure}>{ACTIVE_DRIVERS_DISPLAY}</strong> drivers tracking last month
        </span>
        <span style={proofDivider}>|</span>
        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...proofItem, textDecoration: "none" }}
        >
          <strong style={proofFigure}>{APP_STORE_RATING}</strong> on the App Store, {APP_STORE_RATING_COUNT} ratings
        </a>
      </div>
    </section>
  );
}

const proofItem = {
  fontFamily: "var(--font-body)",
  fontSize: "0.9rem",
  color: "var(--text-secondary)",
} as const;

const proofFigure = {
  color: "var(--text-white)",
  fontWeight: 700,
} as const;

const proofDivider = { color: "var(--text-secondary)", opacity: 0.4 } as const;

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
        at the approved rates (55p per mile for the first 10,000 business miles
        from 2026-27, 25p after that, 24p for motorbikes), and provides shift-based
        earnings tracking with platform tagging for Uber, Deliveroo, Amazon
        Flex, and more. Available free on the App Store with a Pro tier at
        £4.99/month for tax exports and business intelligence.{" "}
        <a href="/about" style={{ color: "var(--amber-400)", textDecoration: "none" }}>
          Learn more about MileClear &rarr;
        </a>
      </p>
    </section>
  );
}

export default function LandingPage() {
  return (
    <>
      <StructuredData />
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <Hero />
        <SocialProof />
        <Problem />
        <ClearTrack />
        <Features />
        <Screenshots />
        <WhoItsFor />
        <Pricing />
        <EarlyAccess />
        <Community />
        <FAQ />
        <AboutSection />
      </main>
      <Footer />
    </>
  );
}
