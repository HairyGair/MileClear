export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__top">
          <div className="footer__brand">
            <span className="nav__logo" style={{ fontSize: "1.125rem" }}>
              <img
                src="/branding/logo-120x120.png"
                alt=""
                className="logo-mark"
                style={{ width: 24, height: 24 }}
                aria-hidden="true"
              />
              MileClear
            </span>
            <p className="footer__tagline">
              The UK mileage tracker built for drivers.
            </p>
          </div>

          <nav className="footer__columns" aria-label="Footer">
            <div className="footer__col">
              <h4 className="footer__col-title">Product</h4>
              <ul className="footer__col-list">
                <li><a href="/features" className="footer__link">Features</a></li>
                <li><a href="/pricing" className="footer__link">Pricing</a></li>
                <li><a href="/updates" className="footer__link">Updates</a></li>
                <li><a href="/design" className="footer__link">Design system</a></li>
              </ul>
            </div>

            <div className="footer__col">
              <h4 className="footer__col-title">Guides</h4>
              <ul className="footer__col-list">
                <li><a href="/hmrc-mileage-rates" className="footer__link">HMRC mileage rates</a></li>
                <li><a href="/business-mileage-guide" className="footer__link">Business mileage guide</a></li>
                <li><a href="/what-counts-as-business-mileage" className="footer__link">What counts as business mileage</a></li>
              </ul>
            </div>

            <div className="footer__col">
              <h4 className="footer__col-title">For drivers</h4>
              <ul className="footer__col-list">
                <li><a href="/employee-mileage-tracker" className="footer__link">Employees with work car</a></li>
                <li><a href="/delivery-driver-mileage-tracker" className="footer__link">Delivery drivers</a></li>
                <li><a href="/uber-mileage-tracker" className="footer__link">Uber drivers</a></li>
                <li><a href="/deliveroo-mileage-tracker" className="footer__link">Deliveroo riders</a></li>
                <li><a href="/just-eat-mileage-tracker" className="footer__link">Just Eat couriers</a></li>
                <li><a href="/amazon-flex-mileage-tracker" className="footer__link">Amazon Flex drivers</a></li>
                <li><a href="/dpd-mileage-tracker" className="footer__link">DPD ODFs</a></li>
                <li><a href="/evri-mileage-tracker" className="footer__link">Evri couriers</a></li>
                <li><a href="/mileclear-vs-mileiq" className="footer__link">vs MileIQ</a></li>
              </ul>
            </div>

            <div className="footer__col">
              <h4 className="footer__col-title">Company</h4>
              <ul className="footer__col-list">
                <li><a href="/about" className="footer__link">About</a></li>
                <li><a href="/faq" className="footer__link">FAQ</a></li>
                <li><a href="/support" className="footer__link">Support</a></li>
              </ul>
            </div>

            <div className="footer__col">
              <h4 className="footer__col-title">Legal</h4>
              <ul className="footer__col-list">
                <li><a href="/privacy" className="footer__link">Privacy</a></li>
                <li><a href="/terms" className="footer__link">Terms</a></li>
              </ul>
            </div>
          </nav>
        </div>

        <div className="footer__bottom">
          <div className="footer__copy">
            <span>Made in the UK</span>
            <span className="footer__sep" />
            <span>&copy; 2026 MileClear</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
