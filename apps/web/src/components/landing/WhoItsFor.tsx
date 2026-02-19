import Reveal from "./Reveal";

const audiences = [
  { icon: "\uD83D\uDE97", title: "Uber & delivery drivers", desc: "Deliveroo, Just Eat, Uber Eats, Amazon Flex" },
  { icon: "\uD83D\uDCE6", title: "Couriers", desc: "DPD, Evri, Yodel, Stuart, Gophr" },
  { icon: "\uD83D\uDCBC", title: "Sales reps & field workers", desc: "Anyone logging business miles" },
  { icon: "\uD83D\uDD27", title: "Self-employed drivers", desc: "Tradespeople, estate agents, mobile mechanics" },
];

export default function WhoItsFor() {
  return (
    <section className="section who">
      <div className="container who__center">
        <Reveal>
          <p className="label">Who it&apos;s for</p>
          <h2 className="heading">Built for drivers who drive for a living</h2>
        </Reveal>

        <Reveal delay="reveal-d1">
          <div className="who__grid">
            {audiences.map((a) => (
              <div key={a.title} className="who__card">
                <span className="who__icon" role="img" aria-hidden="true">{a.icon}</span>
                <div>
                  <p className="who__card-title">{a.title}</p>
                  <p className="who__card-desc">{a.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay="reveal-d2">
          <p className="who__note">
            If you drive for work and want to claim what you&apos;re owed, MileClear is for you.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
