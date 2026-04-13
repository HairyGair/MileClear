import Reveal from "./Reveal";

const features = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
    title: "Auto trip recording and smart classification",
    desc: "MileClear detects when you start driving and records the trip automatically. It learns your routes - classify a trip three times and it's automatic from then on.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <path d="M12 18h.01" />
      </svg>
    ),
    title: "Live Activities",
    desc: "See your miles, speed, and timer on the lock screen and Dynamic Island. End a trip or dismiss a false detection with buttons right on the widget.",
    alt: true,
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
      </svg>
    ),
    title: "HMRC tax deductions",
    desc: "Your running tax deduction total updates with every trip. 45p/25p for cars, 24p for motorbikes, calculated automatically per tax year.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
    title: "Earnings and business insights",
    desc: "Track what you earn across platforms. See your real earnings per mile, per hour, and a weekly profit and loss breakdown.",
    alt: true,
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 01-3.46 0" />
      </svg>
    ),
    title: "Shift mode for gig workers",
    desc: "Clock on, do your deliveries, clock off. Your trips are grouped by shift with a scorecard showing distance, earnings, and an A-F grade.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
    title: "UK fuel prices",
    desc: "Find the cheapest fuel near you from over 8,300 UK stations. Government-mandated price data updated daily.",
    alt: true,
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
    title: "Saved locations and classification rules",
    desc: "Save your home, depot, or regular stops. Set rules like 'Mon-Fri 6am-2pm = Business' or 'Trips from Depot = Business' and trips classify themselves.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    title: "43 achievements and streaks",
    desc: "Unlock badges for milestones, keep your driving streak alive, and get weekly recaps with shareable stats.",
    alt: true,
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.55a11 11 0 0114.08 0" />
        <path d="M1.42 9a16 16 0 0121.16 0" />
        <path d="M8.53 16.11a6 6 0 016.95 0" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
    ),
    title: "Offline first",
    desc: "Every trip is saved to your phone first and synced when you have signal. No dropped trips, no missing data.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: "HMRC-ready exports",
    desc: "Download PDF trip reports and Self Assessment summaries with every trip dated, classified, and distance-verified. Ready for your tax return.",
    alt: true,
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
    ),
    title: "Your data, your control",
    desc: "Export everything or delete your account any time. Fully GDPR compliant. We never sell your data.",
    alt: true,
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a10 10 0 00-6.88 17.23l1.15-2.3A1 1 0 017.16 16h9.68a1 1 0 01.89.54l1.15 2.3A10 10 0 0012 2z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
    title: "Quick and easy setup",
    desc: "Sign in with Apple or email. Add your vehicle (or look it up by registration). You can be tracking in under a minute.",
  },
];

export default function Features() {
  return (
    <section id="features" className="section">
      <div className="container">
        <Reveal>
          <div className="features__head">
            <p className="label">Features</p>
            <h2 className="heading">Everything you need to track, claim, and earn more</h2>
            <p className="subtext">
              Built from scratch for UK drivers. Automatic tracking, smart classification that learns your patterns, real tax savings, and the tools to understand what your driving is actually worth.
            </p>
          </div>
        </Reveal>

        <Reveal delay="reveal-d2">
          <div className="features__grid">
            {features.map((f) => (
              <div key={f.title} className="f-card">
                <div className={`f-card__icon${f.alt ? " f-card__icon--alt" : ""}`}>
                  {f.icon}
                </div>
                <h3 className="f-card__title">{f.title}</h3>
                <p className="f-card__desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay="reveal-d3">
          <div style={{ textAlign: "center", marginTop: "2rem" }}>
            <a href="/features" style={{ color: "var(--amber-400)", fontFamily: "var(--font-display)", fontSize: "0.9375rem", textDecoration: "none" }}>
              See all features in detail &rarr;
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
