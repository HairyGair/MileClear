import Reveal from "./Reveal";

const features = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
    title: "Bulletproof tracking",
    desc: "Start your shift, drive, end your shift. Every mile is logged — even when you lose signal.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 01-3.46 0" />
      </svg>
    ),
    title: "Smart detection",
    desc: "Forgot to start a shift? MileClear notices you\u2019re driving and asks if you want to record.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
      </svg>
    ),
    title: "Tax savings counter",
    desc: "See exactly how much you\u2019re saving in real time. Watch it climb with every trip.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
    title: "Cheapest fuel nearby",
    desc: "Find the best fuel prices near you, filtered by your preferred brand.",
    alt: true,
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    title: "Milestones & streaks",
    desc: "Hit milestones, keep streaks alive, and get a daily scorecard after every shift.",
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
    title: "Works offline",
    desc: "No signal? No problem. Your trips are saved on your phone and sync when you\u2019re back online.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: "HMRC ready",
    desc: "Export your mileage log for Self Assessment. Classified, timestamped, audit-friendly.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
    title: "Know your real earnings",
    desc: "Optionally track what you earn across platforms. See your actual hourly rate after costs.",
  },
];

export default function Features() {
  return (
    <section id="features" className="section">
      <div className="container">
        <Reveal>
          <div className="features__head">
            <p className="label">Features</p>
            <h2 className="heading">Everything you need, nothing you don&apos;t</h2>
            <p className="subtext">
              Built from scratch for drivers who need reliable tracking, not another bloated app.
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
      </div>
    </section>
  );
}
