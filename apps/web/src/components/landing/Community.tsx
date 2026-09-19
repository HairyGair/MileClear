// Discord community section - sits between FAQ and the footer on the
// landing page. Primary CTA: "Join the community". Secondary: a small
// reassurance line that the community is UK driver-focused.
//
// Phase 1D of the Discord roadmap (21 May 2026).

import Reveal from "./Reveal";

const FEAT_ICON = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const receipt = (
  <svg {...FEAT_ICON}>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
    <path d="M9 8h6M9 12h6" />
  </svg>
);

const calendar = (
  <svg {...FEAT_ICON}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);

const badge = (
  <svg {...FEAT_ICON}>
    <circle cx="12" cy="9" r="5" />
    <path d="M8.5 13.5L7 21l5-2.5L17 21l-1.5-7.5" />
  </svg>
);

const DISCORD_INVITE = "https://discord.gg/Wxnvr3rzaq";

const perks = [
  {
    icon: receipt,
    title: "Tax help from real drivers",
    desc: "Uber, Deliveroo, Just Eat, sole trader, PAYE. The answers come from people doing the same work.",
  },
  {
    icon: calendar,
    title: "Daily tax tips",
    desc: "Hand-picked tips on allowable expenses, HMRC deadlines and Self Assessment, one a day.",
  },
  {
    icon: badge,
    title: "Pro perks",
    desc: "Connect your MileClear account and Pro subscribers get an automatic Pro Member badge.",
  },
];

export default function Community() {
  return (
    <section className="section community">
      <div className="container community__center">
        <Reveal>
          <p className="eyebrow">Community</p>
          <a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noopener noreferrer"
            className="community__brand-link"
            aria-label="MileClear on Discord"
          >
            <img
              src="/branding/discord/symbol-blurple.svg"
              alt=""
              className="community__brand-mark"
              width={48}
              height={48}
            />
          </a>
          <h2 className="community__title">
            Join the UK driver community on Discord
          </h2>
          <p className="community__subtitle">
            A friendly server for self-employed drivers, gig workers, and PAYE
            employees who claim mileage. Tax tips, peer help, deadline
            countdowns, and the bot does some of the work for you.
          </p>
        </Reveal>

        <ul className="community__perks" role="list">
          {perks.map((perk) => (
            // Reveal sits inside the <li>, never between the list and its
            // items, so the list semantics survive for screen readers.
            <li className="community__perk" key={perk.title}>
              <Reveal>
                <span className="community__perk-icon" aria-hidden>
                  {perk.icon}
                </span>
                <h3 className="community__perk-title">{perk.title}</h3>
                <p className="community__perk-desc">{perk.desc}</p>
              </Reveal>
            </li>
          ))}
        </ul>

        <Reveal>
          <div className="community__cta-row">
            <a
              className="btn btn--primary community__cta"
              href={DISCORD_INVITE}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Join the MileClear Discord community"
            >
              <img
                src="/branding/discord/symbol-white.svg"
                alt=""
                className="community__cta-icon"
                width={22}
                height={22}
              />
              Join the Discord
            </a>
            <p className="community__cta-hint">
              Free. No app required. UK drivers only.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
