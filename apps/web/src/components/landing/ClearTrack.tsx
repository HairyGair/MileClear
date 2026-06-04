import Reveal from "./Reveal";

const ICON = {
  stroke: "currentColor",
  fill: "none",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
};

const points = [
  {
    title: "Built to never miss a mile",
    desc:
      "Every trip you don't capture is money off your tax claim. ClearTrack is built to catch them all - including the short hops, the shop run, the school drop, that other apps quietly let slip.",
    icon: (
      <svg {...ICON}>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4" />
        <line x1="12" y1="2" x2="12" y2="5" />
        <line x1="12" y1="19" x2="12" y2="22" />
        <line x1="2" y1="12" x2="5" y2="12" />
        <line x1="19" y1="12" x2="22" y2="12" />
      </svg>
    ),
  },
  {
    title: "Runs where the app can't be shut down",
    desc:
      "ClearTrack works down at your phone's own location level, so it keeps recording when the app is closed, in the background, or in your pocket. It never relies on the app staying awake - which is exactly where other trackers fall over.",
    icon: (
      <svg {...ICON}>
        <polygon points="12 2 2 7 12 12 22 7 12 2" />
        <polyline points="2 17 12 22 22 17" />
        <polyline points="2 12 12 17 22 12" />
      </svg>
    ),
  },
  {
    title: "Catches the moment you set off",
    desc:
      "It reads your phone's motion and movement to recognise the start of a drive and begin recording on its own - no button, no reminder, no “did I remember to start it?”",
    icon: (
      <svg {...ICON}>
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
  {
    title: "Unlimited, free, the same for everyone",
    desc:
      "No monthly drive cap (MileIQ stops free users at 40). Two trips a week or twenty a day, ClearTrack records every one - so your HMRC deduction reflects every mile you actually drove.",
    icon: (
      <svg {...ICON}>
        <path d="M18.178 8c-2.298 0-4.07 2-5.178 4-1.108 2-2.88 4-5.178 4a3.822 3.822 0 1 1 0-8c2.298 0 4.07 2 5.178 4 1.108 2 2.88 4 5.178 4a3.822 3.822 0 1 0 0-8z" />
      </svg>
    ),
  },
];

export default function ClearTrack() {
  return (
    <section id="cleartrack" className="section">
      <div className="container">
        <Reveal>
          <div className="features__head">
            <p className="label">Powered by ClearTrack</p>
            <h2 className="heading">The engine that actually catches your trips</h2>
            <p className="subtext">
              A mileage tracker is only worth anything if it records your trips. Too many
              don&apos;t - they miss short journeys, give up when the app is closed, or quietly
              stop in the background. For something you lean on at tax time, that isn&apos;t good
              enough. So we rebuilt trip detection from the ground up and called it ClearTrack.
            </p>
          </div>
        </Reveal>

        <Reveal delay="reveal-d2">
          <div className="features__grid">
            {points.map((p) => (
              <div key={p.title} className="f-card">
                <div className="f-card__icon">{p.icon}</div>
                <h3 className="f-card__title">{p.title}</h3>
                <p className="f-card__desc">{p.desc}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
