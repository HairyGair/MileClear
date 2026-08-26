import Link from "next/link";

/**
 * A small footer of Milesheet's own. The main MileClear footer links out to
 * gig driver landing pages, which is exactly what a company evaluating this
 * should not be shown, but a business page still needs its legal links and a
 * visible line back to the parent product.
 */
export default function MilesheetFooter() {
  return (
    <footer className="ms-footer">
      <div className="ms-container ms-footer__inner">
        <p className="ms-footer__line">
          Milesheet is part of{" "}
          <Link href="/" className="ms-footer__link">
            MileClear
          </Link>
          , UK mileage tracking. &copy; {new Date().getFullYear()} MileClear.
        </p>
        <nav className="ms-footer__nav">
          <Link href="/privacy" className="ms-footer__link">Privacy</Link>
          <Link href="/terms" className="ms-footer__link">Terms</Link>
          <Link href="/support" className="ms-footer__link">Support</Link>
          <a href="mailto:gair@mileclear.com" className="ms-footer__link">Contact</a>
        </nav>
      </div>
    </footer>
  );
}
