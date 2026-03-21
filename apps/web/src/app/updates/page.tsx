import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import TabSwitcher from "@/components/updates/TabSwitcher";
import "../updates.css";

export const metadata: Metadata = {
  title: "Updates",
  description:
    "MileClear release notes and the development blog. Follow the latest improvements to the app, engineering deep-dives, and guides for UK drivers.",
  alternates: {
    canonical: "https://mileclear.com/updates",
  },
  openGraph: {
    title: "Updates | MileClear",
    description:
      "Release notes and the development blog. Follow the latest improvements to the MileClear mileage tracker.",
    url: "https://mileclear.com/updates",
  },
};

export default function UpdatesPage() {
  return (
    <>
      <Navbar />

      <main className="updates">
        <div className="updates__glow" aria-hidden="true" />

        <div className="container">
          <header className="updates__header">
            <span className="label">What&apos;s New</span>
            <h1 className="updates__heading">Updates</h1>
            <p className="updates__sub">
              Release notes, engineering write-ups, and guides for UK drivers.
            </p>
          </header>

          <TabSwitcher defaultTab="releases" />
        </div>
      </main>

      <Footer />
    </>
  );
}
