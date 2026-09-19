import Reveal from "./Reveal";

const ICON = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const car = (
  <svg {...ICON}>
    <path d="M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13" />
    <path d="M3 13h18v4a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H6v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
    <circle cx="7.5" cy="15.5" r="0.6" />
    <circle cx="16.5" cy="15.5" r="0.6" />
  </svg>
);

const box = (
  <svg {...ICON}>
    <path d="M21 8l-9-5-9 5 9 5 9-5z" />
    <path d="M3 8v8l9 5 9-5V8" />
    <path d="M12 13v8" />
  </svg>
);

const van = (
  <svg {...ICON}>
    <path d="M2 7h11v9H2z" />
    <path d="M13 10h4l3 3v3h-7z" />
    <circle cx="6" cy="17.5" r="1.5" />
    <circle cx="17" cy="17.5" r="1.5" />
  </svg>
);

const briefcase = (
  <svg {...ICON}>
    <rect x="3" y="7" width="18" height="12" rx="2" />
    <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
    <path d="M3 12h18" />
  </svg>
);

const spanner = (
  <svg {...ICON}>
    <path d="M15.5 3.5a5 5 0 0 0-6.2 6.2L4 15l5 5 5.3-5.3a5 5 0 0 0 6.2-6.2l-3 3-2.2-2.2z" />
  </svg>
);

const plug = (
  <svg {...ICON}>
    <path d="M13 2L5 14h6l-1 8 8-12h-6z" />
  </svg>
);

const route = (
  <svg {...ICON}>
    <circle cx="6" cy="18" r="2.5" />
    <circle cx="18" cy="6" r="2.5" />
    <path d="M8.5 18h5a3 3 0 0 0 0-6h-3a3 3 0 0 1 0-6h5" />
  </svg>
);

const audiences = [
  { icon: car, title: "Uber and ride-hail drivers", desc: "Uber, Bolt, FREE NOW, Ola", href: "/uber-mileage-tracker" },
  { icon: box, title: "Delivery drivers", desc: "Deliveroo, Just Eat, Uber Eats, Amazon Flex", href: "/deliveroo-mileage-tracker" },
  { icon: van, title: "Couriers and logistics", desc: "DPD, Evri, Yodel, Stuart, Gophr, Royal Mail", href: "/amazon-flex-mileage-tracker" },
  { icon: briefcase, title: "Sales reps and field workers", desc: "Anyone logging client visits or site trips", href: "/employee-mileage-tracker" },
  { icon: spanner, title: "Self-employed drivers", desc: "Tradespeople, estate agents, mobile services", href: "/self-employed-mileage-tracker" },
  { icon: plug, title: "Electric car drivers", desc: "Claim the same 55p a mile as petrol, while charging for pennies", href: "/ev-mileage-tracker" },
  { icon: route, title: "Personal drivers", desc: "Track your driving for fun, set goals, and earn achievements", href: "/features" },
];

export default function WhoItsFor() {
  return (
    <section className="section who">
      <div className="container who__center">
        <Reveal>
          <p className="label">Who it&apos;s for</p>
          <h2 className="heading">If you drive, MileClear is for you</h2>
        </Reveal>

        <Reveal delay="reveal-d1">
          <div className="who__grid">
            {audiences.map((a) => (
              <a key={a.title} href={a.href} className="who__card" style={{ textDecoration: "none", color: "inherit" }}>
                <span className="who__icon" aria-hidden="true">{a.icon}</span>
                <div>
                  <p className="who__card-title">{a.title}</p>
                  <p className="who__card-desc">{a.desc}</p>
                </div>
              </a>
            ))}
          </div>
        </Reveal>

        <Reveal delay="reveal-d2">
          <p className="who__note">
            Whether you drive 50 miles a week or 500, MileClear is the{" "}
            <a href="/free-mileage-tracker-uk" style={{ color: "var(--amber-400)", textDecoration: "underline" }}>free mileage tracker app</a>{" "}
            that helps you track it all and claim what you&apos;re owed.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
