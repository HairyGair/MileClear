import Reveal from "./Reveal";

const audiences = [
  { icon: "\uD83D\uDE97", title: "Uber and ride-hail drivers", desc: "Uber, Bolt, FREE NOW, Ola" },
  { icon: "\uD83D\uDCE6", title: "Delivery drivers", desc: "Deliveroo, Just Eat, Uber Eats, Amazon Flex" },
  { icon: "\uD83D\uDE9A", title: "Couriers and logistics", desc: "DPD, Evri, Yodel, Stuart, Gophr, Royal Mail" },
  { icon: "\uD83D\uDCBC", title: "Sales reps and field workers", desc: "Anyone logging client visits or site trips" },
  { icon: "\uD83D\uDD27", title: "Self-employed drivers", desc: "Tradespeople, estate agents, mobile services" },
  { icon: "\uD83D\uDE97", title: "Personal drivers", desc: "Track your driving for fun, set goals, and earn achievements" },
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
            Whether you drive 50 miles a week or 500, MileClear helps you track it all and claim what you&apos;re owed.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
