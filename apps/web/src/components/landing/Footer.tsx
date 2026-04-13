export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__row">
        <span className="nav__logo" style={{ fontSize: "1.125rem" }}>
          <img src="/branding/logo-120x120.png" alt="" className="logo-mark" style={{ width: 24, height: 24 }} aria-hidden="true" />
          MileClear
        </span>

        <ul className="footer__links">
          <li><a href="/features" className="footer__link">Features</a></li>
          <li><a href="/pricing" className="footer__link">Pricing</a></li>
          <li><a href="/faq" className="footer__link">FAQ</a></li>
          <li><a href="/about" className="footer__link">About</a></li>
          <li><a href="/updates" className="footer__link">Updates</a></li>
          <li><a href="/support" className="footer__link">Support</a></li>
          <li><a href="/privacy" className="footer__link">Privacy</a></li>
          <li><a href="/terms" className="footer__link">Terms</a></li>
        </ul>

        <div className="footer__copy">
          <span>Made in the UK</span>
          <span className="footer__sep" />
          <span>&copy; 2026 MileClear</span>
        </div>
      </div>
    </footer>
  );
}
