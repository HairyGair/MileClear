import Image from "next/image";
import Reveal from "./Reveal";

// Horizontal screenshot gallery. Sits between Features and WhoItsFor.
// Scrolls horizontally with snap-to-card at every width — fixed-width
// cards, so the layout is indifferent to how many shots are in the
// array (a desktop "fit them all" override crushed the row when the
// gallery grew and shrank again). Each card gets a short caption
// underneath so visitors can scan the gallery without reading
// paragraphs.

interface Shot {
  file: string;
  caption: string;
  sub: string;
}

const shots: Shot[] = [
  {
    file: "iphone-04-live-activity.png",
    caption: "One tap to track",
    sub: "Or none: it starts on its own when you drive",
  },
  {
    file: "iphone-05-auto-classify.png",
    caption: "Learns your routes",
    sub: "Auto-classifies after three matching trips",
  },
  {
    file: "iphone-11-split-trip.png",
    caption: "Splits multi-drop runs",
    sub: "Finds the stops and cuts one long trip into every drop",
  },
  {
    file: "iphone-02-first-tax-return.png",
    caption: "First-time Self Assessment",
    sub: "Step by step, from your figures to the SA103 boxes",
  },
  {
    file: "iphone-08-free-tier.png",
    caption: "Free does the heavy lifting",
    sub: "Tracking and the tax maths cost nothing",
  },
];

export default function Screenshots() {
  return (
    <section id="screenshots" className="section screenshots">
      <div className="container">
        <Reveal>
          <div className="screenshots__head">
            <p className="label">See it in action</p>
            <h2 className="heading">What it looks like on your phone</h2>
            <p className="subtext">
              Five screens from a normal week: the drive, the classification, the tax. Swipe
              through them. Every one is what you see on day one.
            </p>
          </div>
        </Reveal>

        <Reveal delay="reveal-d2">
          <div className="screenshots__rail" role="list">
            {shots.map((s) => (
              <figure key={s.file} className="screenshots__card" role="listitem">
                <div className="screenshots__frame">
                  <Image
                    src={`/screenshot-source/iphone/${s.file}`}
                    alt={`MileClear: ${s.caption}`}
                    width={420}
                    height={910}
                    sizes="(max-width: 768px) 70vw, 280px"
                    style={{ width: "100%", height: "auto", display: "block" }}
                  />
                </div>
                <figcaption className="screenshots__caption">
                  <div className="screenshots__caption-title">{s.caption}</div>
                  <div className="screenshots__caption-sub">{s.sub}</div>
                </figcaption>
              </figure>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
