export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__row">
        <span className="nav__logo" style={{ fontSize: "1.125rem" }}>
          <span className="logo-mark" style={{ width: 22, height: 22, fontSize: "0.625rem" }}>M</span>
          MileClear
        </span>

        <ul className="footer__links">
          <li><a href="#features" className="footer__link">Features</a></li>
          <li><a href="#pricing" className="footer__link">Pricing</a></li>
          <li><a href="#faq" className="footer__link">FAQ</a></li>
          <li><a href="#" className="footer__link">Privacy Policy</a></li>
          <li><a href="#" className="footer__link">Terms of Service</a></li>
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
