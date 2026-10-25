import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: { absolute: "MileClear for accountants and bookkeepers" },
  description:
    "Free for accountants and bookkeepers. See every driver client's miles, trips to sort and quarterly deadlines in one list. Clients choose to share, and can stop at any time.",
  alternates: { canonical: "https://mileclear.com/accountants" },
};

const POINTS = [
  {
    title: "One list for all your drivers.",
    body: "Miles this quarter, trips still to sort, earnings and expenses logged, last activity.",
  },
  {
    title: "Ask once, not fifty times.",
    body: "Send “Please sort your trips” to every client who needs it. It ticks itself off when they do.",
  },
  {
    title: "They stay in control.",
    body: "Clients choose to share. Business records only, unless they decide otherwise. They can stop sharing at any time.",
  },
];

const btn = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 48,
  padding: "0 22px",
  borderRadius: 12,
  fontWeight: 700,
  textDecoration: "none",
} as const;

export default function AccountantsPage() {
  return (
    <>
      <Navbar />
      <main style={{ paddingTop: "68px" }}>
        <section className="section">
          <div className="container" style={{ maxWidth: 860, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
              <span className="label">For accountants and bookkeepers</span>
              <h1 className="heading" style={{ marginBottom: "1rem" }}>
                Your drivers&apos; mileage, sorted before they send it.
              </h1>
              <p className="subtext" style={{ margin: "0 auto 1.75rem", maxWidth: 640 }}>
                Free for accountants and bookkeepers. See every driver client&apos;s miles, trips to sort and quarterly deadlines in one list.
              </p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                <Link href="/practice/signup" style={{ ...btn, background: "var(--amber-500)", color: "#030712" }}>
                  Create a free practice account
                </Link>
                <Link
                  href="/login?next=%2Fpractice"
                  style={{ ...btn, border: "1px solid var(--border-strong)", color: "var(--text-primary)" }}
                >
                  Already have one? Sign in
                </Link>
              </div>
            </div>

            <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              {POINTS.map((p) => (
                <div
                  key={p.title}
                  style={{
                    background: "var(--bg-card-solid)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--r-md)",
                    padding: "1.25rem",
                  }}
                >
                  <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 700, color: "var(--text-white)", marginBottom: "0.5rem" }}>
                    {p.title}
                  </h2>
                  <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", lineHeight: 1.65 }}>{p.body}</p>
                </div>
              ))}
            </div>

            <div style={{ marginTop: "2.5rem", color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: 1.7 }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem", fontWeight: 700, color: "var(--text-white)", marginBottom: "0.75rem" }}>
                How it works
              </h2>
              <ol style={{ paddingLeft: "1.25rem" }}>
                <li>Create your free practice account. Add colleagues if you like.</li>
                <li>Invite clients by email, paste a list, or share your join link and QR code.</li>
                <li>Each driver says yes in the MileClear app. Nothing is shared until they do.</li>
                <li>Work from one client list: chase trips to sort, download records, see which clients have a quarterly update ready.</li>
              </ol>
            </div>

            <p style={{ marginTop: "2rem", fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
              Quarterly updates in MileClear are tested with HMRC&apos;s test service only, and nothing is sent to HMRC yet. Your clients file their Self Assessment on GOV.UK or through you. Sending as your clients&apos; agent is planned and depends on HMRC; we will tell you when it is available.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
