import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import "../quickbooks.css";

// Disconnect-confirmation page. Intuit redirects users here when
// they revoke MileClear's access from inside QuickBooks Online
// (Apps → Connected apps → MileClear → Disconnect). We acknowledge
// the disconnect + tell them how to reconnect.
//
// Server-side cleanup happens lazily - the next time MileClear tries
// to use the QBO connection and gets a 401, we mark it inactive.
// We don't try to identify the user from this page because Intuit
// doesn't carry MileClear auth in the redirect.
//
// Phase A of the QuickBooks roadmap (21 May 2026).

export const metadata: Metadata = {
  title: "QuickBooks disconnected · MileClear",
  description:
    "Your MileClear ↔ QuickBooks connection has been removed. Reconnect any time from inside the MileClear app.",
  alternates: { canonical: "https://mileclear.com/quickbooks/disconnected" },
  robots: { index: false, follow: false },
};

export default function QuickBooksDisconnected() {
  return (
    <>
      <Navbar />
      <main className="qb-page qb-disconnected">
        <div className="container qb-disconnected__inner">
          <div className="qb-disconnected__icon" aria-hidden>
            ✓
          </div>
          <h1 className="qb-disconnected__title">QuickBooks disconnected</h1>
          <p className="qb-disconnected__body">
            MileClear no longer has access to your QuickBooks Online account.
            Nothing in QuickBooks was deleted - only the live link between the
            two services was removed.
          </p>
          <p className="qb-disconnected__body">
            Your MileClear data is still safe and your past pushes remain in
            QuickBooks (you can review them under <em>Apps → Connected
            apps → MileClear</em> if you ever reconnect, or delete them in
            QuickBooks itself).
          </p>

          <div className="qb-disconnected__next">
            <h2 className="qb-disconnected__next-title">Want to reconnect?</h2>
            <ol className="qb-disconnected__steps">
              <li>Open MileClear on your phone</li>
              <li>Settings → Integrations → QuickBooks</li>
              <li>Tap <strong>Connect</strong> and authorise via QuickBooks</li>
            </ol>
          </div>

          <div className="qb-disconnected__ctas">
            <Link href="/quickbooks" className="btn btn--secondary">
              About the integration
            </Link>
            <Link href="/" className="btn btn--primary">
              Back to MileClear
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
