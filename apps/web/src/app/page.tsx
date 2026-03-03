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

export default function LandingPage() {
  return (
    <>
      <StructuredData />
      <Navbar />
      <main>
        <Hero />
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
