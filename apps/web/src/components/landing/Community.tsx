// Discord community section — sits between FAQ and the footer on the
// landing page. Primary CTA: "Join the community". Secondary: a small
// reassurance line that the community is UK driver-focused.
//
// Phase 1D of the Discord roadmap (21 May 2026).

import Reveal from "./Reveal";

const DISCORD_INVITE = "https://discord.gg/mileclear";

const perks = [
  {
    icon: "🧾",
    title: "Tax help from real drivers",
    desc: "Uber, Deliveroo, Just Eat, sole-trader, PAYE — the answers come from people doing the same work.",
  },
  {
    icon: "📅",
    title: "Daily tax tips",
    desc: "Hand-picked tips on allowable expenses, HMRC deadlines, and Self Assessment — one a day, every day.",
  },
  {
    icon: "💎",
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
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
            />
          </a>
          <h2 className="community__title">
            Join the UK driver community on Discord
          </h2>
          <p className="community__subtitle">
            A friendly server for self-employed drivers, gig workers, and PAYE
            employees who claim mileage. Tax tips, peer help, deadline
            countdowns — and the bot does some of the work for you.
          </p>
        </Reveal>

        <ul className="community__perks" role="list">
          {perks.map((perk) => (
            <Reveal key={perk.title}>
              <li className="community__perk">
                <span className="community__perk-icon" aria-hidden>
                  {perk.icon}
                </span>
                <h3 className="community__perk-title">{perk.title}</h3>
                <p className="community__perk-desc">{perk.desc}</p>
              </li>
            </Reveal>
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/branding/discord/symbol-white.svg"
                alt=""
                className="community__cta-icon"
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
